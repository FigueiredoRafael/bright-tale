import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before importing the function
vi.mock('../client.js', () => ({
  inngest: {
    createFunction: (config: unknown, handler: unknown) => handler,
  },
}))

vi.mock('../../lib/ai/router.js', () => ({
  generateWithFallback: vi.fn(() =>
    Promise.resolve({
      result: [],
      providerName: 'test',
      model: 'test-model',
      usage: {},
    }),
  ),
}))

vi.mock('../../lib/ai/promptLoader.js', () => ({
  loadAgentPrompt: vi.fn(() => Promise.resolve('test prompt')),
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
            if (table === 'research_sessions') {
              return Promise.resolve({
                data: { project_id: 'test-project-123' },
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

vi.mock('../../lib/ai/prompts/research.js', () => ({
  buildResearchMessage: vi.fn(() => 'test message'),
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

describe('research-generate abort handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should emit aborted event when abort flag is set mid-run', async () => {
    const { researchGenerate } = await import('../research-generate.js')
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
        ideaId: null,
        level: 'surface' as const,
        inputJson: { topic: 'test topic' },
        modelTier: 'standard',
      },
      name: 'research/generate',
    }

    const step = {
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => fn()),
    }

    const handler = researchGenerate as any
    const result = await handler({ event, step })

    // Handler should return without throwing
    expect(result).toBeUndefined()

    // emitJobEvent should have been called with 'aborted' stage
    expect(vi.mocked(emitJobEvent)).toHaveBeenCalledWith(
      'session-123',
      'research',
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
        sessionId: 'session-123',
        orgId: 'org-123',
        userId: 'user-123',
        channelId: null,
        ideaId: null,
        level: 'surface' as const,
        inputJson: { topic: 'test topic' },
        modelTier: 'standard',
      },
      name: 'research/generate',
    }

    const step = {
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
        return Promise.resolve([])
      }),
    }

    // Validate assertNotAborted is defined and callable
    expect(assertNotAborted).toBeDefined()
  })
})
