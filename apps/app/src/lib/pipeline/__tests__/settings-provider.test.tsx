import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { PipelineSettingsProvider, usePipelineSettings } from '@/providers/PipelineSettingsProvider'

vi.stubGlobal('fetch', vi.fn())

function TestConsumer() {
  const { pipelineSettings, creditSettings, isLoaded } = usePipelineSettings()
  if (!isLoaded) return <div>loading</div>
  return (
    <div>
      <span data-testid="approve-score">{pipelineSettings.reviewApproveScore}</span>
      <span data-testid="cost-blog">{creditSettings.costBlog}</span>
    </div>
  )
}

describe('PipelineSettingsProvider', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes('pipeline-settings')) {
        return {
          json: async () => ({
            data: {
              reviewRejectThreshold: 40,
              reviewApproveScore: 90,
              reviewMaxIterations: 5,
              defaultProviders: {},
            },
            error: null,
          }),
        } as Response
      }
      return {
        json: async () => ({
          data: {
            costBlog: 250,
            costVideo: 200,
            costShorts: 100,
            costPodcast: 150,
            costCanonicalCore: 80,
            costReview: 20,
            costResearchSurface: 60,
            costResearchMedium: 100,
            costResearchDeep: 180,
          },
          error: null,
        }),
      } as Response
    })
  })

  it('fetches and exposes settings to consumers', async () => {
    render(
      <PipelineSettingsProvider>
        <TestConsumer />
      </PipelineSettingsProvider>
    )

    await waitFor(() => expect(screen.getByTestId('approve-score')).toBeTruthy())
    expect(screen.getByTestId('approve-score').textContent).toBe('90')
    expect(screen.getByTestId('cost-blog').textContent).toBe('250')
  })

  it('shows loading state before fetch completes', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))
    render(
      <PipelineSettingsProvider>
        <TestConsumer />
      </PipelineSettingsProvider>
    )
    expect(screen.getByText('loading')).toBeTruthy()
  })
})
