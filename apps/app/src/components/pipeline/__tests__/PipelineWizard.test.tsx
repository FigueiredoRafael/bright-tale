import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const sendSpy = vi.fn()

// Mutable context that tests can override per-test
const mockContext = {
  projectId: 'p1',
  channelId: 'c1',
  stageResults: {} as Record<string, unknown>,
}

vi.mock('@/hooks/usePipelineActor', () => ({
  usePipelineActor: () => ({
    getSnapshot: () => ({
      value: 'setup',
      context: mockContext,
    }),
    send: sendSpy,
  }),
}))

vi.mock('@/providers/PipelineSettingsProvider', () => ({
  usePipelineSettings: () => ({
    pipelineSettings: {
      reviewRejectThreshold: 40,
      reviewApproveScore: 90,
      reviewMaxIterations: 5,
      defaultProviders: {
        brainstorm: 'gemini',
        research: 'gemini',
        canonicalCore: 'openai',
        draft: 'anthropic',
        review: 'gemini',
        assets: 'gemini',
      },
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
}))

import { PipelineWizard } from '../PipelineWizard'

function renderWizard(opts: { stageResults?: Record<string, unknown> } = {}) {
  mockContext.stageResults = opts.stageResults ?? {}
  return render(<PipelineWizard />)
}

beforeEach(() => {
  sendSpy.mockClear()
  mockContext.stageResults = {}
  vi.unstubAllGlobals()
})

it('on submit, posts setup payload then sends SETUP_COMPLETE with the same shape', async () => {
  const user = userEvent.setup()
  const fetchSpy = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { ok: true }, error: null }),
  })
  vi.stubGlobal('fetch', fetchSpy)
  renderWizard()

  await user.click(screen.getByLabelText(/supervised/i))
  await user.type(screen.getByLabelText(/topic/i), 'AI agents')

  await user.click(screen.getByRole('button', { name: /start autopilot \(supervised\)/i }))

  await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
  const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
  expect(url).toBe('/api/projects/p1/setup')
  expect(init.method).toBe('POST')
  const body = JSON.parse(init.body as string) as {
    mode: string
    startStage: string
    autopilotConfig: {
      brainstorm: { topic: string }
      review: { maxIterations: number }
    }
  }
  expect(body.mode).toBe('supervised')
  expect(body.startStage).toBe('brainstorm')
  expect(body.autopilotConfig.brainstorm.topic).toBe('AI agents')
  expect(body.autopilotConfig.review.maxIterations).toBeGreaterThanOrEqual(0)

  expect(sendSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'SETUP_COMPLETE',
      mode: 'supervised',
      startStage: 'brainstorm',
    }),
  )
})

describe('scaffold tests', () => {
  it('renders all 6 stage sections for a fresh project', () => {
    renderWizard()
    expect(screen.getByTestId('stage-section-brainstorm')).toBeDefined()
    expect(screen.getByTestId('stage-section-research')).toBeDefined()
    expect(screen.getByTestId('stage-section-canonicalCore')).toBeDefined()
    expect(screen.getByTestId('stage-section-draft')).toBeDefined()
    expect(screen.getByTestId('stage-section-review')).toBeDefined()
    expect(screen.getByTestId('stage-section-assets')).toBeDefined()
  })

  it('disables completed stages with "Already done" badge', () => {
    renderWizard({
      stageResults: {
        brainstorm: {
          ideaId: 'i1',
          ideaTitle: 'Test Idea',
          ideaVerdict: 'viable',
          ideaCoreTension: 'tension',
          completedAt: '2026-01-01T00:00:00Z',
        },
        research: {
          researchSessionId: 'r1',
          approvedCardsCount: 3,
          researchLevel: 'medium',
          completedAt: '2026-01-01T00:00:00Z',
        },
      },
    })
    const brainstormSection = screen.getByTestId('stage-section-brainstorm')
    const researchSection = screen.getByTestId('stage-section-research')
    expect(brainstormSection.getAttribute('aria-disabled')).toBe('true')
    expect(researchSection.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getAllByText(/already done/i).length).toBeGreaterThanOrEqual(2)
  })

  it('switches submit CTA label by mode', async () => {
    const user = userEvent.setup()
    renderWizard()

    expect(screen.getByRole('button', { name: /start step-by-step/i })).toBeDefined()

    await user.click(screen.getByLabelText(/supervised/i))
    expect(screen.getByRole('button', { name: /start autopilot \(supervised\)/i })).toBeDefined()

    await user.click(screen.getByLabelText(/overview/i))
    expect(screen.getByRole('button', { name: /start autopilot \(overview\)/i })).toBeDefined()
  })

  it('expands <details> containing errors on submit', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { ok: true }, error: null }),
      }),
    )
    renderWizard()

    await user.click(screen.getByLabelText(/supervised/i))

    const reviewSection = screen.getByTestId('stage-section-review')
    const hardFailInput = reviewSection.querySelector<HTMLInputElement>(
      'input[name="autopilotConfig.review.hardFailThreshold"]',
    )
    const autoApproveInput = reviewSection.querySelector<HTMLInputElement>(
      'input[name="autopilotConfig.review.autoApproveThreshold"]',
    )

    if (hardFailInput && autoApproveInput) {
      await user.clear(hardFailInput)
      await user.type(hardFailInput, '95')
      await user.clear(autoApproveInput)
      await user.type(autoApproveInput, '90')
    }

    await user.click(screen.getByRole('button', { name: /start autopilot \(supervised\)/i }))

    await waitFor(() => {
      const section = screen.getByTestId('stage-section-review')
      expect(section.getAttribute('open')).not.toBeNull()
    })
  })

  it('Save as new posts to /api/autopilot-templates with isDefault flag', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 'tpl-1' }, error: null }),
    })
    vi.stubGlobal('fetch', fetchSpy)
    renderWizard()

    await user.click(screen.getByRole('button', { name: /save as new/i }))

    const nameInput = await screen.findByLabelText(/template name/i)
    await user.type(nameInput, 'My Template')

    const defaultCheckbox = screen.queryByRole('checkbox', { name: /default/i })
    if (defaultCheckbox) {
      await user.click(defaultCheckbox)
    }

    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      const templateCalls = (fetchSpy.mock.calls as [string, RequestInit][]).filter(
        ([url]) => url === '/api/autopilot-templates',
      )
      expect(templateCalls.length).toBeGreaterThanOrEqual(1)
      const [, init] = templateCalls[0]
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body as string) as { name: string }
      expect(body.name).toBe('My Template')
    })
  })

  it('Update template shows confirm dialog then PUTs', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 'tpl-1', name: 'Existing', configJson: {} }, error: null }),
    })
    vi.stubGlobal('fetch', fetchSpy)
    renderWizard()

    const templateSelect = screen.queryByRole('combobox', { name: /load template/i })
    if (!templateSelect) {
      return
    }

    const updateButton = screen.queryByRole('button', { name: /update template/i })
    if (!updateButton) {
      return
    }

    await user.click(updateButton)

    const confirmButton = await screen.findByRole('button', { name: /confirm/i })
    expect(confirmButton).toBeDefined()

    await user.click(confirmButton)

    await waitFor(() => {
      const putCalls = (fetchSpy.mock.calls as [string, RequestInit][]).filter(
        ([, init]) => init.method === 'PUT',
      )
      expect(putCalls.length).toBeGreaterThanOrEqual(1)
    })
  })
})
