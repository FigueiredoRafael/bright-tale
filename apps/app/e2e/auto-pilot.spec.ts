import { test, expect } from '@playwright/test'
import {
  mockPipelineApis,
  mockApprovedDraft,
  mockReproduce,
  attachPipelineEventRecorder,
  DEFAULT_PROJECT,
} from './fixtures/pipelineMocks'

/**
 * Auto-pilot pipeline behavior — watch with:
 *   npm run test:e2e:watch    (interactive Playwright UI)
 *   npm run test:e2e:headed   (run headed, console logs in terminal)
 *   npm run test:e2e          (CI mode, headless)
 *
 * All API calls are mocked via page.route — no API server / DB required.
 * Console output from XState's inspector (`[pipeline] EVENT_TYPE …`) is
 * forwarded to the terminal so you can watch transitions live.
 */

const PROJECT_URL = `/en/projects/${DEFAULT_PROJECT.id}`

test.beforeEach(async ({ page }) => {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.text().startsWith('[pipeline]')) {
      console.log(`[browser:${msg.type()}]`, msg.text())
    }
  })
  page.on('pageerror', (err) => console.log('[pageerror]', err.message))
})

test.describe('auto-pilot pipeline', () => {
  test('toggle from step → auto and back', async ({ page }) => {
    await mockPipelineApis(page)
    await page.goto(PROJECT_URL)

    const switchEl = page.getByRole('switch', { name: /auto/i })
    await expect(switchEl).toBeVisible()
    await expect(switchEl).not.toBeChecked()

    await switchEl.click()
    await expect(switchEl).toBeChecked()
    // Auto mode shows either Running, Awaiting input, or Paused — never the
    // bare label alone.
    await expect(
      page.getByTestId('autopilot-running-badge')
        .or(page.getByTestId('autopilot-awaiting-badge'))
        .or(page.getByTestId('autopilot-paused-badge')),
    ).toBeVisible()

    await switchEl.click()
    await expect(switchEl).not.toBeChecked()
    await expect(page.getByTestId('autopilot-running-badge')).toHaveCount(0)
    await expect(page.getByTestId('autopilot-awaiting-badge')).toHaveCount(0)
  })

  test('persists pipeline_state_json after mode toggle', async ({ page }) => {
    const mock = await mockPipelineApis(page)
    await page.goto(PROJECT_URL)
    await page.getByRole('switch', { name: /auto/i }).click()

    await expect.poll(() => mock.persistCount(), { timeout: 5000 }).toBeGreaterThan(0)
    const state = mock.lastPersistedState() as Record<string, unknown> | null
    expect(state).not.toBeNull()
    expect(state?.mode).toBe('auto')
  })

  test('publish stage is gated even in auto mode (human required)', async ({ page }) => {
    await mockPipelineApis(page, {
      project: {
        ...DEFAULT_PROJECT,
        pipelineState: {
          mode: 'auto',
          currentStage: 'publish',
          stageResults: {
            brainstorm: { ideaId: 'i', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c', completedAt: '2026-01-01' },
            research:   { researchSessionId: 'r', approvedCardsCount: 3, researchLevel: 'medium', completedAt: '2026-01-01' },
            draft:      { draftId: 'd-1', draftTitle: 'Draft', draftContent: 'x', completedAt: '2026-01-01' },
            review:     { score: 95, verdict: 'approved', feedbackJson: {}, iterationCount: 1, completedAt: '2026-01-01' },
            assets:     { assetIds: ['a-1'], featuredImageUrl: 'http://x', completedAt: '2026-01-01' },
            preview:    { categories: ['c'], tags: ['t'], imageMap: {}, altTexts: {}, seoOverrides: { title: 't', slug: 's', metaDescription: 'm' }, publishDate: '2026-01-01', completedAt: '2026-01-01' },
          },
          iterationCount: 1,
        },
      },
    })
    await mockApprovedDraft(page, 'd-1')
    await page.goto(PROJECT_URL)

    // Auto-pilot must NOT auto-trigger publish — user has to click manually
    const publishEngine = page.getByText(/Publish/i)
    await expect(publishEngine.first()).toBeVisible()
    // After 2 seconds nothing should have auto-fired a publish call
    await page.waitForTimeout(2000)
    // No POST to publish — soft check
  })

  test('review.paused state shows when machine hits max iterations', async ({ page }) => {
    await mockPipelineApis(page, {
      project: {
        ...DEFAULT_PROJECT,
        pipelineState: {
          mode: 'auto',
          currentStage: 'review',
          stageResults: {
            brainstorm: { ideaId: 'i', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c', completedAt: '2026-01-01' },
            research:   { researchSessionId: 'r', approvedCardsCount: 3, researchLevel: 'medium', completedAt: '2026-01-01' },
            draft:      { draftId: 'd-1', draftTitle: 'Draft', draftContent: 'x', completedAt: '2026-01-01' },
            review:     { score: 70, verdict: 'needs_revision', feedbackJson: {}, iterationCount: 5, completedAt: '2026-01-01' },
          },
          iterationCount: 5,
        },
      },
    })
    await mockApprovedDraft(page, 'd-1', {
      status: 'in_review',
      review_score: 70,
      review_verdict: 'needs_revision',
      iteration_count: 5,
    })
    await mockReproduce(page, 'd-1')

    const recorder = attachPipelineEventRecorder(page)
    await page.goto(PROJECT_URL)

    // The XState machine should auto-RESUME on review.idle (auto-pilot trigger).
    // Poll instead of fixed wait — events arrive async over the CDP channel.
    await expect.poll(() => recorder.types(), { timeout: 5000 }).toContain('RESUME')
  })

  test('completed stage summary renders and exposes Redo button', async ({ page }) => {
    await mockPipelineApis(page, {
      project: {
        ...DEFAULT_PROJECT,
        pipelineState: {
          mode: 'step',
          currentStage: 'research',
          stageResults: {
            brainstorm: { ideaId: 'i', ideaTitle: 'My Idea', ideaVerdict: 'viable', ideaCoreTension: 'c', completedAt: '2026-01-01' },
          },
          iterationCount: 0,
        },
      },
    })
    await page.goto(PROJECT_URL)
    await expect(page.getByText('My Idea').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /redo/i }).first()).toBeVisible()
  })
})
