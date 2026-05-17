import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { useSelector } from '@xstate/react'
import { StandaloneEngineHost } from '../StandaloneEngineHost'
import { PipelineActorContext } from '@/providers/PipelineActorProvider'
import { useOptionalProjectContext } from '@/components/pipeline/ProjectContextProvider'

vi.mock('@/providers/PipelineSettingsProvider', () => ({
  PipelineSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePipelineSettings: () => ({
    pipelineSettings: { reviewRejectThreshold: 40, reviewApproveScore: 90, reviewMaxIterations: 5, defaultProviders: {} },
    creditSettings: { costBlog: 200, costVideo: 200, costShorts: 100, costPodcast: 150, costCanonicalCore: 80, costReview: 20, costResearchSurface: 60, costResearchMedium: 100, costResearchDeep: 180 },
    isLoaded: true,
  }),
}))

/**
 * Engine that sends a completion event via PipelineActorContext directly.
 * Slice 14.4: tests no longer go through PipelineActorProvider component —
 * they read from PipelineActorContext directly, matching how engines work.
 */
function FakeEngine() {
  const actor = React.useContext(PipelineActorContext)
  React.useEffect(() => {
    actor?.send({ type: 'BRAINSTORM_COMPLETE', result: { ideaId: 'idea-1', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c' } })
  }, [actor])
  return <span data-testid="fake">ok</span>
}

/**
 * Detects whether a ProjectContextProvider is present in the tree.
 * Standalone engines should NOT have one when no real projectId is supplied.
 */
function ProjectContextPresenceDetector() {
  const ctx = useOptionalProjectContext()
  return <span data-testid="has-project-ctx">{ctx ? 'yes' : 'no'}</span>
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ data: null, error: null }) }))
})

describe('StandaloneEngineHost', () => {
  it('renders children inside an actor context and fires onStageComplete when the stage result appears', async () => {
    const onStageComplete = vi.fn()
    render(
      <StandaloneEngineHost stage="brainstorm" channelId="ch-1" onStageComplete={onStageComplete}>
        <FakeEngine />
      </StandaloneEngineHost>,
    )
    expect(screen.getByTestId('fake')).toBeTruthy()
    await waitFor(() => expect(onStageComplete).toHaveBeenCalledTimes(1))
    expect(onStageComplete).toHaveBeenCalledWith('brainstorm', expect.objectContaining({ ideaId: 'idea-1' }))
  })

  it('navigates the machine to the requested stage when stage !== brainstorm', async () => {
    function StateDisplay() {
      const actor = React.useContext(PipelineActorContext)
      const value = useSelector(actor ?? undefined, (s) => JSON.stringify(s?.value))
      return <span data-testid="machine-state">{value}</span>
    }
    render(
      <StandaloneEngineHost
        stage="research"
        channelId="ch-1"
        initialStageResults={{ brainstorm: { ideaId: 'idea-1', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c', completedAt: '2026-01-01' } }}
        onStageComplete={() => {}}
      >
        <StateDisplay />
      </StandaloneEngineHost>,
    )
    await waitFor(() => {
      const text = screen.getByTestId('machine-state').textContent
      expect(JSON.parse(text ?? '{}')).toMatchObject({ research: 'idle' })
    })
  })

  it('only fires onStageComplete once even if the actor emits further snapshots', async () => {
    const onStageComplete = vi.fn()
    render(
      <StandaloneEngineHost stage="brainstorm" channelId="ch-1" onStageComplete={onStageComplete}>
        <FakeEngine />
      </StandaloneEngineHost>,
    )
    await waitFor(() => expect(onStageComplete).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 20))
    expect(onStageComplete).toHaveBeenCalledTimes(1)
  })

  it('does not mount ProjectContextProvider for synthetic standalone projects (no real projectId)', async () => {
    render(
      <StandaloneEngineHost stage="brainstorm" channelId="ch-1" onStageComplete={() => {}}>
        <ProjectContextPresenceDetector />
      </StandaloneEngineHost>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('has-project-ctx').textContent).toBe('no')
    })
  })

  it('does not mount ProjectContextProvider when projectId is absent', async () => {
    render(
      <StandaloneEngineHost stage="research" channelId="ch-1" onStageComplete={() => {}}>
        <ProjectContextPresenceDetector />
      </StandaloneEngineHost>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('has-project-ctx').textContent).toBe('no')
    })
  })
})
