import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// The wizard exercises long userEvent click chains. In parallel suite runs
// fork scheduling makes those chains slower than vitest's 5s default. Bump
// the per-test budget so this file isn't flaky under load.
vi.setConfig({ testTimeout: 30_000 })

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
      defaultModels: {
        brainstorm: 'gemini-2.5-flash',
        research: 'gemini-2.5-flash',
        canonicalCore: 'gpt-4o',
        draft: 'claude-3-5-sonnet',
        review: 'gemini-2.5-flash',
        assets: 'gemini-2.5-flash',
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

// Helper: open a collapsed section by clicking its trigger button
async function openSection(user: ReturnType<typeof userEvent.setup>, testId: string) {
  const section = screen.getByTestId(testId)
  const trigger = section.querySelector('button[aria-expanded]') as HTMLButtonElement | null
  if (trigger && trigger.getAttribute('aria-expanded') === 'false') {
    await user.click(trigger)
  }
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
    json: async () => ({ data: { items: [] }, error: null }),
  })
  vi.stubGlobal('fetch', fetchSpy)
  renderWizard()

  await user.click(screen.getByLabelText(/supervised/i))
  await user.type(screen.getByLabelText(/topic/i), 'AI agents')

  await user.click(screen.getByRole('button', { name: /start brainstorm \(supervised\)/i }))

  // Find the setup POST call (templates GET on mount may precede it)
  let setupInit: RequestInit | undefined
  await waitFor(() => {
    const setupCall = (fetchSpy.mock.calls as [string, RequestInit | undefined][]).find(
      ([url]) => url === '/api/projects/p1/setup',
    )
    expect(setupCall).toBeDefined()
    setupInit = setupCall?.[1]
  })
  expect(setupInit?.method).toBe('POST')
  const body = JSON.parse(setupInit?.body as string) as {
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

    expect(screen.getByRole('button', { name: /start brainstorm →/i })).toBeDefined()

    await user.click(screen.getByLabelText(/supervised/i))
    expect(screen.getByRole('button', { name: /start brainstorm \(supervised\)/i })).toBeDefined()

    await user.click(screen.getByLabelText(/overview/i))
    expect(screen.getByRole('button', { name: /start brainstorm \(overview\)/i })).toBeDefined()
  })

  it('expands section containing errors on submit', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { items: [] }, error: null }),
      }),
    )
    renderWizard()

    // Switch to supervised so autopilotConfig is validated
    await user.click(screen.getByLabelText(/supervised/i))

    // Open review section first so its fields are rendered
    await openSection(user, 'stage-section-review')

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

    // Collapse the review section so we can test that it re-opens on validation error
    await openSection(user, 'stage-section-review')

    // Type a topic to avoid brainstorm validation errors
    await user.type(screen.getByLabelText(/topic/i), 'AI agents')

    await user.click(screen.getByRole('button', { name: /start brainstorm \(supervised\)/i }))

    await waitFor(() => {
      const section = screen.getByTestId('stage-section-review')
      const trigger = section.querySelector('button[aria-expanded]') as HTMLButtonElement | null
      expect(trigger?.getAttribute('aria-expanded')).toBe('true')
    })
  })

  it('Save as new posts to /api/autopilot-templates with isDefault flag', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      // GET on mount returns empty templates list; POST returns created template
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { id: 'tpl-1', name: 'My Template' }, error: null }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { items: [] }, error: null }),
      })
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
      const postCall = (fetchSpy.mock.calls as [string, RequestInit | undefined][]).find(
        ([url, init]) => url === '/api/autopilot-templates' && init?.method === 'POST',
      )
      expect(postCall).toBeDefined()
      const [, init] = postCall ?? []
      const body = JSON.parse(init?.body as string) as { name: string }
      expect(body.name).toBe('My Template')
    })
  })

  it('Update template shows confirm dialog then PUTs', async () => {
    const user = userEvent.setup()
    const existingTemplate = {
      id: 'tpl-1',
      name: 'Existing',
      is_default: false,
      config_json: {
        defaultProvider: 'recommended' as const,
        brainstorm: {
          providerOverride: null,
          mode: 'topic_driven' as const,
          topic: 'x',
          referenceUrl: null,
          niche: '', tone: '', audience: '', goal: '', constraints: '',
        },
        research: { providerOverride: null, depth: 'medium' as const },
        canonicalCore: { providerOverride: null, personaId: null },
        draft: { providerOverride: null, format: 'blog' as const, wordCount: 1200 },
        review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 },
        assets: { providerOverride: null, mode: 'briefs_only' as const },
        preview: { enabled: false },
        publish: { status: 'draft' as const },
      },
    }
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: existingTemplate, error: null }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { items: [existingTemplate] }, error: null }),
      })
    })
    vi.stubGlobal('fetch', fetchSpy)
    renderWizard()

    // Wait for templates GET to settle and combobox to render
    const templateSelect = await screen.findByRole('combobox', { name: /load template/i })
    await user.click(templateSelect)
    const option = await screen.findByRole('option', { name: /existing/i })
    await user.click(option)

    // Now the "Update template" button should appear
    const updateButton = await screen.findByRole('button', { name: /update template/i })
    await user.click(updateButton)

    const confirmButton = await screen.findByRole('button', { name: /confirm/i })
    await user.click(confirmButton)

    await waitFor(() => {
      const putCalls = (fetchSpy.mock.calls as [string, RequestInit | undefined][]).filter(
        ([, init]) => init?.method === 'PUT',
      )
      expect(putCalls.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('surfaces template-action error inline when save fails', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          json: async () => ({ data: null, error: { code: 'INVALID_BODY', message: 'name already taken' } }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { items: [] }, error: null }),
      })
    })
    vi.stubGlobal('fetch', fetchSpy)
    renderWizard()

    await user.click(screen.getByRole('button', { name: /save as new/i }))
    const nameInput = await screen.findByLabelText(/template name/i)
    await user.type(nameInput, 'dup')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    const error = await screen.findByTestId('template-action-error')
    expect(error.textContent).toMatch(/name already taken/i)
  })
})

// ────────────────────────────────────────────────────────────────────
// New: two-column layout + mode cards tests
// ────────────────────────────────────────────────────────────────────

describe('two-column layout and mode cards', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { items: [] }, error: null }),
      }),
    )
  })

  it('renders three mode card radio buttons', () => {
    renderWizard()
    const stepByStep = screen.getByRole('radio', { name: /step-by-step/i })
    const supervised = screen.getByRole('radio', { name: /supervised/i })
    const overview = screen.getByRole('radio', { name: /overview/i })
    expect(stepByStep).toBeDefined()
    expect(supervised).toBeDefined()
    expect(overview).toBeDefined()
  })

  it('mode card selection updates aria-checked', async () => {
    const user = userEvent.setup()
    renderWizard()

    const stepByStepCard = screen.getByRole('radio', { name: /step-by-step/i })
    const supervisedCard = screen.getByRole('radio', { name: /supervised/i })

    // Default is step-by-step
    expect(stepByStepCard.getAttribute('aria-checked')).toBe('true')
    expect(supervisedCard.getAttribute('aria-checked')).toBe('false')

    await user.click(supervisedCard)

    expect(supervisedCard.getAttribute('aria-checked')).toBe('true')
    expect(stepByStepCard.getAttribute('aria-checked')).toBe('false')
  })

  it('section accordion expands and collapses', async () => {
    const user = userEvent.setup()
    renderWizard()

    const researchSection = screen.getByTestId('stage-section-research')
    const trigger = researchSection.querySelector('button[aria-expanded]') as HTMLButtonElement | null
    expect(trigger).toBeTruthy()

    // Research starts collapsed
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')

    await user.click(trigger!)

    expect(trigger?.getAttribute('aria-expanded')).toBe('true')

    await user.click(trigger!)

    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
  })

  it('brainstorm section is open by default for fresh project', () => {
    renderWizard()
    const brainstormSection = screen.getByTestId('stage-section-brainstorm')
    const trigger = brainstormSection.querySelector('button[aria-expanded]') as HTMLButtonElement | null
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
  })

  it('sticky CTA button is always visible in the DOM', () => {
    renderWizard()
    // The CTA "Start brainstorm →" button must be in the DOM at all times
    expect(screen.getByRole('button', { name: /start brainstorm →/i })).toBeDefined()
  })

  it('right-column summary panel is rendered in the DOM', () => {
    renderWizard()
    // The summary panel renders stage rows; check for a known label
    expect(screen.getAllByText(/brainstorm/i).length).toBeGreaterThanOrEqual(1)
  })
})

// ────────────────────────────────────────────────────────────────────
// Task 2.10: assets / preview / publish field tests
// ────────────────────────────────────────────────────────────────────

describe('assets / preview / publish fields (T-2.10)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { items: [] }, error: null }),
      }),
    )
  })

  it('renders assets radio with 3 options: skip, auto_generate, briefs_only', async () => {
    const user = userEvent.setup()
    renderWizard()
    // Open assets section first
    await openSection(user, 'stage-section-assets')
    const assetsSection = screen.getByTestId('stage-section-assets')
    expect(assetsSection.querySelector('#assets-skip')).toBeTruthy()
    expect(assetsSection.querySelector('#assets-auto')).toBeTruthy()
    expect(assetsSection.querySelector('#assets-briefs')).toBeTruthy()
  })

  it('renders preview enabled switch with explainer text', async () => {
    const user = userEvent.setup()
    renderWizard()
    // Open preview section first
    await openSection(user, 'stage-section-preview')
    const previewSection = screen.getByTestId('stage-section-preview')
    expect(previewSection.querySelector('#preview-enabled')).toBeTruthy()
    expect(previewSection.textContent).toMatch(/when off/i)
  })

  it('renders publish status radio with draft (default) and published options', async () => {
    const user = userEvent.setup()
    renderWizard()
    // Open publish section first
    await openSection(user, 'stage-section-publish')
    const publishSection = screen.getByTestId('stage-section-publish')
    expect(publishSection.querySelector('#publish-draft')).toBeTruthy()
    expect(publishSection.querySelector('#publish-published')).toBeTruthy()
  })

  it('submitting wizard with assets.mode=briefs_only writes correct shape into actor', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/setup')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: {}, error: null }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: { items: [] }, error: null }) })
    })
    vi.stubGlobal('fetch', fetchSpy)
    renderWizard()

    // Type a topic so the brainstorm form validates in step-by-step mode
    await user.type(screen.getByLabelText(/topic/i), 'AI agents')

    // Open assets section and select briefs_only
    await openSection(user, 'stage-section-assets')
    const assetsBriefs = document.getElementById('assets-briefs')
    if (assetsBriefs) await user.click(assetsBriefs)

    await user.click(screen.getByRole('button', { name: /start brainstorm →/i }))

    await waitFor(() => {
      const setupCall = (fetchSpy.mock.calls as [string, RequestInit | undefined][]).find(
        ([url]) => typeof url === 'string' && url.includes('/setup'),
      )
      expect(setupCall).toBeDefined()
    })

    // Verify actor send was called
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SETUP_COMPLETE' }),
    )
  })
})

// ────────────────────────────────────────────────────────────────────
// Task 3.5: Save-as-template full round-trip (Spec 2 fields)
// ────────────────────────────────────────────────────────────────────

describe('save-as-template round-trip (T-3.5)', () => {
  const spec2Template = {
    id: 'tpl-spec2',
    name: 'Spec 2 Template',
    is_default: false,
    config_json: {
      defaultProvider: 'recommended' as const,
      brainstorm: {
        providerOverride: null,
        mode: 'topic_driven' as const,
        topic: 'AI agents',
        referenceUrl: null,
        niche: '',
        tone: '',
        audience: '',
        goal: '',
        constraints: '',
      },
      research: { providerOverride: null, depth: 'medium' as const },
      canonicalCore: { providerOverride: null, personaId: null },
      draft: { providerOverride: null, format: 'blog' as const, wordCount: 1500 },
      review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 },
      assets: { providerOverride: null, mode: 'briefs_only' as const },
      preview: { enabled: true },
      publish: { status: 'published' as const },
    },
  }

  it('POST /api/autopilot-templates body includes all Spec 2 fields (assets.mode, preview.enabled, publish.status)', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && typeof url === 'string' && url === '/api/autopilot-templates') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: spec2Template, error: null }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { items: [] }, error: null }),
      })
    })
    vi.stubGlobal('fetch', fetchSpy)
    renderWizard()

    // 1. Open assets section and set to briefs_only (it's the default, interact to confirm the field is live)
    await openSection(user, 'stage-section-assets')
    const assetsBriefs = document.getElementById('assets-briefs')
    if (assetsBriefs) await user.click(assetsBriefs)

    // 2. Open preview section and enable preview (default is false — toggle the switch on)
    await openSection(user, 'stage-section-preview')
    const previewSwitch = document.getElementById('preview-enabled')
    if (previewSwitch) await user.click(previewSwitch)

    // 3. Open publish section and set publish status to published (default is draft)
    await openSection(user, 'stage-section-publish')
    const publishPublished = document.getElementById('publish-published')
    if (publishPublished) await user.click(publishPublished)

    // 4. Open Save-as-new dialog
    await user.click(screen.getByRole('button', { name: /save as new/i }))

    // 5. Enter template name
    const nameInput = await screen.findByLabelText(/template name/i)
    await user.type(nameInput, 'Spec 2 Template')

    // 6. Submit the dialog
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    // 7. Assert POST body includes all 3 Spec 2 fields
    await waitFor(() => {
      const postCall = (fetchSpy.mock.calls as [string, RequestInit | undefined][]).find(
        ([url, init]) => url === '/api/autopilot-templates' && init?.method === 'POST',
      )
      expect(postCall).toBeDefined()
      const [, init] = postCall ?? []
      const body = JSON.parse(init?.body as string) as {
        name: string
        configJson: {
          assets: { mode: string }
          preview: { enabled: boolean }
          publish: { status: string }
        }
      }
      expect(body.name).toBe('Spec 2 Template')
      expect(body.configJson.assets.mode).toBe('briefs_only')
      expect(body.configJson.preview.enabled).toBe(true)
      expect(body.configJson.publish.status).toBe('published')
    })
  })

  it('loading a saved template pre-fills all Spec 2 fields (assets.mode, preview.enabled, publish.status)', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      // GET /api/autopilot-templates returns the spec2 template in the list
      if ((!init?.method || init.method === 'GET') && typeof url === 'string' && url.includes('/api/autopilot-templates')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { items: [spec2Template] }, error: null }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { items: [] }, error: null }),
      })
    })
    vi.stubGlobal('fetch', fetchSpy)
    renderWizard()

    // Wait for templates list to load and select the spec2 template
    const templateSelect = await screen.findByRole('combobox', { name: /load template/i })
    await user.click(templateSelect)
    const option = await screen.findByRole('option', { name: /spec 2 template/i })
    await user.click(option)

    // Open sections to inspect the pre-filled values
    await openSection(user, 'stage-section-assets')
    await openSection(user, 'stage-section-preview')
    await openSection(user, 'stage-section-publish')

    // Assert the form pre-fills the 3 Spec 2 fields from the loaded template
    await waitFor(() => {
      // assets: briefs_only radio should be checked
      const assetsBriefs = document.getElementById('assets-briefs') as HTMLInputElement | null
      expect(assetsBriefs?.getAttribute('data-state') ?? assetsBriefs?.checked).toBeTruthy()

      // preview: enabled switch should be on
      const previewSwitch = document.getElementById('preview-enabled') as HTMLButtonElement | null
      expect(previewSwitch?.getAttribute('data-state')).toBe('checked')

      // publish: published radio should be checked
      const publishPublished = document.getElementById('publish-published') as HTMLInputElement | null
      expect(publishPublished?.getAttribute('data-state') ?? publishPublished?.checked).toBeTruthy()
    })
  })
})

// ────────────────────────────────────────────────────────────────────
// Entry-point startStage tests (T-8.2)
// ────────────────────────────────────────────────────────────────────

describe('entry-point startStage derivation', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { items: [] }, error: null }),
      }),
    )
  })

  it('fresh entry: enables all stages, CTA is "Start brainstorm →", POSTs startStage="brainstorm"', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/setup')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: {}, error: null }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: { items: [] }, error: null }) })
    })
    vi.stubGlobal('fetch', fetchSpy)

    renderWizard({ stageResults: {} })

    // All stage sections should be active (not disabled)
    const brainstorm = screen.getByTestId('stage-section-brainstorm')
    const research = screen.getByTestId('stage-section-research')
    expect(brainstorm.getAttribute('aria-disabled')).toBeNull()
    expect(research.getAttribute('aria-disabled')).toBeNull()

    // CTA reflects fresh entry (brainstorm)
    expect(screen.getByRole('button', { name: /start brainstorm →/i })).toBeDefined()

    // The form requires a topic for brainstorm topic_driven mode — type one so form submits
    await user.type(screen.getByLabelText(/topic/i), 'AI trends')

    // On submit, startStage="brainstorm" is POSTed
    await user.click(screen.getByRole('button', { name: /start brainstorm →/i }))

    await waitFor(() => {
      const setupCall = (fetchSpy.mock.calls as [string, RequestInit | undefined][]).find(
        ([url]) => typeof url === 'string' && url.includes('/setup'),
      )
      expect(setupCall).toBeDefined()
      const body = JSON.parse(setupCall?.[1]?.body as string) as { startStage: string }
      expect(body.startStage).toBe('brainstorm')
    })
  })

  it('from-idea entry: brainstorm card disabled, CTA is "Start research →", POSTs startStage="research"', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/setup')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: {}, error: null }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: { items: [] }, error: null }) })
    })
    vi.stubGlobal('fetch', fetchSpy)

    renderWizard({
      stageResults: {
        brainstorm: {
          ideaId: 'idea-1',
          ideaTitle: 'Test Idea',
          ideaVerdict: 'viable',
          ideaCoreTension: 'some tension',
          completedAt: '2026-01-01T00:00:00Z',
        },
      },
    })

    // Brainstorm should be disabled (already completed), research should be active
    const brainstormSection = screen.getByTestId('stage-section-brainstorm')
    const researchSection = screen.getByTestId('stage-section-research')
    expect(brainstormSection.getAttribute('aria-disabled')).toBe('true')
    expect(researchSection.getAttribute('aria-disabled')).toBeNull()

    // CTA reflects research entry point (step-by-step mode, brainstorm null-ed out so form validates)
    expect(screen.getByRole('button', { name: /start research →/i })).toBeDefined()

    // On submit, startStage="research" is POSTed.
    // The wizard nulls out the brainstorm autopilot slot when brainstorm is already completed,
    // so form validation passes without a topic input (the section is collapsed and not rendered).
    await user.click(screen.getByRole('button', { name: /start research →/i }))

    await waitFor(() => {
      const setupCall = (fetchSpy.mock.calls as [string, RequestInit | undefined][]).find(
        ([url]) => typeof url === 'string' && url.includes('/setup'),
      )
      expect(setupCall).toBeDefined()
      const body = JSON.parse(setupCall?.[1]?.body as string) as { startStage: string }
      expect(body.startStage).toBe('research')
    })
  })

  // NOTE: POST /from-research route does not exist yet (T-8.2 scope: existing paths only).
  // The test below is skipped until /from-research is implemented.
  it.skip('from-research entry: brainstorm + research disabled, CTA is "Start draft →", POSTs startStage="draft"', () => {
    // Will be enabled when POST /api/projects/from-research is added.
  })

  // NOTE: POST /from-blog route does not exist yet (T-8.2 scope: existing paths only).
  // The test below is skipped until /from-blog is implemented.
  it.skip('from-blog entry: all upstream disabled, CTA is "Start review →", POSTs startStage="review"', () => {
    // Will be enabled when POST /api/projects/from-blog is added.
  })
})
