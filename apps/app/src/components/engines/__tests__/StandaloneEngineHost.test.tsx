import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { useSelector } from '@xstate/react'
import { StandaloneEngineHost } from '../StandaloneEngineHost'
import { usePipelineActor } from '@/hooks/usePipelineActor'

vi.mock('@/providers/PipelineSettingsProvider', () => ({
  PipelineSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePipelineSettings: () => ({
    pipelineSettings: { reviewRejectThreshold: 40, reviewApproveScore: 90, reviewMaxIterations: 5, defaultProviders: {} },
    creditSettings: { costBlog: 200, costVideo: 200, costShorts: 100, costPodcast: 150, costCanonicalCore: 80, costReview: 20, costResearchSurface: 60, costResearchMedium: 100, costResearchDeep: 180 },
    isLoaded: true,
  }),
}))

function FakeEngine() {
  const actor = usePipelineActor()
  React.useEffect(() => {
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: { ideaId: 'idea-1', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c' } })
  }, [actor])
  return <span data-testid="fake">ok</span>
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ data: null, error: null }) }))
})

describe('StandaloneEngineHost', () => {
  it('renders children inside an actor provider and fires onStageComplete when the stage result appears', async () => {
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
      const actor = usePipelineActor()
      const value = useSelector(actor, (s) => JSON.stringify(s.value))
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
})
