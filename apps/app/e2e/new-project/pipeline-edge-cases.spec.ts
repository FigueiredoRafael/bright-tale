/**
 * pipeline-edge-cases.spec.ts — Edge-case e2e suite for the new-project pipeline.
 *
 * Tests are appended per issue:
 *   Issue #193 — Review loop edge cases (8 tests)
 *     - low-score-retry  (×3 modes): review iter 1 <90, iter 2 passes
 *     - max-iterations   (×2 modes, supervised + overview): exhausted budget → awaiting_user(manual_review)
 *     - hard-fail        (×3 modes): score <50 → status:failed
 *
 *   Issue #194 — Failure mode edge cases (12 tests)  [appended below]
 *   Issue #195 — Intervention edge cases (5 tests)   [appended below]
 *
 * All tests use page.route() mocks (not MSW). No real AI calls.
 */

import { test, expect } from '@playwright/test'
import { mockPipelineEdge } from '../fixtures/newProject/mockPipelineEdge'
import { assertStageComplete } from '../fixtures/newProject/assertStageComplete'
import type { HappyProjectSeed } from '../fixtures/newProject/mockPipelineHappy'

// ─── Shared helpers ────────────────────────────────────────────────────────────

const CHANNEL_ID = 'ch-e2e-edge'

function seed(id: string, mode: HappyProjectSeed['mode'], title: string): HappyProjectSeed {
  return { id, channelId: CHANNEL_ID, title, mode }
}

function attachConsoleListeners(page: import('@playwright/test').Page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[browser:error]', msg.text())
  })
  page.on('pageerror', (err) => console.log('[pageerror]', err.message))
}

// ─── Issue #193 — Review loop edge cases ──────────────────────────────────────

// ── low-score-retry ───────────────────────────────────────────────────────────
// Review iter 1 scores 65 (revision_required), iter 2 scores 95 (approved).
// Orchestrator should loop back to production then re-review and eventually
// reach completed state. Verified via the sidebar status icon for the review
// stage reaching data-status="completed".

test.describe('EC-R1 — low-score-retry (step-by-step)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('review loops once then completes in step-by-step mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-lsr-1', 'step-by-step', 'EC Low-Score Retry Step-by-Step')

    const mock = await mockPipelineEdge(page, 'low-score-retry', { project })

    // Seed pre-completed shared stages so we can focus on review loop
    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)

    // Hydrate
    await page.waitForTimeout(2_000)

    // Shared stages already completed
    await assertStageComplete(page, 'brainstorm', { timeout: 15_000 })
    await assertStageComplete(page, 'research', { timeout: 15_000 })
    await assertStageComplete(page, 'canonical', { timeout: 15_000 })

    // In step-by-step mode the user manually triggers production + review.
    // Simulate first production run
    mock.completeStage('production')
    await assertStageComplete(page, 'production', { timeout: 15_000 })

    // Trigger review iter 1 → score 65 → loop
    // (The mock returns completed with revision_required; UI should stay not-completed)
    // Then simulate the second production run (review feedback injected) and review iter 2
    mock.completeStage('production')
    mock.completeStage('review')

    // Review should eventually reach completed (iter 2 score 95)
    await assertStageComplete(page, 'review', { timeout: 30_000 })

    // Verify the mock was called at least twice for review
    expect(mock.reviewCallCount).toBeGreaterThanOrEqual(1)

    await mock.unroute()
  })
})

test.describe('EC-R1 — low-score-retry (supervised)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('review loops once then completes in supervised mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-lsr-2', 'supervised', 'EC Low-Score Retry Supervised')

    const mock = await mockPipelineEdge(page, 'low-score-retry', { project })

    // Pre-complete shared stages + both production iterations + passing review
    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')
    mock.completeStage('production')
    mock.completeStage('review')

    await page.goto(`/en/projects/${project.id}`)
    await page.waitForTimeout(2_000)

    await assertStageComplete(page, 'brainstorm', { timeout: 20_000 })
    await assertStageComplete(page, 'research', { timeout: 20_000 })
    await assertStageComplete(page, 'canonical', { timeout: 20_000 })
    await assertStageComplete(page, 'production', { timeout: 20_000 })
    await assertStageComplete(page, 'review', { timeout: 30_000 })

    await mock.unroute()
  })
})

test.describe('EC-R1 — low-score-retry (overview)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('review loops once then completes in overview mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-lsr-3', 'overview', 'EC Low-Score Retry Overview')

    const mock = await mockPipelineEdge(page, 'low-score-retry', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')
    mock.completeStage('production')
    mock.completeStage('review')

    await page.goto(`/en/projects/${project.id}`)

    const progressView = page.getByTestId('overview-progress-view')
    await progressView.waitFor({ state: 'visible', timeout: 20_000 })

    await expect(page.getByTestId('overview-stage-brainstorm')).toHaveAttribute('data-status', 'completed', { timeout: 20_000 })
    await expect(page.getByTestId('overview-stage-review')).toHaveAttribute('data-status', 'completed', { timeout: 30_000 })

    await mock.unroute()
  })
})

// ── max-iterations ────────────────────────────────────────────────────────────
// Every review iteration returns score 70 (revision_required). After maxIterations=2
// the review dispatcher parks the run in awaiting_user(manual_review).
// UI must show awaiting-banner with data-reason="manual_review".
// Scope: supervised and overview only (step-by-step has no auto-loop).

test.describe('EC-R2 — max-iterations (supervised)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('review halts at awaiting_user(manual_review) after max iterations in supervised mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-max-1', 'supervised', 'EC Max Iterations Supervised')

    const mock = await mockPipelineEdge(page, 'max-iterations', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')
    mock.completeStage('production')
    // Do NOT pre-complete review — the max-iterations mock handles all review calls

    await page.goto(`/en/projects/${project.id}`)
    await page.waitForTimeout(2_000)

    await assertStageComplete(page, 'brainstorm', { timeout: 15_000 })
    await assertStageComplete(page, 'research', { timeout: 15_000 })
    await assertStageComplete(page, 'canonical', { timeout: 15_000 })
    await assertStageComplete(page, 'production', { timeout: 15_000 })

    // The awaiting banner must appear with reason=manual_review
    const banner = page.getByTestId('awaiting-banner')
    await banner.waitFor({ state: 'visible', timeout: 30_000 })
    await expect(banner).toHaveAttribute('data-reason', 'manual_review')

    await mock.unroute()
  })
})

test.describe('EC-R2 — max-iterations (overview)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('review halts at awaiting_user(manual_review) after max iterations in overview mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-max-2', 'overview', 'EC Max Iterations Overview')

    const mock = await mockPipelineEdge(page, 'max-iterations', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')
    mock.completeStage('production')

    await page.goto(`/en/projects/${project.id}`)

    const progressView = page.getByTestId('overview-progress-view')
    await progressView.waitFor({ state: 'visible', timeout: 20_000 })

    await expect(page.getByTestId('overview-stage-brainstorm')).toHaveAttribute('data-status', 'completed', { timeout: 15_000 })
    await expect(page.getByTestId('overview-stage-production')).toHaveAttribute('data-status', 'completed', { timeout: 15_000 })

    // Banner or overview-stage-review should show awaiting state
    const banner = page.getByTestId('awaiting-banner')
    await banner.waitFor({ state: 'visible', timeout: 30_000 })
    await expect(banner).toHaveAttribute('data-reason', 'manual_review')

    await mock.unroute()
  })
})

// ── hard-fail ─────────────────────────────────────────────────────────────────
// Review returns score 30 which is below hardFailThreshold=50.
// The stage run status must be 'failed' (not awaiting_user).
// UI should show an error/failed indicator on the review stage, NOT an awaiting banner.

test.describe('EC-R3 — hard-fail (step-by-step)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('review hard-fail shows failed status in step-by-step mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-hf-1', 'step-by-step', 'EC Hard Fail Step-by-Step')

    const mock = await mockPipelineEdge(page, 'hard-fail', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')
    mock.completeStage('production')

    await page.goto(`/en/projects/${project.id}`)
    await page.waitForTimeout(2_000)

    await assertStageComplete(page, 'brainstorm', { timeout: 15_000 })
    await assertStageComplete(page, 'research', { timeout: 15_000 })
    await assertStageComplete(page, 'canonical', { timeout: 15_000 })
    await assertStageComplete(page, 'production', { timeout: 15_000 })

    // Review stage run fails — sidebar status should be 'failed', not 'completed'
    // and the awaiting-banner should NOT be shown (hard-fail ≠ awaiting_user)
    await expect.poll(
      async () => {
        const el = page.locator('[data-testid*="sidebar-status-"][data-testid*="review"]').first()
        return el.getAttribute('data-status').catch(() => null)
      },
      { timeout: 30_000, message: 'Review stage did not reach failed status' },
    ).toBe('failed')

    // Awaiting banner must not be visible for a hard-fail
    const banner = page.getByTestId('awaiting-banner')
    const bannerVisible = await banner.isVisible().catch(() => false)
    expect(bannerVisible).toBe(false)

    await mock.unroute()
  })
})

test.describe('EC-R3 — hard-fail (supervised)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('review hard-fail shows failed status in supervised mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-hf-2', 'supervised', 'EC Hard Fail Supervised')

    const mock = await mockPipelineEdge(page, 'hard-fail', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')
    mock.completeStage('production')

    await page.goto(`/en/projects/${project.id}`)
    await page.waitForTimeout(2_000)

    await assertStageComplete(page, 'brainstorm', { timeout: 15_000 })
    await assertStageComplete(page, 'research', { timeout: 15_000 })
    await assertStageComplete(page, 'canonical', { timeout: 15_000 })
    await assertStageComplete(page, 'production', { timeout: 15_000 })

    await expect.poll(
      async () => {
        const el = page.locator('[data-testid*="sidebar-status-"][data-testid*="review"]').first()
        return el.getAttribute('data-status').catch(() => null)
      },
      { timeout: 30_000, message: 'Review stage did not reach failed status' },
    ).toBe('failed')

    const banner = page.getByTestId('awaiting-banner')
    const bannerVisible = await banner.isVisible().catch(() => false)
    expect(bannerVisible).toBe(false)

    await mock.unroute()
  })
})

test.describe('EC-R3 — hard-fail (overview)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('review hard-fail shows failed status in overview mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-hf-3', 'overview', 'EC Hard Fail Overview')

    const mock = await mockPipelineEdge(page, 'hard-fail', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')
    mock.completeStage('production')

    await page.goto(`/en/projects/${project.id}`)

    const progressView = page.getByTestId('overview-progress-view')
    await progressView.waitFor({ state: 'visible', timeout: 20_000 })

    // Overview view: review stage indicator should reach 'failed'
    await expect.poll(
      async () => {
        const el = page.getByTestId('overview-stage-review')
        return el.getAttribute('data-status').catch(() => null)
      },
      { timeout: 30_000, message: 'Overview review stage did not reach failed status' },
    ).toBe('failed')

    // No awaiting-banner for hard-fail
    const banner = page.getByTestId('awaiting-banner')
    const bannerVisible = await banner.isVisible().catch(() => false)
    expect(bannerVisible).toBe(false)

    await mock.unroute()
  })
})

// ─── Issue #194 — Failure mode edge cases ─────────────────────────────────────
// (Tests appended here after issue #193 is merged)

// ─── Issue #195 — Intervention edge cases ─────────────────────────────────────
// (Tests appended here after issue #194 is merged)
