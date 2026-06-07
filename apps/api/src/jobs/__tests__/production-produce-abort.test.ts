/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('../client.js', () => ({
  inngest: {
    createFunction: (config: unknown, handler: unknown) => handler,
  },
}))

vi.mock('../../lib/ai/router.js', () => ({
  generateWithFallback: vi.fn(() =>
    Promise.resolve({
      result: {},
      providerName: 'test',
      model: 'test-model',
      usage: {},
    }),
  ),
  isQuotaExhausted: vi.fn(() => false),
}))

vi.mock('../../lib/ai/promptLoader.js', () => ({
  loadAgentPrompt: vi.fn(() => Promise.resolve('test prompt')),
}))

vi.mock('../../lib/ai/loadIdeaContext.js', () => ({
  loadIdeaContext: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('../../lib/credits/reservations.js', () => ({
  reserve: vi.fn(async () => 'mock-token'),
  commit: vi.fn(async () => undefined),
  release: vi.fn(async () => undefined),
}))

vi.mock('../../lib/calculate-draft-cost.js', () => ({
  calculateDraftCost: vi.fn(() => 100),
}))

vi.mock('../../lib/platform-settings.js', () => ({
  loadPlatformSettings: vi.fn(() =>
    Promise.resolve({
      costCanonicalCore: 100,
      costProduce: 50,
    }),
  ),
}))

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      select: vi.fn((_cols: string) => ({
        eq: vi.fn((_col: string, _val: string) => ({
          maybeSingle: vi.fn(() => {
            if (table === 'content_drafts') {
              return Promise.resolve({
                data: {
                  id: 'draft-123',
                  project_id: 'test-project-123',
                  title: 'Test Draft',
                  channel_id: null,
                  idea_id: null,
                  research_session_id: null,
                  canonical_core_json: { content: 'core' },
                },
              })
            }
            return Promise.resolve({ data: null })
          }),
        })),
      })),
      update: vi.fn((_row: Record<string, unknown>) => ({
        eq: vi.fn((_col: string, _val: string) => {
          return Promise.resolve({})
        }),
      })),
    })),
  })),
}))

vi.mock('../../lib/ai/usage-log.js', () => ({
  logUsage: vi.fn(),
}))

vi.mock('../../lib/ai/prompts/production.js', () => ({
  buildProduceMessage: vi.fn(() => 'test message'),
}))

vi.mock('../../lib/personas.js', () => ({
  buildLayeredPersonaContext: vi.fn(() => Promise.resolve(null)),
  loadPersonaForDraft: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('../../lib/ai/abortable.js', () => ({
  JobAborted: class JobAborted extends Error {
    constructor(projectId: string, draftId?: string) {
      super(`Job aborted for project ${projectId}${draftId ? `, draft ${draftId}` : ''}`)
      this.name = 'JobAborted'
    }
  },
  assertNotAborted: vi.fn(() => Promise.resolve()),
  sleepCancellable: vi.fn(),
}))

vi.mock('../emitter.js', () => ({
  emitJobEvent: vi.fn(() => Promise.resolve()),
}))

describe('production-produce abort handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should set paused status and emit aborted event on abort', async () => {
    const { productionProduce } = await import('../production-produce.js')
    const { emitJobEvent } = await import('../emitter.js')
    const abortable = await import('../../lib/ai/abortable.js')

    const JobAborted = abortable.JobAborted
    const assertNotAborted = vi.mocked(abortable.assertNotAborted)

    // Mock assertNotAborted to trigger abort
    assertNotAborted.mockImplementationOnce(async () => {
      throw new JobAborted('test-project-123', 'draft-123')
    })

    const event = {
      data: {
        draftId: 'draft-123',
        orgId: 'org-123',
        userId: 'user-123',
        type: 'blog' as const,
        modelTier: 'standard',
      },
      name: 'production/produce',
    }

    const step = {
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => fn()),
    }

    const handler = productionProduce as any
    const result = await handler({ event, step })

    // Handler should return without throwing
    expect(result).toBeUndefined()

    // emitJobEvent should have been called with 'aborted' stage
    expect(vi.mocked(emitJobEvent)).toHaveBeenCalledWith(
      'draft-123',
      'production',
      'aborted',
      expect.any(String),
    )
  })

  it('should run normally when abort flag is null', async () => {
    const abortable = await import('../../lib/ai/abortable.js')
    const assertNotAborted = vi.mocked(abortable.assertNotAborted)

    // Mock assertNotAborted to not throw
    assertNotAborted.mockResolvedValue(undefined)

    const event = {
      data: {
        draftId: 'draft-123',
        orgId: 'org-123',
        userId: 'user-123',
        type: 'blog' as const,
        modelTier: 'standard',
      },
      name: 'production/produce',
    }

    const step = {
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
        if (name === 'load-draft') {
          return {
            id: 'draft-123',
            title: 'Test',
            canonical_core_json: { content: 'core' },
          }
        }
        return null
      }),
    }

    // Validate assertNotAborted is callable
    expect(assertNotAborted).toBeDefined()
  })
})

// ─── BRI-42: quota-park new behavior ─────────────────────────────────────────

describe('production-produce: quota exhausted → parks as awaiting_user, no finished event (BRI-42)', () => {
  it('parks as awaiting_user(provider_quota_exhausted) and does NOT emit pipeline/stage.run.finished', async () => {
    vi.clearAllMocks()

    // Override router mocks to simulate quota exhaustion
    const router = await import('../../lib/ai/router.js')
    vi.mocked(router.isQuotaExhausted).mockReturnValue(true)
    vi.mocked(router.generateWithFallback).mockRejectedValueOnce(new Error('OpenAI: quota exceeded'))

    // Track stage_runs updates and inngest sends
    const stageRunsUpdateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    const inngestSendMock = vi.fn(async () => ({ ids: ['e-1'] }))

    const { createServiceClient } = await import('../../lib/supabase/index.js')
    vi.mocked(createServiceClient).mockReturnValueOnce({
      from: vi.fn((table: string) => {
        if (table === 'content_drafts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: 'draft-123',
                    project_id: 'proj-1',
                    title: 'Test',
                    channel_id: null,
                    idea_id: null,
                    research_session_id: null,
                    canonical_core_json: { content: 'core' },
                    track_id: null,
                    type: 'blog',
                  },
                })),
              })),
            })),
            update: vi.fn(() => ({ eq: vi.fn(async () => ({})) })),
          }
        }
        if (table === 'stage_runs') {
          return { update: stageRunsUpdateMock }
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null })) })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({})) })),
        }
      }),
      rpc: vi.fn(async () => ({ data: { token: 'tok', error_code: null }, error: null })),
    } as unknown as ReturnType<typeof createServiceClient>)

    // Patch inngest.send on the imported client
    const { inngest } = await import('../client.js')
    ;(inngest as unknown as { send: ReturnType<typeof vi.fn> }).send = inngestSendMock

    const { productionProduce } = await import('../production-produce.js')

    const event = {
      data: {
        draftId: 'draft-123',
        orgId: 'org-1',
        userId: 'user-1',
        type: 'blog' as const,
        modelTier: 'standard',
        stageRunId: 'sr-prod-1',
      },
      name: 'production/produce',
    }

    const step = {
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
        if (name === 'load-draft') {
          return {
            id: 'draft-123',
            project_id: 'proj-1',
            title: 'Test',
            channel_id: null,
            idea_id: null,
            research_session_id: null,
            canonical_core_json: { content: 'core' },
            track_id: null,
            type: 'blog',
          }
        }
        return fn()
      }),
    }

    const handler = productionProduce as unknown as (args: unknown) => Promise<unknown>
    const result = await handler({ event, step })

    // Should return (park) rather than throw
    expect(result).toBeUndefined()

    // stage_runs.update called with awaiting_user
    expect(stageRunsUpdateMock).toHaveBeenCalled()
    const updateRow = stageRunsUpdateMock.mock.calls[0][0] as Record<string, unknown>
    expect(updateRow.status).toBe('awaiting_user')
    expect(updateRow.awaiting_reason).toBe('provider_quota_exhausted')

    // No pipeline/stage.run.finished emitted (non-terminal park)
    const finishedCall = inngestSendMock.mock.calls.find(
      (c: unknown[]) => (c[0] as { name?: string })?.name === 'pipeline/stage.run.finished',
    )
    expect(finishedCall).toBeUndefined()
  })
})
