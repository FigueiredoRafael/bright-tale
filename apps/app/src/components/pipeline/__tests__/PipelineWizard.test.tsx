/**
 * PipelineWizard unit tests
 *
 * Tests the new (post-rewrite) wizard contract:
 *  - No xstate, no setup endpoint, no usePipelineActor
 *  - POSTs to /api/projects
 *  - Dual-path: step-by-step vs supervised/overview (autopilot)
 *  - Channel-select merge with overwrite confirm dialog
 *  - Per-medium Draft tabs when media.length >= 2 AND autopilot
 *  - Template load applies config to form
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

vi.setConfig({ testTimeout: 30_000 })

// ── Router mock ───────────────────────────────────────────────────────────────
const routerPush = vi.fn()

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}))

// ── Toast mock ────────────────────────────────────────────────────────────────
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

// ── Heavy child component stubs ───────────────────────────────────────────────
// WizardRightSummary and CostPreviewSlot are not under test here.
vi.mock('../WizardRightSummary', () => ({
  WizardRightSummary: () => <div data-testid="wizard-right-summary" />,
}))

vi.mock('../CostPreviewSlot', () => ({
  CostPreviewSlot: () => <div data-testid="cost-preview-slot" />,
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────
const C1 = { id: 'c1', name: 'Alpha Channel' }
const C2 = { id: 'c2', name: 'Beta Channel' }

const TEMPLATE_WITH_TOPIC: {
  id: string
  name: string
  is_default: boolean
  config_json: {
    defaultProvider: 'recommended'
    brainstorm: {
      providerOverride: null
      modelOverride: null
      mode: 'topic_driven'
      topic: string
      referenceUrl: null
      niche: string
      tone: string
      audience: string
      goal: string
      constraints: string
    }
    research: { providerOverride: null; modelOverride: null; depth: 'medium' }
    canonicalCore: { providerOverride: null; modelOverride: null; personaId: null }
    draft: { providerOverride: null; modelOverride: null; format: 'blog'; wordCount: number }
    review: {
      providerOverride: null
      modelOverride: null
      maxIterations: number
      autoApproveThreshold: number
      hardFailThreshold: number
    }
    assets: { providerOverride: null; modelOverride: null; mode: 'briefs_only' }
    preview: { enabled: boolean }
    publish: { status: 'draft' }
  }
} = {
  id: 'tpl-1',
  name: 'My Template',
  is_default: false,
  config_json: {
    defaultProvider: 'recommended',
    brainstorm: {
      providerOverride: null,
      modelOverride: null,
      mode: 'topic_driven',
      topic: 'Injected template topic',
      referenceUrl: null,
      niche: '',
      tone: '',
      audience: '',
      goal: '',
      constraints: '',
    },
    research: { providerOverride: null, modelOverride: null, depth: 'medium' },
    canonicalCore: { providerOverride: null, modelOverride: null, personaId: null },
    draft: { providerOverride: null, modelOverride: null, format: 'blog', wordCount: 1200 },
    review: {
      providerOverride: null,
      modelOverride: null,
      maxIterations: 3,
      autoApproveThreshold: 90,
      hardFailThreshold: 40,
    },
    assets: { providerOverride: null, modelOverride: null, mode: 'briefs_only' },
    preview: { enabled: true },
    publish: { status: 'draft' },
  },
}

// ── Fetch factory ─────────────────────────────────────────────────────────────
/**
 * Build a fetch stub that routes responses by URL pattern.
 * Override `templates` to inject template rows for a specific test.
 */
function makeFetch({
  channels = [C1, C2],
  templates = [] as typeof TEMPLATE_WITH_TOPIC[],
  projectId = 'p1',
}: {
  channels?: { id: string; name: string }[]
  templates?: typeof TEMPLATE_WITH_TOPIC[]
  projectId?: string
} = {}) {
  return vi.fn(async (url: RequestInfo, opts?: RequestInit) => {
    const u = String(url)

    // Channels list
    if (u === '/api/channels') {
      return new Response(
        JSON.stringify({ data: { items: channels }, error: null }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Personas (CanonicalCoreFields fetches /api/personas)
    if (u === '/api/personas') {
      return new Response(
        JSON.stringify({ data: [], error: null }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Channel-specific personas
    if (/\/api\/channels\/[^/]+\/personas/.test(u)) {
      return new Response(
        JSON.stringify({ data: { items: [] }, error: null }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Channel default media config
    if (/\/api\/channels\/[^/]+\/default-media-config/.test(u)) {
      return new Response(
        JSON.stringify({ data: { default_media_config_json: null }, error: null }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Autopilot templates — return the fixture list
    if (u.startsWith('/api/autopilot-templates')) {
      return new Response(
        JSON.stringify({ data: { items: templates }, error: null }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Project creation POST
    if (u === '/api/projects' && opts?.method === 'POST') {
      return new Response(
        JSON.stringify({ data: { id: projectId }, error: null }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      )
    }

    return new Response(JSON.stringify({}), { status: 200 })
  }) as typeof fetch
}

// ── Component import (after mocks are set up) ─────────────────────────────────
import { PipelineWizard } from '../PipelineWizard'

// ── Helpers ───────────────────────────────────────────────────────────────────
const originalFetch = globalThis.fetch

beforeEach(() => {
  routerPush.mockClear()
  globalThis.fetch = makeFetch()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

/** Wait for the channel buttons to appear (signals mount + fetch complete). */
async function waitForChannels(count = 2) {
  await waitFor(() => expect(screen.getAllByTestId('channel-option')).toHaveLength(count))
}

/** Click a mode card by aria-label. */
async function clickMode(user: ReturnType<typeof userEvent.setup>, label: 'Step-by-step' | 'Supervised' | 'Overview') {
  const btn = screen.getByRole('radio', { name: label })
  await user.click(btn)
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Mode switching reveals/hides sections
// ─────────────────────────────────────────────────────────────────────────────

describe('PipelineWizard — mode switching', () => {
  it('starts in step-by-step: no stage-section cards visible', async () => {
    render(<PipelineWizard />)
    await waitForChannels()

    // In step-by-step the autopilot sections are hidden; no stage section cards
    expect(screen.queryByTestId('stage-section-brainstorm')).toBeNull()
    expect(screen.queryByTestId('stage-section-research')).toBeNull()
  })

  it('switching to Supervised reveals all 8 stage section cards', async () => {
    const user = userEvent.setup()
    render(<PipelineWizard />)
    await waitForChannels()

    await clickMode(user, 'Supervised')

    // All 8 stages defined in STAGE_ORDER should now be visible
    await waitFor(() => {
      expect(screen.getByTestId('stage-section-brainstorm')).toBeInTheDocument()
    })
    expect(screen.getByTestId('stage-section-research')).toBeInTheDocument()
    expect(screen.getByTestId('stage-section-canonicalCore')).toBeInTheDocument()
    expect(screen.getByTestId('stage-section-draft')).toBeInTheDocument()
    expect(screen.getByTestId('stage-section-review')).toBeInTheDocument()
    expect(screen.getByTestId('stage-section-assets')).toBeInTheDocument()
    expect(screen.getByTestId('stage-section-preview')).toBeInTheDocument()
    expect(screen.getByTestId('stage-section-publish')).toBeInTheDocument()
  })

  it('stage card labels are present after switching to Overview', async () => {
    const user = userEvent.setup()
    render(<PipelineWizard />)
    await waitForChannels()

    await clickMode(user, 'Overview')

    // STAGE_LABELS values appear as visible text within the section cards
    await waitFor(() => expect(screen.getByTestId('stage-section-brainstorm')).toBeInTheDocument())

    const stageLabels = ['Brainstorm', 'Research', 'Canonical Core', 'Draft', 'Review', 'Assets', 'Preview', 'Publish']
    for (const label of stageLabels) {
      // Each label appears at least once in the document
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('switching back to step-by-step hides the stage sections again', async () => {
    const user = userEvent.setup()
    render(<PipelineWizard />)
    await waitForChannels()

    await clickMode(user, 'Supervised')
    await waitFor(() => expect(screen.getByTestId('stage-section-brainstorm')).toBeInTheDocument())

    await clickMode(user, 'Step-by-step')
    await waitFor(() => expect(screen.queryByTestId('stage-section-brainstorm')).toBeNull())
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Submit button disabled while form is invalid
// ─────────────────────────────────────────────────────────────────────────────

describe('PipelineWizard — submit button gating', () => {
  it('Create project button is disabled on mount (no title, no channel)', async () => {
    render(<PipelineWizard />)
    await waitForChannels()

    const btn = screen.getByRole('button', { name: /create project/i })
    expect(btn).toBeDisabled()
  })

  it('button stays disabled when only title is filled', async () => {
    render(<PipelineWizard />)
    await waitForChannels()

    fireEvent.change(screen.getByLabelText(/project title/i), {
      target: { value: 'Valid title here' },
    })

    const btn = screen.getByRole('button', { name: /create project/i })
    expect(btn).toBeDisabled()
  })

  it('button stays disabled when only channel is selected', async () => {
    render(<PipelineWizard />)
    await waitForChannels()

    fireEvent.click(screen.getAllByTestId('channel-option')[0])
    await waitFor(() => {}) // flush async channel select effects

    const btn = screen.getByRole('button', { name: /create project/i })
    expect(btn).toBeDisabled()
  })

  it('button enables when title >= 3 chars AND channel selected AND topic filled', async () => {
    render(<PipelineWizard />)
    await waitForChannels()

    fireEvent.change(screen.getByLabelText(/project title/i), {
      target: { value: 'Valid title here' },
    })
    fireEvent.click(screen.getAllByTestId('channel-option')[0])

    // Topic is now required to seed brainstorm regardless of mode.
    fireEvent.change(screen.getByLabelText(/^topic$/i), {
      target: { value: 'AI agents taking over' },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create project/i })).not.toBeDisabled()
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Topic required for topic_driven brainstorm in autopilot mode
// ─────────────────────────────────────────────────────────────────────────────

describe('PipelineWizard — topic required in autopilot', () => {
  it('button disabled in supervised with empty topic (topic_driven default)', async () => {
    const user = userEvent.setup()
    render(<PipelineWizard />)
    await waitForChannels()

    // Set title + channel so only the topic condition blocks us
    fireEvent.change(screen.getByLabelText(/project title/i), {
      target: { value: 'My autopilot project' },
    })
    fireEvent.click(screen.getAllByTestId('channel-option')[0])

    await clickMode(user, 'Supervised')

    // The brainstorm section opens by default; topic input is visible
    await waitFor(() => expect(screen.getByLabelText(/topic/i)).toBeInTheDocument())

    const btn = screen.getByRole('button', { name: /create project/i })
    expect(btn).toBeDisabled()
  })

  it('button enables when topic is filled in supervised mode', async () => {
    const user = userEvent.setup()
    render(<PipelineWizard />)
    await waitForChannels()

    fireEvent.change(screen.getByLabelText(/project title/i), {
      target: { value: 'My autopilot project' },
    })
    fireEvent.click(screen.getAllByTestId('channel-option')[0])

    await clickMode(user, 'Supervised')

    await waitFor(() => expect(screen.getByLabelText(/topic/i)).toBeInTheDocument())
    await user.type(screen.getByLabelText(/topic/i), 'AI agents taking over')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create project/i })).not.toBeDisabled()
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: POST payload shape by mode
// ─────────────────────────────────────────────────────────────────────────────

describe('PipelineWizard — POST payload', () => {
  it('step-by-step submit: body carries autopilotConfigJson with brainstorm seed', async () => {
    const fetchSpy = makeFetch()
    globalThis.fetch = fetchSpy

    void userEvent.setup()
    render(<PipelineWizard />)
    await waitForChannels()

    fireEvent.change(screen.getByLabelText(/project title/i), {
      target: { value: 'Step project title' },
    })
    fireEvent.click(screen.getAllByTestId('channel-option')[0])
    fireEvent.change(screen.getByLabelText(/^topic$/i), {
      target: { value: 'step-by-step seed topic' },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create project/i })).not.toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: /create project/i }))

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/projects/p1'))

    const calls = (fetchSpy as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][]
    const postCall = calls.find(([u, o]) => u === '/api/projects' && o?.method === 'POST')
    expect(postCall).toBeDefined()
    const body = JSON.parse(postCall![1].body as string)
    expect(body.mode).toBe('step-by-step')
    // autopilotConfigJson is now always sent so the server can auto-dispatch
    // a brainstorm stage_run with the user-supplied topic.
    expect(body.autopilotConfigJson?.brainstorm?.topic).toBe('step-by-step seed topic')
    expect(body.autopilotConfigJson?.brainstorm?.mode).toBe('topic_driven')
  })

  it('supervised submit: body includes autopilotConfigJson with full config', async () => {
    const fetchSpy = makeFetch()
    globalThis.fetch = fetchSpy

    const user = userEvent.setup()
    render(<PipelineWizard />)
    await waitForChannels()

    fireEvent.change(screen.getByLabelText(/project title/i), {
      target: { value: 'Autopilot project' },
    })
    fireEvent.click(screen.getAllByTestId('channel-option')[0])

    await clickMode(user, 'Supervised')

    await waitFor(() => expect(screen.getByLabelText(/topic/i)).toBeInTheDocument())
    await user.type(screen.getByLabelText(/topic/i), 'Machine learning trends')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create project/i })).not.toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: /create project/i }))

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/projects/p1'))

    const calls = (fetchSpy as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][]
    const postCall = calls.find(([u, o]) => u === '/api/projects' && o?.method === 'POST')
    expect(postCall).toBeDefined()
    const body = JSON.parse(postCall![1].body as string)
    expect(body.mode).toBe('supervised')
    expect(body.autopilotConfigJson).toBeDefined()
    expect(typeof body.autopilotConfigJson).toBe('object')
    // Brainstorm topic should match what we typed
    expect(body.autopilotConfigJson.brainstorm.topic).toBe('Machine learning trends')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Per-medium Draft tabs render when 2+ media in autopilot mode
// ─────────────────────────────────────────────────────────────────────────────

describe('PipelineWizard — per-medium Draft tabs', () => {
  it('shows per-medium tabs in the Draft section when 2+ media selected in supervised', async () => {
    const user = userEvent.setup()
    render(<PipelineWizard />)
    await waitForChannels()

    // Switch to supervised (autopilot) to reveal stage sections
    await clickMode(user, 'Supervised')
    await waitFor(() => expect(screen.getByTestId('stage-section-draft')).toBeInTheDocument())

    // Select a second medium — 'video' (blog is already checked by default)
    const videoCheckbox = screen.getByRole('checkbox', { name: /long-form video/i })
    await user.click(videoCheckbox)

    // Open the Draft section card (it's collapsed by default)
    const draftSection = screen.getByTestId('stage-section-draft')
    const draftTrigger = draftSection.querySelector('button[aria-expanded]') as HTMLButtonElement
    if (draftTrigger.getAttribute('aria-expanded') === 'false') {
      await user.click(draftTrigger)
    }

    // With 2 media, MultiMediaDraftFields renders tab buttons per medium
    await waitFor(() => {
      // Look for tab buttons with medium names inside the draft section
      const tabButtons = draftSection.querySelectorAll('button.capitalize, button[class*="border-b-2"]')
      // At least one tab button should say "blog" or "video"
      const texts = Array.from(tabButtons).map((b) => b.textContent?.toLowerCase())
      expect(texts.some((t) => t?.includes('blog') || t?.includes('video'))).toBe(true)
    })
  })

  it('does NOT show per-medium tabs with only 1 medium (blog) in supervised', async () => {
    const user = userEvent.setup()
    render(<PipelineWizard />)
    await waitForChannels()

    await clickMode(user, 'Supervised')
    await waitFor(() => expect(screen.getByTestId('stage-section-draft')).toBeInTheDocument())

    // Only blog is selected by default (1 medium)
    const draftSection = screen.getByTestId('stage-section-draft')
    const draftTrigger = draftSection.querySelector('button[aria-expanded]') as HTMLButtonElement
    if (draftTrigger.getAttribute('aria-expanded') === 'false') {
      await user.click(draftTrigger)
    }

    // DraftFields (single medium) renders a Format select, NOT tab buttons
    await waitFor(() => {
      // The word count label specific to single-medium DraftFields
      expect(draftSection.textContent).toContain('Word count')
    })

    // No tab bar: the tab buttons have class containing "border-b-2" only in multi-media
    const tabBar = draftSection.querySelector('.flex.gap-1.border-b')
    expect(tabBar).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Channel-select merge — overwrite confirm dialog
// ─────────────────────────────────────────────────────────────────────────────

describe('PipelineWizard — channel-select overwrite confirm dialog', () => {
  it('shows overwrite confirm when channel selected with dirty autopilot form', async () => {
    // Return a default template for the channel so the merge changes state
    const templateWithDefault = { ...TEMPLATE_WITH_TOPIC, is_default: true }
    globalThis.fetch = makeFetch({ templates: [templateWithDefault] })

    const user = userEvent.setup()
    render(<PipelineWizard />)
    await waitForChannels()

    // Switch to supervised so form is in autopilot mode
    await clickMode(user, 'Supervised')
    await waitFor(() => expect(screen.getByLabelText(/topic/i)).toBeInTheDocument())

    // Dirty the form by typing a topic
    await user.type(screen.getByLabelText(/topic/i), 'Some topic I typed')

    // Now select a channel — this triggers the dirty + autopilot check
    fireEvent.click(screen.getAllByTestId('channel-option')[0])

    // The overwrite confirm dialog should appear
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /confirm overwrite settings/i })).toBeInTheDocument()
    })

    // Dialog has "Keep mine" and "Apply defaults" buttons
    expect(screen.getByRole('button', { name: /keep mine/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /apply defaults/i })).toBeInTheDocument()
  })

  it('dismisses the dialog when "Keep mine" is clicked', async () => {
    const templateWithDefault = { ...TEMPLATE_WITH_TOPIC, is_default: true }
    globalThis.fetch = makeFetch({ templates: [templateWithDefault] })

    const user = userEvent.setup()
    render(<PipelineWizard />)
    await waitForChannels()

    await clickMode(user, 'Supervised')
    await waitFor(() => expect(screen.getByLabelText(/topic/i)).toBeInTheDocument())
    await user.type(screen.getByLabelText(/topic/i), 'Some topic I typed')

    fireEvent.click(screen.getAllByTestId('channel-option')[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /confirm overwrite settings/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /keep mine/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /confirm overwrite settings/i })).toBeNull()
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Template load applies config to form
// ─────────────────────────────────────────────────────────────────────────────

describe('PipelineWizard — template load', () => {
  it('loading a template chip updates the brainstorm topic field', async () => {
    // Make the template appear in the list
    globalThis.fetch = makeFetch({ templates: [TEMPLATE_WITH_TOPIC] })

    const user = userEvent.setup()
    render(<PipelineWizard />)
    await waitForChannels()

    // Switch to supervised to show templates + stage sections
    await clickMode(user, 'Supervised')

    // The brainstorm section opens by default; topic field should be visible
    await waitFor(() => expect(screen.getByLabelText(/topic/i)).toBeInTheDocument())

    // Select a channel — this triggers refreshTemplates which populates the template list
    fireEvent.click(screen.getAllByTestId('channel-option')[0])

    // Wait for template chip to appear (templates are loaded on channel select)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /my template/i })).toBeInTheDocument()
    })

    // Click the template chip to apply the config
    await user.click(screen.getByRole('button', { name: /my template/i }))

    // The topic input value should now be what the template carries
    await waitFor(() => {
      const topicInput = screen.getByLabelText(/topic/i) as HTMLInputElement
      expect(topicInput.value).toBe('Injected template topic')
    })
  })
})
