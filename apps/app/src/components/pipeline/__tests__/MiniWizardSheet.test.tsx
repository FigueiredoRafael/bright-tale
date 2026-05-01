import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { autopilotConfigSchema } from '@brighttale/shared'

// ─── Default admin settings ───────────────────────────────────────────────────
const DEFAULT_PIPELINE_SETTINGS = {
  reviewRejectThreshold: 40,
  reviewApproveScore: 90,
  reviewMaxIterations: 5,
  defaultProviders: {
    brainstorm: 'gemini',
    research: 'gemini',
    draft: 'anthropic',
    review: 'gemini',
  },
}

const DEFAULT_CREDIT_SETTINGS = {
  costBlog: 200,
  costVideo: 200,
  costShorts: 100,
  costPodcast: 150,
  costCanonicalCore: 80,
  costReview: 20,
  costResearchSurface: 60,
  costResearchMedium: 100,
  costResearchDeep: 180,
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/providers/PipelineSettingsProvider', () => ({
  usePipelineSettings: () => ({
    pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
    creditSettings: DEFAULT_CREDIT_SETTINGS,
    isLoaded: true,
  }),
}))

// Stub fetch so the async provider+agent load in MiniWizardSheet resolves
// with a minimal set of providers (gemini + anthropic) and no agent-level recs.
// Without this, the provider <select> has no options, and select.value is always ''.
const MOCK_PROVIDERS_RESPONSE = {
  data: [
    { provider: 'gemini',    isActive: true, modelsJson: [] },
    { provider: 'anthropic', isActive: true, modelsJson: [] },
    { provider: 'openai',    isActive: true, modelsJson: [] },
  ],
}
const MOCK_AGENTS_RESPONSE = { data: { agents: [] } }

beforeEach(() => {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    const body = url.includes('/api/agents') ? MOCK_AGENTS_RESPONSE : MOCK_PROVIDERS_RESPONSE
    return Promise.resolve({ json: () => Promise.resolve(body) })
  })
})

// sendSpy is shared across tests; each test that inspects it should reset it.
const sendSpy = vi.fn()

// Build a snapshot factory so each test can customise context easily.
function makeSnapshot({
  value = 'draft' as unknown,
  mode = 'step-by-step' as 'step-by-step' | 'supervised' | 'overview' | null,
  autopilotConfig = null as unknown,
  stageResults = {} as Record<string, unknown>,
} = {}) {
  return {
    value,
    context: {
      projectId: 'p1',
      channelId: 'c1',
      mode,
      autopilotConfig,
      stageResults,
    },
  }
}

// Default: no config yet, at draft stage with no completed stages
const DEFAULT_SNAPSHOT = makeSnapshot()

let snapshotOverride = DEFAULT_SNAPSHOT

vi.mock('@/hooks/usePipelineActor', () => ({
  usePipelineActor: () => ({
    getSnapshot: () => snapshotOverride,
    send: sendSpy,
  }),
}))

afterEach(() => {
  vi.clearAllMocks()
  snapshotOverride = DEFAULT_SNAPSHOT
})

// ─── Import component AFTER mocks ─────────────────────────────────────────────
import { MiniWizardSheet } from '../MiniWizardSheet'

// ─── Helper: render open sheet ─────────────────────────────────────────────────
function renderOpen() {
  return render(<MiniWizardSheet isOpen onClose={vi.fn()} />)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MiniWizardSheet', () => {
  describe('pre-fills upstream slots from admin defaults when no autopilotConfig exists', () => {
    it('brainstorm provider field defaults to pipelineSettings.defaultProviders.brainstorm', async () => {
      snapshotOverride = makeSnapshot({ mode: 'step-by-step', autopilotConfig: null })
      renderOpen()

      // Wait for async provider load so the 'gemini' <option> exists in the DOM
      const brainstormSelect = screen.getByTestId('brainstorm-provider-select')
      await waitFor(() => {
        expect(brainstormSelect).toHaveValue(DEFAULT_PIPELINE_SETTINGS.defaultProviders.brainstorm)
      })
    })

    it('research provider field defaults to pipelineSettings.defaultProviders.research', async () => {
      snapshotOverride = makeSnapshot({ mode: 'step-by-step', autopilotConfig: null })
      renderOpen()

      const researchSelect = screen.getByTestId('research-provider-select')
      await waitFor(() => {
        expect(researchSelect).toHaveValue(DEFAULT_PIPELINE_SETTINGS.defaultProviders.research)
      })
    })
  })

  describe('renders read-only summary cards for completed stages', () => {
    beforeEach(() => {
      snapshotOverride = makeSnapshot({
        value: 'draft',
        mode: 'step-by-step',
        autopilotConfig: null,
        stageResults: {
          brainstorm: {
            ideaId: 'idea-1',
            ideaTitle: 'My Great Idea',
            ideaVerdict: 'strong',
            ideaCoreTension: 'tension',
            completedAt: '2026-01-01T00:00:00Z',
          },
          research: {
            researchSessionId: 'rs-1',
            approvedCardsCount: 5,
            researchLevel: 'deep',
            completedAt: '2026-01-01T01:00:00Z',
          },
        },
      })
    })

    it('shows a summary card for brainstorm with stage text and marks it read-only', () => {
      renderOpen()

      // A read-only summary card for brainstorm should be visible
      const brainstormCard = screen.getByTestId('completed-card-brainstorm')
      expect(brainstormCard).toBeInTheDocument()
      expect(brainstormCard).toHaveTextContent(/My Great Idea/)

      // The brainstorm provider select should NOT be present (read-only mode)
      expect(screen.queryByTestId('brainstorm-provider-select')).toBeNull()
    })

    it('shows a summary card for research with stage text and marks it read-only', () => {
      renderOpen()

      const researchCard = screen.getByTestId('completed-card-research')
      expect(researchCard).toBeInTheDocument()
      expect(researchCard).toHaveTextContent(/5 cards/)

      expect(screen.queryByTestId('research-provider-select')).toBeNull()
    })

    it('draft and remaining stages remain editable', () => {
      renderOpen()

      // draft provider select should be present (not yet completed)
      expect(screen.getByTestId('draft-provider-select')).toBeInTheDocument()
    })
  })

  describe('submit dispatches GO_AUTOPILOT with a COMPLETE AutopilotConfig', () => {
    it('dispatches GO_AUTOPILOT and config passes autopilotConfigSchema.parse()', async () => {
      const user = userEvent.setup()
      // Use a state where brainstorm + research are already done so those
      // nullable slots are excluded from the parsed config, keeping the
      // assembled config valid without user input.
      snapshotOverride = makeSnapshot({
        value: 'draft',
        mode: 'step-by-step',
        autopilotConfig: null,
        stageResults: {
          brainstorm: {
            ideaId: 'idea-1',
            ideaTitle: 'Idea',
            ideaVerdict: 'strong',
            ideaCoreTension: 'tension',
            completedAt: '2026-01-01T00:00:00Z',
          },
          research: {
            researchSessionId: 'rs-1',
            approvedCardsCount: 3,
            researchLevel: 'medium',
            completedAt: '2026-01-01T01:00:00Z',
          },
        },
      })
      renderOpen()

      // Submit the form (all fields are pre-filled with defaults, so should be valid)
      const submitBtn = screen.getByRole('button', { name: /start autopilot|activate autopilot|go autopilot/i })
      await user.click(submitBtn)

      await waitFor(() => {
        expect(sendSpy).toHaveBeenCalledTimes(1)
      })

      const call = sendSpy.mock.calls[0][0] as { type: string; mode: string; autopilotConfig: unknown }
      expect(call.type).toBe('GO_AUTOPILOT')
      expect(call.mode).toMatch(/^(supervised|overview)$/)

      // Load-bearing contract test from plan lines 2272-2279
      expect(() => autopilotConfigSchema.parse(call.autopilotConfig)).not.toThrow()
    })
  })

  describe('rejects an invalid config inline (schema validation)', () => {
    it('shows inline error when hardFailThreshold >= autoApproveThreshold and does not call send', async () => {
      const user = userEvent.setup()
      snapshotOverride = makeSnapshot({
        value: 'draft',
        mode: 'step-by-step',
        autopilotConfig: null,
        stageResults: {},
      })
      renderOpen()

      // Brainstorm is not done; satisfy its required topic field so only the review error fires
      const topicInput = screen.getByTestId('brainstorm-topic-input')
      await user.type(topicInput, 'a topic')

      // Set hardFailThreshold to a value >= autoApproveThreshold (e.g., 95 >= 90)
      const hardFailInput = screen.getByTestId('review-hard-fail-threshold')
      await user.clear(hardFailInput)
      await user.type(hardFailInput, '95')

      const autoApproveInput = screen.getByTestId('review-auto-approve-threshold')
      await user.clear(autoApproveInput)
      await user.type(autoApproveInput, '90')

      const submitBtn = screen.getByRole('button', { name: /start autopilot|activate autopilot|go autopilot/i })
      await user.click(submitBtn)

      // Review error should be present among any alerts shown
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert')
        expect(alerts.some((el) => /lower than auto-approve|hard fail|infinite loop/i.test(el.textContent ?? ''))).toBe(true)
      })

      // send must NOT have been called
      expect(sendSpy).not.toHaveBeenCalled()
    })
  })

  describe('blocks submission when brainstorm is not done and required field is empty', () => {
    it('shows topic-required error and does not dispatch GO_AUTOPILOT (topic_driven mode, empty topic)', async () => {
      const user = userEvent.setup()
      snapshotOverride = makeSnapshot({
        value: 'draft',
        mode: 'step-by-step',
        autopilotConfig: null,
        stageResults: {},
      })
      renderOpen()

      // Brainstorm is not done; mode defaults to 'topic_driven'; topic input is empty
      const topicInput = screen.getByTestId('brainstorm-topic-input')
      expect(topicInput).toHaveValue('')

      const submitBtn = screen.getByRole('button', { name: /start autopilot|activate autopilot|go autopilot/i })
      await user.click(submitBtn)

      await waitFor(() => {
        const alerts = screen.getAllByRole('alert')
        expect(alerts.some((el) => /topic required/i.test(el.textContent ?? ''))).toBe(true)
      })

      expect(sendSpy).not.toHaveBeenCalled()
    })

    it('shows url-required error when reference_guided mode is selected without a URL', async () => {
      const user = userEvent.setup()
      snapshotOverride = makeSnapshot({
        value: 'draft',
        mode: 'step-by-step',
        autopilotConfig: null,
        stageResults: {},
      })
      renderOpen()

      // Switch brainstorm to reference_guided (target by id to avoid label ambiguity with "Autopilot mode")
      const modeSelect = document.getElementById('brainstorm-mode-select') as HTMLSelectElement
      await user.selectOptions(modeSelect, 'reference_guided')

      const submitBtn = screen.getByRole('button', { name: /start autopilot|activate autopilot|go autopilot/i })
      await user.click(submitBtn)

      await waitFor(() => {
        const alerts = screen.getAllByRole('alert')
        expect(alerts.some((el) => /url required/i.test(el.textContent ?? ''))).toBe(true)
      })

      expect(sendSpy).not.toHaveBeenCalled()
    })

    it('dispatches GO_AUTOPILOT when topic is provided in topic_driven mode', async () => {
      const user = userEvent.setup()
      snapshotOverride = makeSnapshot({
        value: 'draft',
        mode: 'step-by-step',
        autopilotConfig: null,
        stageResults: {},
      })
      renderOpen()

      const topicInput = screen.getByTestId('brainstorm-topic-input')
      await user.type(topicInput, 'AI agents in production')

      const submitBtn = screen.getByRole('button', { name: /start autopilot|activate autopilot|go autopilot/i })
      await user.click(submitBtn)

      await waitFor(() => expect(sendSpy).toHaveBeenCalledTimes(1))
      const call = sendSpy.mock.calls[0][0] as { type: string; autopilotConfig: { brainstorm: { topic: string } | null } }
      expect(call.type).toBe('GO_AUTOPILOT')
      expect(call.autopilotConfig.brainstorm?.topic).toBe('AI agents in production')
    })
  })
})
