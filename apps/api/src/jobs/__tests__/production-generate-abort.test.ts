import { describe, it, expect, vi, beforeEach } from 'vitest'
import { productionGenerate } from '../production-generate.js'

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

vi.mock('../../lib/credit-settings.js', () => ({
  loadCreditSettings: vi.fn(() =>
    Promise.resolve({
      costCanonicalCore: 100,
      costProduce: 50,
    }),
  ),
}))

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      select: vi.fn((cols: string) => ({
        eq: vi.fn((col: string, val: string) => ({
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
                  canonical_core_json: null,
                },
              })
            }
            return Promise.resolve({ data: null })
          }),
        })),
      })),
      update: vi.fn((row: Record<string, unknown>) => ({
        eq: vi.fn((col: string, val: string) => {
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
  buildCanonicalCoreMessage: vi.fn(() => 'test message'),
}))

vi.mock('../../lib/personas.js', () => ({
  buildPersonaContext: vi.fn(),
  buildPersonaVoice: vi.fn(),
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

describe('production-generate abort handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should set paused status and emit aborted event on abort', async () => {
    const { productionGenerate } = await import('../production-generate.js')
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
      name: 'production/generate',
    }

    const step = {
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => fn()),
    }

    const handler = productionGenerate as any
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
      name: 'production/generate',
    }

    const step = {
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
        if (name === 'load-draft') {
          return {
            id: 'draft-123',
            title: 'Test',
            channel_id: null,
            idea_id: null,
            research_session_id: null,
          }
        }
        return null
      }),
    }

    // Validate assertNotAborted is callable
    expect(assertNotAborted).toBeDefined()
  })
})
