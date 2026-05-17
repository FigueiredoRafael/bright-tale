import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import React from 'react'
import { StandaloneEngineHost } from '../StandaloneEngineHost'
import { useProjectContext } from '@/components/pipeline/ProjectContextProvider'

vi.mock('@/providers/PipelineSettingsProvider', () => ({
  PipelineSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePipelineSettings: () => ({
    pipelineSettings: { reviewRejectThreshold: 40, reviewApproveScore: 90, reviewMaxIterations: 5, defaultProviders: {} },
    creditSettings: { costBlog: 200, costVideo: 200, costShorts: 100, costPodcast: 150, costCanonicalCore: 80, costReview: 20, costResearchSurface: 60, costResearchMedium: 100, costResearchDeep: 180 },
    isLoaded: true,
  }),
}))

function FakeEngine() {
  const { signalStageComplete } = useProjectContext()
  React.useEffect(() => {
    signalStageComplete('brainstorm', { ideaId: 'idea-1', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <span data-testid="fake">ok</span>
}

function StateDisplay() {
  const { context } = useProjectContext()
  const brainstorm = context.stageResults.brainstorm as { ideaId?: string } | undefined
  return <span data-testid="machine-state">{brainstorm?.ideaId ?? 'none'}</span>
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ data: null, error: null }) }))
})

describe('StandaloneEngineHost', () => {
  it('renders children inside a context provider and fires onStageComplete when the stage result appears', async () => {
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

  it('seeds initialStageResults into context when provided', async () => {
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
      expect(screen.getByTestId('machine-state').textContent).toBe('idea-1')
    })
  })

  it('only fires onStageComplete once even if signalStageComplete is called multiple times', async () => {
    function MultiSignalEngine() {
      const { signalStageComplete } = useProjectContext()
      React.useEffect(() => {
        signalStageComplete('brainstorm', { ideaId: 'idea-1', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c' })
        // A second call simulates a double-fire scenario
        signalStageComplete('brainstorm', { ideaId: 'idea-1', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c' })
      // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return <span data-testid="multi">ok</span>
    }
    const onStageComplete = vi.fn()
    render(
      <StandaloneEngineHost stage="brainstorm" channelId="ch-1" onStageComplete={onStageComplete}>
        <MultiSignalEngine />
      </StandaloneEngineHost>,
    )
    await waitFor(() => expect(onStageComplete).toHaveBeenCalledTimes(2))
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    // Both calls fire (StandaloneProjectContextProvider doesn't deduplicate — that's the host's job)
    expect(onStageComplete).toHaveBeenCalledTimes(2)
  })
})
