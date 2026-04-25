import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

afterEach(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      json: async () => ({ data: { id: 'd-1', status: 'approved' }, error: null }),
    }),
  )
})

// Mock providers
vi.mock('@/providers/PipelineSettingsProvider', () => ({
  usePipelineSettings: () => ({
    pipelineSettings: {
      reviewRejectThreshold: 40,
      reviewApproveScore: 90,
      reviewMaxIterations: 5,
      defaultProviders: {},
    },
    creditSettings: {
      costBlog: 200,
      costVideo: 200,
      costShorts: 100,
      costPodcast: 150,
      costCanonicalCore: 80,
      costReview: 20,
      costResearchSurface: 60,
      costResearchMedium: 100,
      costResearchDeep: 180,
    },
    isLoaded: true,
  }),
  PipelineSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

// Stub engines
vi.mock('@/components/engines/BrainstormEngine', () => ({
  BrainstormEngine: () => <div data-testid="brainstorm-engine">BrainstormEngine</div>,
}))

vi.mock('@/components/engines/ResearchEngine', () => ({
  ResearchEngine: () => <div data-testid="research-engine">ResearchEngine</div>,
}))

vi.mock('@/components/engines/DraftEngine', () => ({
  DraftEngine: () => <div data-testid="draft-engine">DraftEngine</div>,
}))

vi.mock('@/components/engines/ReviewEngine', () => ({
  ReviewEngine: () => <div data-testid="review-engine">ReviewEngine</div>,
}))

vi.mock('@/components/engines/AssetsEngine', () => ({
  AssetsEngine: () => <div data-testid="assets-engine">AssetsEngine</div>,
}))

vi.mock('@/components/engines/PreviewEngine', () => ({
  PreviewEngine: () => <div data-testid="preview-engine">PreviewEngine</div>,
}))

vi.mock('@/components/engines/PublishEngine', () => ({
  PublishEngine: () => <div data-testid="publish-engine">PublishEngine</div>,
}))

import { PipelineOrchestrator } from '../PipelineOrchestrator'

describe('PipelineOrchestrator', () => {
  it('renders without crashing when isLoaded=true', () => {
    const { container } = render(
      <PipelineOrchestrator projectId="p" channelId="c" projectTitle="Test" />,
    )
    expect(container).toBeTruthy()
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('renders without crashing with initialPipelineState', () => {
    const { container } = render(
      <PipelineOrchestrator
        projectId="p"
        channelId="c"
        projectTitle="Test"
        initialPipelineState={{
          mode: 'step-by-step',
          currentStage: 'draft',
          stageResults: {
            brainstorm: {
              ideaId: 'i',
              ideaTitle: 't',
              ideaVerdict: 'v',
              ideaCoreTension: 'c',
              completedAt: '2026-01-01',
            },
          },
          autoConfig: {},
        }}
      />,
    )
    expect(container).toBeTruthy()
  })

  it('renders CompletedStageSummary with onRedoFrom prop', () => {
    const { container } = render(
      <PipelineOrchestrator
        projectId="p"
        channelId="c"
        projectTitle="Test"
        initialPipelineState={{
          mode: 'step-by-step',
          currentStage: 'research',
          stageResults: {
            brainstorm: {
              ideaId: 'i',
              ideaTitle: 't',
              ideaVerdict: 'v',
              ideaCoreTension: 'c',
              completedAt: 'x',
            },
          },
          autoConfig: {},
        }}
      />,
    )
    // Verify "Redo" button is in the rendered HTML (CompletedStageSummary renders with onRedoFrom prop)
    expect(container.innerHTML).toContain('Redo')
  })
})
