import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { PipelineSettingsProvider, usePipelineSettings } from '@/providers/PipelineSettingsProvider'
import { DEFAULT_PIPELINE_SETTINGS } from '@/components/engines/types'

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

  it('falls back to defaults when API returns an error envelope', async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({ data: null, error: { code: 'SERVER_ERROR', message: 'DB failed' } }),
    } as Response)
    render(
      <PipelineSettingsProvider>
        <TestConsumer />
      </PipelineSettingsProvider>
    )
    // isLoaded becomes true (finally runs) and defaults are kept
    await waitFor(() => expect(screen.getByTestId('approve-score')).toBeTruthy())
    expect(screen.getByTestId('approve-score').textContent).toBe(
      String(DEFAULT_PIPELINE_SETTINGS.reviewApproveScore)
    )
  })
})
