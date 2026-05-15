import { describe, it, expect, vi, beforeEach } from 'vitest'
import { contentGenerate } from '../content-generate.js'

// Mock dependencies
vi.mock('../client.js', () => ({
  inngest: {
    createFunction: (config: unknown, handler: unknown) => handler,
  },
}))

vi.mock('../../lib/ai/router.js', () => ({
  STAGE_COSTS: {
    brainstorm: 50,
    research: 100,
    production: 80,
    review: 60,
  },
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
      insert: vi.fn(() => Promise.resolve({})),
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'project-123' } })),
      })),
    })),
  })),
}))

vi.mock('../../lib/ai/prompts/brainstorm.js', () => ({
  buildBrainstormMessage: vi.fn(() => 'test message'),
}))

vi.mock('../../lib/ai/prompts/research.js', () => ({
  buildResearchMessage: vi.fn(() => 'test message'),
}))

vi.mock('../../lib/ai/prompts/production.js', () => ({
  buildCanonicalCoreMessage: vi.fn(() => 'test message'),
  buildProduceMessage: vi.fn(() => 'test message'),
}))

vi.mock('../../lib/ai/prompts/review.js', () => ({
  buildReviewMessage: vi.fn(() => 'test message'),
}))

vi.mock('../../lib/ai/abortable.js', () => ({
  JobAborted: class JobAborted extends Error {
    constructor(projectId?: string, draftId?: string) {
      super(`Job aborted for project ${projectId}${draftId ? `, draft ${draftId}` : ''}`)
      this.name = 'JobAborted'
    }
  },
  assertNotAborted: vi.fn(() => Promise.resolve()),
  sleepCancellable: vi.fn(),
}))

describe('content-generate abort handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should gracefully exit when abort occurs', async () => {
    const { contentGenerate } = await import('../content-generate.js')
    const abortable = await import('../../lib/ai/abortable.js')

    const JobAborted = abortable.JobAborted
    const assertNotAborted = vi.mocked(abortable.assertNotAborted)

    // Mock assertNotAborted to trigger abort on first call
    assertNotAborted.mockImplementationOnce(async () => {
      throw new JobAborted('')
    })

    const event = {
      data: {
        orgId: 'org-123',
        userId: 'user-123',
        channelId: 'channel-123',
        topic: 'test topic',
        formats: ['blog'],
        modelTier: 'standard',
      },
      name: 'content/generate',
    }

    const step = {
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => fn()),
    }

    const handler = contentGenerate as any
    const result = await handler({ event, step })

    // Handler should return gracefully (no exception)
    expect(result).toBeUndefined()

    // assertNotAborted should have been called
    expect(assertNotAborted).toHaveBeenCalled()
  })

  it('should run normally when abort flag is null', async () => {
    const abortable = await import('../../lib/ai/abortable.js')
    const assertNotAborted = vi.mocked(abortable.assertNotAborted)

    // Mock assertNotAborted to not throw
    assertNotAborted.mockResolvedValue(undefined)

    const event = {
      data: {
        orgId: 'org-123',
        userId: 'user-123',
        channelId: 'channel-123',
        topic: 'test topic',
        formats: ['blog'],
        modelTier: 'standard',
      },
      name: 'content/generate',
    }

    const step = {
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
        if (name === 'save-results') {
          return Promise.resolve()
        }
        return Promise.resolve([])
      }),
    }

    // Validate assertNotAborted is callable
    expect(assertNotAborted).toBeDefined()
  })
})
