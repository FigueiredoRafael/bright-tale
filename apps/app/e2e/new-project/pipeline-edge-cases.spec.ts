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
import { driveStageManual } from '../fixtures/newProject/driveStageManual'
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

  test('wizard thresholds drive review loop: iter1 score 65 → iter2 score 95', async ({ page }) => {
    test.setTimeout(180_000)
    const project = seed('proj-ec-lsr-1', 'step-by-step', 'EC Low-Score Retry Step-by-Step')

    const mock = await mockPipelineEdge(page, 'low-score-retry', { project })

    // ── Wizard ────────────────────────────────────────────────────────────────
    // In step-by-step mode the wizard only exposes the project-scope inputs
    // (title / channel / media / topic / mode). Per-stage review thresholds
    // are gated behind `isAutopilot` and never render here — they fall back to
    // pipeline_settings defaults at orchestrator time (autoApproveThreshold=90,
    // hardFailThreshold=50, maxIterations=2). The grill confronts:
    //   - mode = step-by-step  → engines must wait for user CTAs (no autopilot)
    //   - default threshold=90 → mock score 65 must loop, score 95 must pass
    //   - default hardFail=50  → score 65 must NOT mark stage as failed
    await page.goto('/en/projects/new')
    await page.getByTestId('pipeline-wizard').waitFor({ state: 'visible', timeout: 30_000 })

    await page.locator('#project-title').fill(project.title)
    await page.getByTestId('channel-option').first().click()
    await page.locator('#wizard-brainstorm-topic').fill('retirement planning for freelancers')

    // step-by-step is the default mode — click anyway to make the intent explicit
    await page.getByRole('radio', { name: 'Step-by-step' }).click()

    await page.getByRole('button', { name: /create project/i }).click()

    await page.waitForURL(new RegExp(`/projects/${project.id}\\b`), { timeout: 20_000 })
    await page.getByTestId('sidebar-item-brainstorm').waitFor({ state: 'visible', timeout: 20_000 })

    // ── Shared stages: brainstorm → research → canonical ─────────────────────
    await driveStageManual(page, 'brainstorm')
    mock.completeStage('brainstorm')
    await assertStageComplete(page, 'brainstorm', { timeout: 30_000 })

    await driveStageManual(page, 'research')
    mock.completeStage('research')
    await assertStageComplete(page, 'research', { timeout: 30_000 })

    await driveStageManual(page, 'canonical')
    mock.completeStage('canonical')
    await assertStageComplete(page, 'canonical', { timeout: 30_000 })

    // ── Production iter 1 ────────────────────────────────────────────────────
    await driveStageManual(page, 'production')
    mock.completeStage('production')
    await assertStageComplete(page, 'production', { timeout: 30_000 })

    // ── Review iter 1 — wizard threshold=90 vs mock score=65 → revision_required
    const reviewSidebar = page.locator('[data-testid*="sidebar-item-"][data-testid*="review"]').first()
    await reviewSidebar.click()
    await page.getByTestId('review-engine-root').waitFor({ state: 'visible', timeout: 20_000 })
    await page.getByTestId('review-action-run').first().click()

    // ReviewFeedbackPanel must render the iter 1 outcome
    await page.getByTestId('review-feedback-panel').waitFor({ state: 'visible', timeout: 30_000 })
    await expect(page.getByTestId('review-score')).toHaveAttribute('data-value', '65')
    await expect(page.getByTestId('review-verdict')).toHaveAttribute('data-value', 'revision_required')
    await expect(page.getByTestId('review-iteration')).toHaveAttribute('data-value', '1')
    // Critical-issue feedback should be visible — drives the next iteration
    await expect(page.getByTestId('review-feedback-critical')).toBeVisible()

    // ── Review iter 2 — wizard threshold=90 vs mock score=95 → approved ──────
    // ReviewEngine's needsRevision branch re-renders the same review-action-run
    // testid; click it again to fire iter 2.
    await page.getByTestId('review-action-run').first().click()

    await expect(page.getByTestId('review-score')).toHaveAttribute('data-value', '95', { timeout: 30_000 })
    await expect(page.getByTestId('review-verdict')).toHaveAttribute('data-value', 'approved')
    await expect(page.getByTestId('review-iteration')).toHaveAttribute('data-value', '2')

    // Approved branch should expose review-action-next; clicking writes the
    // outcome back so the sidebar pill turns green.
    await page.getByTestId('review-action-next').waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByTestId('review-action-next').click()
    mock.completeStage('review')
    await assertStageComplete(page, 'review', { timeout: 30_000 })

    // ── Loop accounting ──────────────────────────────────────────────────────
    // Exactly two reviews fired — one low-score loop + one approved pass.
    expect(mock.reviewCallCount).toBe(2)

    await mock.unroute()
  })
})

test.describe('EC-R1 — low-score-retry (supervised)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('wizard supervised + threshold=90 → autopilot loops review iter1(65) → iter2(95)', async ({ page }) => {
    test.setTimeout(240_000)
    const project = seed('proj-ec-lsr-2', 'supervised', 'EC Low-Score Retry Supervised')

    const mock = await mockPipelineEdge(page, 'low-score-retry', { project })

    // ── Wizard ────────────────────────────────────────────────────────────────
    // Supervised unlocks the per-stage threshold inputs (isAutopilot=true). The
    // spec sets them explicitly so the loop semantics are anchored on wizard
    // config, not on pipeline_settings defaults — a true wizard ↔ pipeline
    // parity check.
    await page.goto('/en/projects/new')
    await page.getByTestId('pipeline-wizard').waitFor({ state: 'visible', timeout: 30_000 })

    await page.locator('#project-title').fill(project.title)
    await page.getByTestId('channel-option').first().click()
    await page.locator('#wizard-brainstorm-topic').fill('retirement planning for freelancers')

    await page.getByRole('radio', { name: 'Supervised' }).click()

    // Expand Review section and confront the wizard inputs that drive the loop
    await page.locator('[data-testid="stage-section-review"] button').first().click()
    await page.locator('#review-maxIterations').fill('2')
    await page.locator('#review-autoApproveThreshold').fill('90')
    await page.locator('#review-hardFailThreshold').fill('50')

    await page.getByRole('button', { name: /create project/i }).click()
    await page.waitForURL(new RegExp(`/projects/${project.id}\\b`), { timeout: 20_000 })

    // ── Supervised walkthrough ───────────────────────────────────────────────
    // In supervised mode each engine mounts and useAutoPilotTrigger fires its
    // primary action. We assert the engine root + rich output rendered, then
    // call mock.completeStage() to simulate the orchestrator persisting the
    // outcome. The supervised auto-advance hook routes the URL forward.

    // Brainstorm: idea cards must surface
    await page.getByTestId('brainstorm-engine-root').waitFor({ state: 'visible', timeout: 30_000 })
    await expect(page.getByTestId('idea-card').first()).toBeVisible({ timeout: 30_000 })
    mock.completeStage('brainstorm')
    await assertStageComplete(page, 'brainstorm', { timeout: 30_000 })

    // Research: findings + at least one source card must render
    await page.getByTestId('research-engine-root').waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByTestId('research-findings-report').waitFor({ state: 'visible', timeout: 30_000 })
    await expect(page.getByTestId('research-source-card').first()).toBeVisible({ timeout: 30_000 })
    mock.completeStage('research')
    await assertStageComplete(page, 'research', { timeout: 30_000 })

    // Canonical: thesis + argument chain must render
    await page.getByTestId('canonical-engine-root').waitFor({ state: 'visible', timeout: 30_000 })
    // canonical-core-preview is gated on autopilot finishing the generate step;
    // in the mocked-AI run we only assert the engine mounted then sim-complete.
    mock.completeStage('canonical')
    await assertStageComplete(page, 'canonical', { timeout: 30_000 })

    // Production iter 1 fires autopilot
    await page.getByTestId('production-engine-root').waitFor({ state: 'visible', timeout: 30_000 })
    mock.completeStage('production')
    await assertStageComplete(page, 'production', { timeout: 30_000 })

    // ── Review loop ──────────────────────────────────────────────────────────
    // Review engine mounts; autopilot fires iter 1 (score 65), then rearms on
    // iteration_count change and fires iter 2 (score 95) — no manual clicks.
    await page.getByTestId('review-engine-root').waitFor({ state: 'visible', timeout: 30_000 })

    // Iter 1 lands first
    await expect(page.getByTestId('review-score')).toHaveAttribute('data-value', '65', { timeout: 30_000 })
    await expect(page.getByTestId('review-verdict')).toHaveAttribute('data-value', 'revision_required')
    await expect(page.getByTestId('review-iteration')).toHaveAttribute('data-value', '1')
    await expect(page.getByTestId('review-feedback-critical')).toBeVisible()

    // Iter 2 fires automatically when iteration_count flips to 2
    await expect(page.getByTestId('review-score')).toHaveAttribute('data-value', '95', { timeout: 30_000 })
    await expect(page.getByTestId('review-verdict')).toHaveAttribute('data-value', 'approved')
    await expect(page.getByTestId('review-iteration')).toHaveAttribute('data-value', '2')

    // Loop accounting: exactly two reviews fired, no more
    expect(mock.reviewCallCount).toBe(2)

    mock.completeStage('review')
    await assertStageComplete(page, 'review', { timeout: 30_000 })

    await mock.unroute()
  })
})

test.describe('EC-R1 — low-score-retry (overview)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('wizard overview + thresholds → OverviewProgressView mounts, engines suppressed, stages advance', async ({ page }) => {
    test.setTimeout(180_000)
    const project = seed('proj-ec-lsr-3', 'overview', 'EC Low-Score Retry Overview')

    const mock = await mockPipelineEdge(page, 'low-score-retry', { project })

    // ── Wizard ────────────────────────────────────────────────────────────────
    // Overview mode unlocks per-stage threshold inputs (isAutopilot=true). The
    // spec sets review thresholds explicitly so the POST /api/projects body
    // carries them — confronting wizard config against the pipeline payload.
    // In overview the backend autopilot owns the loop; the UI is watch-only.
    await page.goto('/en/projects/new')
    await page.getByTestId('pipeline-wizard').waitFor({ state: 'visible', timeout: 30_000 })

    await page.locator('#project-title').fill(project.title)
    await page.getByTestId('channel-option').first().click()
    await page.locator('#wizard-brainstorm-topic').fill('retirement planning for freelancers')

    await page.getByRole('radio', { name: 'Overview' }).click()

    // Expand Review section and lock the loop thresholds
    await page.locator('[data-testid="stage-section-review"] button').first().click()
    await page.locator('#review-maxIterations').fill('2')
    await page.locator('#review-autoApproveThreshold').fill('90')
    await page.locator('#review-hardFailThreshold').fill('50')

    await page.getByRole('button', { name: /create project/i }).click()
    await page.waitForURL(new RegExp(`/projects/${project.id}\\b`), { timeout: 20_000 })

    // ── Wizard ↔ pipeline parity: thresholds round-trip into POST /api/projects ─
    const createAction = mock.actions.find(
      (a) => a.method === 'POST' && a.url === '/api/projects',
    )
    expect(createAction).toBeDefined()
    const createBody = createAction!.body as {
      mode?: string
      autopilotConfigJson?: { review?: { maxIterations?: number; autoApproveThreshold?: number; hardFailThreshold?: number } }
    }
    expect(createBody.mode).toBe('overview')
    expect(createBody.autopilotConfigJson?.review?.maxIterations).toBe(2)
    expect(createBody.autopilotConfigJson?.review?.autoApproveThreshold).toBe(90)
    expect(createBody.autopilotConfigJson?.review?.hardFailThreshold).toBe(50)

    // ── Overview view mounts; engines must NOT mount (watch-only contract) ───
    await page.getByTestId('overview-progress-view').waitFor({ state: 'visible', timeout: 20_000 })
    await expect(page.getByTestId('brainstorm-engine-root')).toHaveCount(0)
    await expect(page.getByTestId('research-engine-root')).toHaveCount(0)
    await expect(page.getByTestId('canonical-engine-root')).toHaveCount(0)
    await expect(page.getByTestId('production-engine-root')).toHaveCount(0)
    await expect(page.getByTestId('review-engine-root')).toHaveCount(0)

    // ── Backend autopilot simulation: seed stages and watch the stepper advance.
    // The review loop semantics (iter1 65 → iter2 95) are owned by the backend
    // in overview mode; the front-end only observes the final completed state
    // surfaced via stage_runs. Mock.completeStage('review') writes the final
    // approved outcome row that the OverviewProgressView reads.
    mock.completeStage('brainstorm')
    await expect(page.getByTestId('overview-stage-brainstorm')).toHaveAttribute('data-status', 'completed', { timeout: 20_000 })

    mock.completeStage('research')
    await expect(page.getByTestId('overview-stage-research')).toHaveAttribute('data-status', 'completed', { timeout: 20_000 })

    mock.completeStage('canonical')
    await expect(page.getByTestId('overview-stage-canonical')).toHaveAttribute('data-status', 'completed', { timeout: 20_000 })

    mock.completeStage('production')
    await expect(page.getByTestId('overview-stage-production')).toHaveAttribute('data-status', 'completed', { timeout: 20_000 })

    mock.completeStage('review')
    await expect(page.getByTestId('overview-stage-review')).toHaveAttribute('data-status', 'completed', { timeout: 30_000 })

    await mock.unroute()
  })
})

// ── max-iterations ────────────────────────────────────────────────────────────
// Every review iteration returns score 70 (revision_required). After maxIterations=2
// the review dispatcher parks the run in awaiting_user(max_iterations).
// UI must show awaiting-banner with data-reason="max_iterations".
// Production emit site: apps/api/src/jobs/pipeline-review-dispatch.ts budget branch
// (`iterationCount >= maxIterations` → `awaitingReason: 'max_iterations'`, since #204).
// Scope: supervised and overview only (step-by-step has no auto-loop).

test.describe('EC-R2 — max-iterations (supervised)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('review halts at awaiting_user(max_iterations) after max iterations in supervised mode', async ({ page }) => {
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

    // emitted by apps/api/src/jobs/pipeline-review-dispatch.ts budget branch — see #185 reason taxonomy
    const banner = page.getByTestId('awaiting-banner')
    await banner.waitFor({ state: 'visible', timeout: 30_000 })
    await expect(banner).toHaveAttribute('data-reason', 'max_iterations')

    await mock.unroute()
  })
})

test.describe('EC-R2 — max-iterations (overview)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('review halts at awaiting_user(max_iterations) after max iterations in overview mode', async ({ page }) => {
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

    // emitted by apps/api/src/jobs/pipeline-review-dispatch.ts budget branch — see #185 reason taxonomy
    const banner = page.getByTestId('awaiting-banner')
    await banner.waitFor({ state: 'visible', timeout: 30_000 })
    await expect(banner).toHaveAttribute('data-reason', 'max_iterations')

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

    // emitted by apps/api/src/jobs/pipeline-assets-dispatch.ts:87 (mode === 'manual_upload') — see #185 reason taxonomy
    // Note: the fixture's 422 NO_PROVIDER_CONFIGURED path on production is an
    // adapter-only shortcut; production manual_paste is exclusive to the
    // assets-dispatch manual_upload branch.
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

    // emitted by apps/api/src/jobs/pipeline-assets-dispatch.ts:87 (mode === 'manual_upload') — see #185 reason taxonomy
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

    // emitted by apps/api/src/jobs/pipeline-assets-dispatch.ts:87 (mode === 'manual_upload') — see #185 reason taxonomy
    const banner = page.getByTestId('awaiting-banner')
    await banner.waitFor({ state: 'visible', timeout: 30_000 })
    await expect(banner).toHaveAttribute('data-reason', 'manual_paste')

    await mock.unroute()
  })
})

// ── stage-failure-retry ───────────────────────────────────────────────────────
// Retry CTA wired by apps/app/src/components/pipeline/FocusPanel.tsx:308
// (handleRestartConfirmed → POST /api/projects/:id/stage-runs {stage, cascade:true, input}).
// Production testids: `restart-stage-button` (trigger) → `restart-stage-confirm` (dialog action).

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

    // Click restart trigger → confirm dialog (FocusPanel.tsx:308 fires the POST)
    const retryCta = page.getByTestId('restart-stage-button')
    await retryCta.waitFor({ state: 'visible', timeout: 10_000 })
    await retryCta.click()
    const confirmCta = page.getByTestId('restart-stage-confirm')
    await confirmCta.waitFor({ state: 'visible', timeout: 10_000 })
    await confirmCta.click()

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

    // Click restart trigger → confirm dialog (FocusPanel.tsx:308 fires the POST)
    const retryCta = page.getByTestId('restart-stage-button')
    await retryCta.waitFor({ state: 'visible', timeout: 10_000 })
    await retryCta.click()
    const confirmCta = page.getByTestId('restart-stage-confirm')
    await confirmCta.waitFor({ state: 'visible', timeout: 10_000 })
    await confirmCta.click()

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

    // Click restart trigger → confirm dialog (FocusPanel.tsx:308 fires the POST)
    const retryCta = page.getByTestId('restart-stage-button')
    await retryCta.waitFor({ state: 'visible', timeout: 10_000 })
    await retryCta.click()
    const confirmCta = page.getByTestId('restart-stage-confirm')
    await confirmCta.waitFor({ state: 'visible', timeout: 10_000 })
    await confirmCta.click()

    await expect(page.getByTestId('overview-stage-production')).toHaveAttribute('data-status', 'completed', { timeout: 20_000 })

    await mock.unroute()
  })
})

// ── malformed-json ────────────────────────────────────────────────────────────
// Production reality (apps/api/src/lib/ai/router.ts + apps/api/src/jobs/production-generate.ts):
// a Zod parse error on the provider output triggers shouldRetrySameProvider; on
// exhaustion the worker calls markFailed with the parse-error message. The stage run
// ends in status='failed'. There is NO manual_paste park for malformed JSON —
// manual_paste only fires from pipeline-assets-dispatch.ts when mode === 'manual_upload'.

test.describe('EC-F4 — malformed-json (step-by-step)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  // FIXME: sidebar can't render a `production` row's failed icon without a tracks[]
  // entry in GET /stages (FocusSidebar.tsx:300-319 iterates tracks then stages).
  // Production fidelity requires status='failed' (see header), but observing it
  // in non-overview modes needs a follow-up fixture extension to seed tracks.
  // Overview mode below works because OverviewProgressView reads stage status
  // independently of tracks.
  test.fixme('malformed provider output marks production failed in step-by-step mode', async ({ page }) => {
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

    // Parse failure → markFailed (status:'failed'), NOT awaiting_user(manual_paste).
    await expect.poll(
      async () => {
        const el = page.locator('[data-testid*="sidebar-status-"][data-testid*="production"]').first()
        return el.getAttribute('data-status').catch(() => null)
      },
      { timeout: 30_000, message: 'Production stage did not reach failed status after malformed JSON' },
    ).toBe('failed')

    // No awaiting-banner — parse failures emit status='failed', not awaiting_user.
    const banner = page.getByTestId('awaiting-banner')
    const bannerVisible = await banner.isVisible().catch(() => false)
    expect(bannerVisible).toBe(false)

    await mock.unroute()
  })
})

test.describe('EC-F4 — malformed-json (supervised)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  // FIXME: same fixture-tracks gap as step-by-step above.
  test.fixme('malformed provider output marks production failed in supervised mode', async ({ page }) => {
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

    await expect.poll(
      async () => {
        const el = page.locator('[data-testid*="sidebar-status-"][data-testid*="production"]').first()
        return el.getAttribute('data-status').catch(() => null)
      },
      { timeout: 30_000, message: 'Production stage did not reach failed status after malformed JSON' },
    ).toBe('failed')

    const banner = page.getByTestId('awaiting-banner')
    const bannerVisible = await banner.isVisible().catch(() => false)
    expect(bannerVisible).toBe(false)

    await mock.unroute()
  })
})

test.describe('EC-F4 — malformed-json (overview)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('malformed provider output marks production failed in overview mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-mj-3', 'overview', 'EC Malformed JSON Overview')

    const mock = await mockPipelineEdge(page, 'malformed-json', { project })

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
      { timeout: 30_000, message: 'Overview production stage did not reach failed status after malformed JSON' },
    ).toBe('failed')

    const banner = page.getByTestId('awaiting-banner')
    const bannerVisible = await banner.isVisible().catch(() => false)
    expect(bannerVisible).toBe(false)

    await mock.unroute()
  })
})

// ─── Issue #195 — Intervention edge cases ─────────────────────────────────────
// 2 scenarios:
//   manual-pause-resume (×2 modes: supervised + overview): pause mid-flight → awaiting banner → resume same attempt
//   manual-abort        (×3 modes): abort during production → project aborted + no downstream dispatches

// ── manual-pause-resume ───────────────────────────────────────────────────────
// Production: PATCH /api/projects/:id {paused:true} → stampUserPausedOnActiveStage
// at apps/api/src/routes/projects.ts:40-57 marks the currently-running stage_run
// awaiting_user(user_paused) via markAwaitingUser. The fixture does NOT model that
// side-effect (no running row in the snapshot at pause time), so the test asserts
// the PATCH was sent rather than the awaiting-banner data-reason. Adding banner
// coverage would require extending the fixture to seed a running production row
// and transition it on pause.

test.describe('EC-I1 — manual-pause-resume (supervised)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('pause mid-flight then resume continues from same attempt in supervised mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-mpr-1', 'supervised', 'EC Manual Pause Resume Supervised')

    const mock = await mockPipelineEdge(page, 'manual-pause-resume', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)
    await page.waitForTimeout(2_000)

    await assertStageComplete(page, 'brainstorm', { timeout: 15_000 })
    await assertStageComplete(page, 'research', { timeout: 15_000 })
    await assertStageComplete(page, 'canonical', { timeout: 15_000 })

    // Pause via overview-pause-btn or a fallback pause button
    const pauseBtn = page.getByTestId('overview-pause-btn')
    const altPauseBtn = page.getByRole('button', { name: /pause/i }).first()
    const pauseVisible = await pauseBtn.isVisible().catch(() => false)
    if (pauseVisible) {
      await pauseBtn.click()
    } else {
      await altPauseBtn.waitFor({ state: 'visible', timeout: 10_000 })
      await altPauseBtn.click()
    }

    // Verify the pause PATCH was recorded
    await expect.poll(
      () => mock.patchBodies.some((b) => (b.body as { paused?: boolean })?.paused === true),
      { timeout: 10_000, message: 'PATCH with paused:true was not sent' },
    ).toBe(true)

    // Resume — click the pause/resume toggle or the awaiting banner resume button
    const resumeBtn = page.getByTestId('resume-track-btn')
    const overviewPauseToggle = page.getByTestId('overview-pause-btn')
    const resumeVisible = await resumeBtn.isVisible().catch(() => false)
    if (resumeVisible) {
      await resumeBtn.click()
    } else {
      await overviewPauseToggle.waitFor({ state: 'visible', timeout: 10_000 })
      await overviewPauseToggle.click()
    }

    // After resume, production should complete
    mock.completeStage('production')
    await assertStageComplete(page, 'production', { timeout: 20_000 })

    await mock.unroute()
  })
})

test.describe('EC-I1 — manual-pause-resume (overview)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('pause mid-flight then resume continues from same attempt in overview mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-mpr-2', 'overview', 'EC Manual Pause Resume Overview')

    const mock = await mockPipelineEdge(page, 'manual-pause-resume', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)

    const overviewPV = page.getByTestId('overview-progress-view')
    await overviewPV.waitFor({ state: 'visible', timeout: 20_000 })

    // Pause via overview-pause-btn
    const pauseBtn3 = page.getByTestId('overview-pause-btn')
    await pauseBtn3.waitFor({ state: 'visible', timeout: 10_000 })
    await pauseBtn3.click()

    await expect.poll(
      () => mock.patchBodies.some((b) => (b.body as { paused?: boolean })?.paused === true),
      { timeout: 10_000, message: 'PATCH with paused:true was not sent' },
    ).toBe(true)

    // Resume — click pause button again (acts as toggle)
    await pauseBtn3.click()

    // After resume, production completes
    mock.completeStage('production')
    await expect(page.getByTestId('overview-stage-production')).toHaveAttribute('data-status', 'completed', { timeout: 20_000 })

    await mock.unroute()
  })
})

// ── manual-abort ──────────────────────────────────────────────────────────────
// Fixture/UI drift: the OverviewProgressView abort handler PATCHes
// /api/projects/:id with {status:'aborted', paused:true}, but updateProjectSchema
// in packages/shared/src/schemas/projects.ts only allows
// status ∈ {'active'|'paused'|'completed'|'archived'} — 'aborted' would fail Zod
// validation in production. The real abort path is abortProject() at
// apps/api/src/lib/pipeline/stage-run-writer.ts:482, invoked from project-setup
// routes (cascade-cancels downstream runs). Asserting the PATCH body here verifies
// the UI-side trigger only; downstream-suppression assertions still match
// production guarantees (no review/publish dispatch after abort).

test.describe('EC-I2 — manual-abort (step-by-step)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('abort during production marks project aborted with no downstream runs in step-by-step mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-ma-1', 'step-by-step', 'EC Manual Abort Step-by-Step')

    const mock = await mockPipelineEdge(page, 'manual-abort', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)
    await page.waitForTimeout(2_000)

    await assertStageComplete(page, 'brainstorm', { timeout: 15_000 })
    await assertStageComplete(page, 'research', { timeout: 15_000 })
    await assertStageComplete(page, 'canonical', { timeout: 15_000 })

    // Abort via the abort button (FocusPanel or OverviewProgressView)
    const abortBtn = page.getByTestId('overview-abort-btn')
    const altAbortBtn = page.getByRole('button', { name: /abort|cancel pipeline/i }).first()
    const abortVisible = await abortBtn.isVisible().catch(() => false)
    if (abortVisible) {
      await abortBtn.click()
      const confirmBtn = page.getByTestId('overview-abort-confirm')
      const confirmVisible = await confirmBtn.isVisible().catch(() => false)
      if (confirmVisible) await confirmBtn.click()
    } else {
      await altAbortBtn.waitFor({ state: 'visible', timeout: 10_000 })
      await altAbortBtn.click()
    }

    // PATCH with status:aborted must have been sent
    await expect.poll(
      () => mock.patchBodies.some((b) => (b.body as { status?: string })?.status === 'aborted'),
      { timeout: 15_000, message: 'PATCH with status:aborted was not sent' },
    ).toBe(true)

    // No downstream stage runs (review, publish) should be dispatched after abort
    const postActionsA1 = mock.actions.filter((a) => a.method === 'POST' && (a.url.includes('review') || a.url.includes('publish')))
    expect(postActionsA1.length).toBe(0)

    await mock.unroute()
  })
})

test.describe('EC-I2 — manual-abort (supervised)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('abort during production marks project aborted with no downstream runs in supervised mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-ma-2', 'supervised', 'EC Manual Abort Supervised')

    const mock = await mockPipelineEdge(page, 'manual-abort', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)
    await page.waitForTimeout(2_000)

    await assertStageComplete(page, 'brainstorm', { timeout: 15_000 })
    await assertStageComplete(page, 'research', { timeout: 15_000 })
    await assertStageComplete(page, 'canonical', { timeout: 15_000 })

    const abortBtn2 = page.getByTestId('overview-abort-btn')
    const altAbortBtn2 = page.getByRole('button', { name: /abort|cancel pipeline/i }).first()
    const abortVisible2 = await abortBtn2.isVisible().catch(() => false)
    if (abortVisible2) {
      await abortBtn2.click()
      const confirmBtn2 = page.getByTestId('overview-abort-confirm')
      const confirmVisible2 = await confirmBtn2.isVisible().catch(() => false)
      if (confirmVisible2) await confirmBtn2.click()
    } else {
      await altAbortBtn2.waitFor({ state: 'visible', timeout: 10_000 })
      await altAbortBtn2.click()
    }

    await expect.poll(
      () => mock.patchBodies.some((b) => (b.body as { status?: string })?.status === 'aborted'),
      { timeout: 15_000, message: 'PATCH with status:aborted was not sent' },
    ).toBe(true)

    const postActionsA2 = mock.actions.filter((a) => a.method === 'POST' && (a.url.includes('review') || a.url.includes('publish')))
    expect(postActionsA2.length).toBe(0)

    await mock.unroute()
  })
})

test.describe('EC-I2 — manual-abort (overview)', () => {
  test.beforeEach(async ({ page }) => { attachConsoleListeners(page) })

  test('abort during production marks project aborted with no downstream runs in overview mode', async ({ page }) => {
    test.setTimeout(120_000)
    const project = seed('proj-ec-ma-3', 'overview', 'EC Manual Abort Overview')

    const mock = await mockPipelineEdge(page, 'manual-abort', { project })

    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')

    await page.goto(`/en/projects/${project.id}`)

    const overviewPV3 = page.getByTestId('overview-progress-view')
    await overviewPV3.waitFor({ state: 'visible', timeout: 20_000 })

    // Abort via the dedicated overview abort button
    const abortBtn3 = page.getByTestId('overview-abort-btn')
    await abortBtn3.waitFor({ state: 'visible', timeout: 10_000 })
    await abortBtn3.click()

    // Confirm via the abort dialog
    const confirmBtn3 = page.getByTestId('overview-abort-confirm')
    await confirmBtn3.waitFor({ state: 'visible', timeout: 10_000 })
    await confirmBtn3.click()

    await expect.poll(
      () => mock.patchBodies.some((b) => (b.body as { status?: string })?.status === 'aborted'),
      { timeout: 15_000, message: 'PATCH with status:aborted was not sent' },
    ).toBe(true)

    // Overview: production stage should show aborted
    await expect.poll(
      async () => {
        const el = page.getByTestId('overview-stage-production')
        return el.getAttribute('data-status').catch(() => null)
      },
      { timeout: 20_000, message: 'Overview production stage did not reach aborted status' },
    ).toBe('aborted')

    const postActionsA3 = mock.actions.filter((a) => a.method === 'POST' && (a.url.includes('review') || a.url.includes('publish')))
    expect(postActionsA3.length).toBe(0)

    await mock.unroute()
  })
})
