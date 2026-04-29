import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { BrainstormEngine } from '../BrainstormEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

const STUB_IDEAS = [
  { id: 'idea-1', idea_id: 'BC-IDEA-001', title: 'Test Idea', verdict: 'viable', target_audience: 'devs', core_tension: 'tension' },
]
const STUB_SESSION = { id: 'bs-1', input_json: { topic: 'test topic' } }

function mountWithActor(mode: 'generate' | 'import' = 'generate') {
  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'proj-1',
      channelId: 'ch-1',
      projectTitle: 'T',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
      creditSettings: DEFAULT_CREDIT_SETTINGS,
    },
  }).start()
  const utils = render(
    <PipelineActorProvider value={actor}>
      <BrainstormEngine
        mode={mode}
        // Pre-populate ideas and session to bypass the SSE generation flow in tests.
        // The test verifies the machine-level dispatch, not the generate flow itself.
        initialIdeas={mode === 'generate' ? STUB_IDEAS : undefined}
        initialSession={mode === 'generate' ? STUB_SESSION : undefined}
        preSelectedIdeaId={mode === 'generate' ? 'idea-1' : undefined}
      />
    </PipelineActorProvider>,
  )
  return { actor, ...utils }
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/api/ideas/library')) {
        return {
          ok: true,
          json: async () => ({
            data: { ideas: [{ id: 'lib-idea-1', idea_id: 'BC-LIB-001', title: 'Library Idea', verdict: 'viable', target_audience: 'devs', core_tension: 'library tension' }] },
            error: null,
          }),
        } as Response
      }
      if (String(url).includes('/api/agent-prompts')) {
        return { ok: true, json: async () => ({ data: null, error: null }) } as Response
      }
      return { ok: true, json: async () => ({ data: null, error: null }) } as Response
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BrainstormEngine', () => {
  it('dispatches BRAINSTORM_COMPLETE and advances to research when user confirms idea', async () => {
    const user = userEvent.setup()
    const { actor } = mountWithActor('generate')

    const confirmBtn = await screen.findByRole('button', { name: /next.*research/i })
    await user.click(confirmBtn)

    expect(actor.getSnapshot().context.stageResults.brainstorm?.ideaId).toBe('idea-1')
    expect(actor.getSnapshot().value).toMatchObject({ research: 'idle' })
  })

  it('does not render a Back button on brainstorm (first stage, no navigation back)', () => {
    mountWithActor('generate')
    // Brainstorm is the first stage — there is no previous stage to go back to.
    expect(screen.queryByRole('button', { name: /^back$/i })).toBeNull()
  })

  it('import mode dispatches BRAINSTORM_COMPLETE from ImportPicker selection', async () => {
    const user = userEvent.setup()
    const { actor } = mountWithActor('import')

    const item = await screen.findByText('Library Idea')
    await user.click(item)

    expect(actor.getSnapshot().context.stageResults.brainstorm?.ideaId).toBe('lib-idea-1')
    expect(actor.getSnapshot().value).toMatchObject({ research: 'idle' })
  })
})
