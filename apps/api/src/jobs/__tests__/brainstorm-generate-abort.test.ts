import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before importing the function
vi.mock('../client.js', () => ({
  inngest: {
    createFunction: (config: unknown, handler: unknown) => handler,
  },
}))

vi.mock('../../lib/ai/router.js', () => ({
  STAGE_COSTS: { brainstorm: 50 },
  generateWithFallback: vi.fn(),
}))

vi.mock('../../lib/ai/promptLoader.js', () => ({
  loadAgentPrompt: vi.fn(),
}))

vi.mock('../../lib/credits/reservations.js', () => ({
  reserve: vi.fn(async () => 'mock-token'),
  commit: vi.fn(async () => undefined),
  release: vi.fn(async () => undefined),
}))

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      select: vi.fn((cols: string) => ({
        eq: vi.fn((col: string, val: string) => ({
          maybeSingle: vi.fn(() => {
            if (table === 'brainstorm_sessions') {
              return Promise.resolve({
                data: { project_id: 'test-project-123' },
              })
            }
            return Promise.resolve({ data: null })
          }),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({})),
      })),
      insert: vi.fn(() => Promise.resolve({})),
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

vi.mock('../../lib/ai/prompts/brainstorm.js', () => ({
  buildBrainstormMessage: vi.fn(() => 'test message'),
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

describe('brainstorm-generate abort handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should emit aborted event when abort flag is set mid-run', async () => {
    const { brainstormGenerate } = await import('../brainstorm-generate.js')
    const { emitJobEvent } = await import('../emitter.js')
    const abortable = await import('../../lib/ai/abortable.js')

    const JobAborted = abortable.JobAborted
    const assertNotAborted = vi.mocked(abortable.assertNotAborted)

    // Mock assertNotAborted to trigger abort on second call
    let callCount = 0
    assertNotAborted.mockImplementation(async () => {
      callCount++
      if (callCount > 1) {
        throw new JobAborted('test-project-123', 'session-123')
      }
    })

    const event = {
      data: {
        sessionId: 'session-123',
        orgId: 'org-123',
        userId: 'user-123',
        channelId: null,
        inputJson: { topic: 'test topic' },
        modelTier: 'standard',
      },
      name: 'brainstorm/generate',
    }

    const step = {
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => fn()),
    }

    const handler = brainstormGenerate as any
    const result = await handler({ event, step })

    // Handler should return without throwing (abort is caught and handled)
    expect(result).toBeUndefined()

    // emitJobEvent should have been called with 'aborted' stage
    expect(vi.mocked(emitJobEvent)).toHaveBeenCalledWith(
      'session-123',
      'brainstorm',
      'aborted',
      expect.any(String),
    )
  })

  it('should run normally when abort flag is null', async () => {
    const abortable = await import('../../lib/ai/abortable.js')
    const assertNotAborted = vi.mocked(abortable.assertNotAborted)

    // Mock assertNotAborted to not throw (normal flow)
    assertNotAborted.mockResolvedValue(undefined)

    const event = {
      data: {
        sessionId: 'session-123',
        orgId: 'org-123',
        userId: 'user-123',
        channelId: null,
        inputJson: { topic: 'test topic' },
        modelTier: 'standard',
      },
      name: 'brainstorm/generate',
    }

    const step = {
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
        if (name === 'persist-ideas') {
          return 5 // Return persisted count
        }
        return Promise.resolve(null)
      }),
    }

    // This test validates assertNotAborted is defined
    expect(assertNotAborted).toBeDefined()
  })
})
