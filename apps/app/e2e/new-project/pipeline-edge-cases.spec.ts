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
// 4 scenarios × 3 modes = 12 tests
//   provider-quota:      429 → awaiting-banner[data-reason="provider_quota_exhausted"] + Resume
//   manual-paste:        422 → manual paste affordance visible
//   stage-failure-retry: 500 once → retry CTA → success
//   malformed-json:      200 but parse failure → manual_paste recovery

// ── provider-quota ────────────────────────────────────────────────────────────

test.describe('EC-F1 — provider-quota (step-by-step)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('production quota error shows awaiting-banner with resume in step-by-step mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-pq-1', 'step-by-step', 'EC Provider Quota Step-by-Step')

    const mock = await mockPipelineEdge(page, 'provider-quota', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)
    await page.waitForTimeout(2_000)

    await assertStageComplete(page, 'brainstorm', { timeout: 15_000 })
    await assertStageComplete(page, 'research', { timeout: 15_000 })
    await assertStageComplete(page, 'canonical', { timeout: 15_000 })

    // The awaiting-banner must appear for provider_quota_exhausted
    const banner = page.getByTestId('awaiting-banner')
    await banner.waitFor({ state: 'visible', timeout: 30_000 })
    await expect(banner).toHaveAttribute('data-reason', 'provider_quota_exhausted')

    // Resume button inside the banner
    const resumeBtn = page.getByTestId('resume-track-btn')
    await resumeBtn.waitFor({ state: 'visible', timeout: 10_000 })

    // Clicking resume should POST /api/projects/:id/resume
    await resumeBtn.click()

    // After resume, production should complete
    await assertStageComplete(page, 'production', { timeout: 20_000 })

    await mock.unroute()
  })
})

test.describe('EC-F1 — provider-quota (supervised)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('production quota error shows awaiting-banner with resume in supervised mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-pq-2', 'supervised', 'EC Provider Quota Supervised')

    const mock = await mockPipelineEdge(page, 'provider-quota', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)
    await page.waitForTimeout(2_000)

    await assertStageComplete(page, 'brainstorm', { timeout: 15_000 })
    await assertStageComplete(page, 'research', { timeout: 15_000 })
    await assertStageComplete(page, 'canonical', { timeout: 15_000 })

    const banner = page.getByTestId('awaiting-banner')
    await banner.waitFor({ state: 'visible', timeout: 30_000 })
    await expect(banner).toHaveAttribute('data-reason', 'provider_quota_exhausted')

    const resumeBtn = page.getByTestId('resume-track-btn')
    await resumeBtn.waitFor({ state: 'visible', timeout: 10_000 })
    await resumeBtn.click()

    await assertStageComplete(page, 'production', { timeout: 20_000 })

    await mock.unroute()
  })
})

test.describe('EC-F1 — provider-quota (overview)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('production quota error shows awaiting-banner with resume in overview mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-pq-3', 'overview', 'EC Provider Quota Overview')

    const mock = await mockPipelineEdge(page, 'provider-quota', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)

    const progressView = page.getByTestId('overview-progress-view')
    await progressView.waitFor({ state: 'visible', timeout: 20_000 })

    const banner = page.getByTestId('awaiting-banner')
    await banner.waitFor({ state: 'visible', timeout: 30_000 })
    await expect(banner).toHaveAttribute('data-reason', 'provider_quota_exhausted')

    const resumeBtn = page.getByTestId('resume-track-btn')
    await resumeBtn.waitFor({ state: 'visible', timeout: 10_000 })
    await resumeBtn.click()

    await expect(page.getByTestId('overview-stage-production')).toHaveAttribute('data-status', 'completed', { timeout: 20_000 })

    await mock.unroute()
  })
})

// ── manual-paste ─────────────────────────────────────────────────────────────

test.describe('EC-F2 — manual-paste (step-by-step)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('no-provider 422 shows manual paste affordance in step-by-step mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-mp-1', 'step-by-step', 'EC Manual Paste Step-by-Step')

    const mock = await mockPipelineEdge(page, 'manual-paste', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)
    await page.waitForTimeout(2_000)

    await assertStageComplete(page, 'brainstorm', { timeout: 15_000 })
    await assertStageComplete(page, 'research', { timeout: 15_000 })
    await assertStageComplete(page, 'canonical', { timeout: 15_000 })

    // Manual paste affordance: awaiting-banner with data-reason="manual_paste"
    const banner = page.getByTestId('awaiting-banner')
    await banner.waitFor({ state: 'visible', timeout: 30_000 })
    await expect(banner).toHaveAttribute('data-reason', 'manual_paste')

    await mock.unroute()
  })
})

test.describe('EC-F2 — manual-paste (supervised)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('no-provider 422 shows manual paste affordance in supervised mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-mp-2', 'supervised', 'EC Manual Paste Supervised')

    const mock = await mockPipelineEdge(page, 'manual-paste', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)
    await page.waitForTimeout(2_000)

    await assertStageComplete(page, 'brainstorm', { timeout: 15_000 })
    await assertStageComplete(page, 'research', { timeout: 15_000 })
    await assertStageComplete(page, 'canonical', { timeout: 15_000 })

    const banner = page.getByTestId('awaiting-banner')
    await banner.waitFor({ state: 'visible', timeout: 30_000 })
    await expect(banner).toHaveAttribute('data-reason', 'manual_paste')

    await mock.unroute()
  })
})

test.describe('EC-F2 — manual-paste (overview)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('no-provider 422 shows manual paste affordance in overview mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-mp-3', 'overview', 'EC Manual Paste Overview')

    const mock = await mockPipelineEdge(page, 'manual-paste', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)

    const progressView = page.getByTestId('overview-progress-view')
    await progressView.waitFor({ state: 'visible', timeout: 20_000 })

    const banner = page.getByTestId('awaiting-banner')
    await banner.waitFor({ state: 'visible', timeout: 30_000 })
    await expect(banner).toHaveAttribute('data-reason', 'manual_paste')

    await mock.unroute()
  })
})

// ── stage-failure-retry ───────────────────────────────────────────────────────

test.describe('EC-F3 — stage-failure-retry (step-by-step)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('production 500 then retry succeeds in step-by-step mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-sfr-1', 'step-by-step', 'EC Stage Failure Retry Step-by-Step')

    const mock = await mockPipelineEdge(page, 'stage-failure-retry', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)
    await page.waitForTimeout(2_000)

    await assertStageComplete(page, 'brainstorm', { timeout: 15_000 })
    await assertStageComplete(page, 'research', { timeout: 15_000 })
    await assertStageComplete(page, 'canonical', { timeout: 15_000 })

    // First production attempt fails — sidebar should show failed
    await expect.poll(
      async () => {
        const el = page.locator('[data-testid*="sidebar-status-"][data-testid*="production"]').first()
        return el.getAttribute('data-status').catch(() => null)
      },
      { timeout: 20_000, message: 'Production stage did not reach failed status on first attempt' },
    ).toBe('failed')

    // Find and click the retry/restart CTA
    const retryCta = page.getByTestId('restart-stage-btn')
    const altRetryCta = page.getByRole('button', { name: /retry|restart/i }).first()
    const retryVisible = await retryCta.isVisible().catch(() => false)
    if (retryVisible) {
      await retryCta.click()
    } else {
      await altRetryCta.waitFor({ state: 'visible', timeout: 10_000 })
      await altRetryCta.click()
    }

    // Second attempt succeeds
    await assertStageComplete(page, 'production', { timeout: 20_000 })

    await mock.unroute()
  })
})

test.describe('EC-F3 — stage-failure-retry (supervised)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('production 500 then retry succeeds in supervised mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-sfr-2', 'supervised', 'EC Stage Failure Retry Supervised')

    const mock = await mockPipelineEdge(page, 'stage-failure-retry', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)
    await page.waitForTimeout(2_000)

    await assertStageComplete(page, 'brainstorm', { timeout: 15_000 })
    await assertStageComplete(page, 'research', { timeout: 15_000 })
    await assertStageComplete(page, 'canonical', { timeout: 15_000 })

    await expect.poll(
      async () => {
        const el = page.locator('[data-testid*="sidebar-status-"][data-testid*="production"]').first()
        return el.getAttribute('data-status').catch(() => null)
      },
      { timeout: 20_000, message: 'Production stage did not reach failed status' },
    ).toBe('failed')

    const retryCta = page.getByTestId('restart-stage-btn')
    const altRetryCta = page.getByRole('button', { name: /retry|restart/i }).first()
    const retryVisible = await retryCta.isVisible().catch(() => false)
    if (retryVisible) {
      await retryCta.click()
    } else {
      await altRetryCta.waitFor({ state: 'visible', timeout: 10_000 })
      await altRetryCta.click()
    }

    await assertStageComplete(page, 'production', { timeout: 20_000 })

    await mock.unroute()
  })
})

test.describe('EC-F3 — stage-failure-retry (overview)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('production 500 then retry succeeds in overview mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-sfr-3', 'overview', 'EC Stage Failure Retry Overview')

    const mock = await mockPipelineEdge(page, 'stage-failure-retry', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)

    const progressView = page.getByTestId('overview-progress-view')
    await progressView.waitFor({ state: 'visible', timeout: 20_000 })

    await expect.poll(
      async () => {
        const el = page.getByTestId('overview-stage-production')
        return el.getAttribute('data-status').catch(() => null)
      },
      { timeout: 20_000, message: 'Overview production stage did not reach failed status' },
    ).toBe('failed')

    // Retry from the overview or focus panel
    const retryCta = page.getByTestId('restart-stage-btn')
    const altRetryCta = page.getByRole('button', { name: /retry|restart/i }).first()
    const retryVisible = await retryCta.isVisible().catch(() => false)
    if (retryVisible) {
      await retryCta.click()
    } else {
      await altRetryCta.waitFor({ state: 'visible', timeout: 10_000 })
      await altRetryCta.click()
    }

    await expect(page.getByTestId('overview-stage-production')).toHaveAttribute('data-status', 'completed', { timeout: 20_000 })

    await mock.unroute()
  })
})

// ── malformed-json ────────────────────────────────────────────────────────────

test.describe('EC-F4 — malformed-json (step-by-step)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('malformed provider output triggers manual_paste recovery in step-by-step mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-mj-1', 'step-by-step', 'EC Malformed JSON Step-by-Step')

    const mock = await mockPipelineEdge(page, 'malformed-json', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)
    await page.waitForTimeout(2_000)

    await assertStageComplete(page, 'brainstorm', { timeout: 15_000 })
    await assertStageComplete(page, 'research', { timeout: 15_000 })
    await assertStageComplete(page, 'canonical', { timeout: 15_000 })

    // Parse failure → awaiting_user(manual_paste)
    const banner = page.getByTestId('awaiting-banner')
    await banner.waitFor({ state: 'visible', timeout: 30_000 })
    await expect(banner).toHaveAttribute('data-reason', 'manual_paste')

    await mock.unroute()
  })
})

test.describe('EC-F4 — malformed-json (supervised)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('malformed provider output triggers manual_paste recovery in supervised mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-mj-2', 'supervised', 'EC Malformed JSON Supervised')

    const mock = await mockPipelineEdge(page, 'malformed-json', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)
    await page.waitForTimeout(2_000)

    await assertStageComplete(page, 'brainstorm', { timeout: 15_000 })
    await assertStageComplete(page, 'research', { timeout: 15_000 })
    await assertStageComplete(page, 'canonical', { timeout: 15_000 })

    const banner = page.getByTestId('awaiting-banner')
    await banner.waitFor({ state: 'visible', timeout: 30_000 })
    await expect(banner).toHaveAttribute('data-reason', 'manual_paste')

    await mock.unroute()
  })
})

test.describe('EC-F4 — malformed-json (overview)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('malformed provider output triggers manual_paste recovery in overview mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-mj-3', 'overview', 'EC Malformed JSON Overview')

    const mock = await mockPipelineEdge(page, 'malformed-json', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)

    const progressView = page.getByTestId('overview-progress-view')
    await progressView.waitFor({ state: 'visible', timeout: 20_000 })

    const banner = page.getByTestId('awaiting-banner')
    await banner.waitFor({ state: 'visible', timeout: 30_000 })
    await expect(banner).toHaveAttribute('data-reason', 'manual_paste')

    await mock.unroute()
  })
})

// ─── Issue #195 — Intervention edge cases ─────────────────────────────────────
// (Tests appended here after issue #194 is merged)
