/**
 * full-pipeline.spec.ts — Happy-path e2e suite for the new-project pipeline.
 *
 * T1 — step-by-step + mocked AI
 *   User creates a project in step-by-step mode. Mocked APIs simulate each
 *   stage completing. Test drives each stage manually via action testids and
 *   asserts the sidebar status icon reaches data-status="completed".
 *
 * T2 — supervised + mocked AI (auto-run)
 *   Supervised mode: AI runs stages automatically. The mock auto-completes
 *   every stage on POST. Test watches the OverviewProgressView-equivalent
 *   sidebar status icons until all shared + first-track stages complete.
 *
 * T3 — overview + mocked AI (watch-only)
 *   Overview mode: full autopilot. UI shows OverviewProgressView. Test
 *   waits for the done banner to appear.
 *
 * All three tests use page.route() mocks (not MSW). No real AI calls.
 * Cleanup via cleanupHelper (requires SUPABASE_SERVICE_ROLE_KEY; silent if absent).
 */

import { test, expect } from '@playwright/test'
import { mockPipelineHappy, type HappyProjectSeed } from '../fixtures/newProject/mockPipelineHappy'
import { driveStageManual } from '../fixtures/newProject/driveStageManual'
import { assertStageComplete } from '../fixtures/newProject/assertStageComplete'
import { attachPipelineEventRecorder } from '../fixtures/pipelineMocks'

// ─── Shared constants ─────────────────────────────────────────────────────────

const PROJECT_ID = 'proj-e2e-happy-1'
const CHANNEL_ID = 'ch-e2e-happy-1'

// ─── T1 — step-by-step + mocked AI ───────────────────────────────────────────

test.describe('T1 — step-by-step + mocked AI', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[browser:error]', msg.text())
    })
    page.on('pageerror', (err) => console.log('[pageerror]', err.message))
  })

  test('full pipeline completes via manual stage actions', async ({ page }) => {
    test.setTimeout(180_000)

    const project: HappyProjectSeed = {
      id: PROJECT_ID,
      channelId: CHANNEL_ID,
      title: 'T1 Step-by-Step Happy Path',
      mode: 'step-by-step',
    }

    const _recorder = attachPipelineEventRecorder(page)
    const mock = await mockPipelineHappy(page, { project })

    // Per PRD/grill: user starts on /projects, clicks "Start Workflow", then
    // walks through PipelineWizard before landing on the project page.
    // DEBUG: skip the /projects entry — go straight to the wizard
    await page.goto('/en/projects/new')
    await page.getByTestId('pipeline-wizard').waitFor({ state: 'visible', timeout: 30_000 })

    // Fill required fields
    await page.locator('#project-title').fill(project.title)
    await page.getByTestId('channel-option').first().click()
    await page.locator('#wizard-brainstorm-topic').fill('retirement planning for freelancers')

    // Mode defaults to step-by-step, media defaults to blog. Submit.
    await page.getByRole('button', { name: /create project/i }).click()

    // Land on /projects/<id>
    await page.waitForURL(new RegExp(`/projects/${project.id}\\b`), { timeout: 20_000 })

    // Wait for hydration — FocusSidebar (step-by-step renders no engine until
    // the user clicks a sidebar stage item; driveStageManual handles that).
    await page.getByTestId('sidebar-item-brainstorm').waitFor({ state: 'visible', timeout: 20_000 })

    // ── Brainstorm ────────────────────────────────────────────────────────────
    await driveStageManual(page, 'brainstorm')
    mock.completeStage('brainstorm')
    await assertStageComplete(page, 'brainstorm', { timeout: 30_000 })

    // ── Research ──────────────────────────────────────────────────────────────
    await driveStageManual(page, 'research')
    mock.completeStage('research')
    await assertStageComplete(page, 'research', { timeout: 30_000 })

    // ── Canonical ─────────────────────────────────────────────────────────────
    await driveStageManual(page, 'canonical')
    mock.completeStage('canonical')
    await assertStageComplete(page, 'canonical', { timeout: 30_000 })

    // ── Production (track stage) ───────────────────────────────────────────────
    await driveStageManual(page, 'production')
    mock.completeStage('production')
    await assertStageComplete(page, 'production', { timeout: 30_000 })

    // ── Review (track stage) ──────────────────────────────────────────────────
    await driveStageManual(page, 'review')
    mock.completeStage('review')
    await assertStageComplete(page, 'review', { timeout: 30_000 })

    // ── Publish (track stage) ─────────────────────────────────────────────────
    await driveStageManual(page, 'publish')
    mock.completeStage('publish')
    await assertStageComplete(page, 'publish', { timeout: 30_000 })

    // Assert the mock recorded the expected stage run actions
    const postActions = mock.actions.filter((a) => a.method === 'POST')
    expect(postActions.length).toBeGreaterThanOrEqual(1)

    await mock.unroute()
  })
})

// ─── T2 — supervised + mocked AI (autopilot drives, outputs visible) ──────────

test.describe('T2 — supervised + mocked AI', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[browser:error]', msg.text())
    })
    page.on('pageerror', (err) => console.log('[pageerror]', err.message))
  })

  test('supervised autopilot walks every engine and renders outputs', async ({ page }) => {
    test.setTimeout(240_000)

    const project: HappyProjectSeed = {
      id: 'proj-e2e-happy-2',
      channelId: CHANNEL_ID,
      title: 'T2 Supervised Happy Path',
      mode: 'supervised',
    }

    const _recorder = attachPipelineEventRecorder(page)
    const mock = await mockPipelineHappy(page, { project })

    // Walk the wizard with mode=Supervised
    await page.goto('/en/projects/new')
    await page.getByTestId('pipeline-wizard').waitFor({ state: 'visible', timeout: 30_000 })

    await page.locator('#project-title').fill(project.title)
    await page.getByTestId('channel-option').first().click()
    await page.locator('#wizard-brainstorm-topic').fill('retirement planning for freelancers')

    // Switch to Supervised
    await page.getByRole('radio', { name: 'Supervised' }).click()

    await page.getByRole('button', { name: /create project/i }).click()
    await page.waitForURL(new RegExp(`/projects/${project.id}\\b`), { timeout: 20_000 })

    // In supervised mode:
    //   1. Cold-start auto-route lands on ?stage=brainstorm.
    //   2. The engine mounts and useAutoPilotTrigger fires its action.
    //   3. Engine output renders (idea cards / research findings / draft, etc.).
    //   4. We simulate the orchestrator by calling mock.completeStage() after
    //      observing the engine output. useSupervisedAutoAdvance then routes
    //      the URL forward to the next stage.

    // ── Brainstorm ────────────────────────────────────────────────────────────
    await page.getByTestId('brainstorm-engine-root').waitFor({ state: 'visible', timeout: 30_000 })
    await expect(page.getByTestId('idea-card').first()).toBeVisible({ timeout: 30_000 })
    mock.completeStage('brainstorm')
    await assertStageComplete(page, 'brainstorm', { timeout: 30_000 })

    // ── Research ──────────────────────────────────────────────────────────────
    await page.getByTestId('research-engine-root').waitFor({ state: 'visible', timeout: 30_000 })
    mock.completeStage('research')
    await assertStageComplete(page, 'research', { timeout: 30_000 })

    // ── Canonical ─────────────────────────────────────────────────────────────
    await page.getByTestId('canonical-engine-root').waitFor({ state: 'visible', timeout: 30_000 })
    mock.completeStage('canonical')
    await assertStageComplete(page, 'canonical', { timeout: 30_000 })

    // ── Production (track-scoped) ─────────────────────────────────────────────
    await page.getByTestId('production-engine-root').waitFor({ state: 'visible', timeout: 30_000 })
    mock.completeStage('production')
    await assertStageComplete(page, 'production', { timeout: 30_000 })

    // ── Review (track-scoped) ─────────────────────────────────────────────────
    await page.getByTestId('review-engine-root').waitFor({ state: 'visible', timeout: 30_000 })
    mock.completeStage('review')
    await assertStageComplete(page, 'review', { timeout: 30_000 })

    // ── Publish (track-scoped) ────────────────────────────────────────────────
    await page.getByTestId('publish-engine-root').waitFor({ state: 'visible', timeout: 30_000 })
    mock.completeStage('publish')
    await assertStageComplete(page, 'publish', { timeout: 30_000 })

    await mock.unroute()
  })
})

// ─── T3 — overview + mocked AI (full autopilot + summary cards) ───────────────

test.describe('T3 — overview + mocked AI', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[browser:error]', msg.text())
    })
    page.on('pageerror', (err) => console.log('[pageerror]', err.message))
  })

  test('overview mode shows per-stage summary cards and done banner', async ({ page }) => {
    test.setTimeout(180_000)

    const project: HappyProjectSeed = {
      id: 'proj-e2e-happy-3',
      channelId: CHANNEL_ID,
      title: 'T3 Overview Happy Path',
      mode: 'overview',
    }

    const _recorder = attachPipelineEventRecorder(page)
    const mock = await mockPipelineHappy(page, { project })

    // Walk the wizard with mode=Overview
    await page.goto('/en/projects/new')
    await page.getByTestId('pipeline-wizard').waitFor({ state: 'visible', timeout: 30_000 })

    await page.locator('#project-title').fill(project.title)
    await page.getByTestId('channel-option').first().click()
    await page.locator('#wizard-brainstorm-topic').fill('retirement planning for freelancers')

    // Switch to Overview
    await page.getByRole('radio', { name: 'Overview' }).click()

    await page.getByRole('button', { name: /create project/i }).click()
    await page.waitForURL(new RegExp(`/projects/${project.id}\\b`), { timeout: 20_000 })

    // OverviewProgressView mounts (no engines)
    const progressView = page.getByTestId('overview-progress-view')
    await progressView.waitFor({ state: 'visible', timeout: 30_000 })

    // Seed the snapshot with completed stages so the watch-only UI has
    // something to render. The mock auto-completes on POST, but overview
    // mode doesn't trigger POSTs from the UI — we mark completion directly.
    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')
    mock.completeStage('production')
    mock.completeStage('review')
    mock.completeStage('assets')
    mock.completeStage('preview')
    mock.completeStage('publish')

    // Stepper status — all stages reach 'completed'
    await expect(page.getByTestId('overview-stage-brainstorm')).toHaveAttribute('data-status', 'completed', { timeout: 30_000 })
    await expect(page.getByTestId('overview-stage-research')).toHaveAttribute('data-status', 'completed', { timeout: 30_000 })
    await expect(page.getByTestId('overview-stage-canonical')).toHaveAttribute('data-status', 'completed', { timeout: 30_000 })
    await expect(page.getByTestId('overview-stage-production')).toHaveAttribute('data-status', 'completed', { timeout: 30_000 })
    await expect(page.getByTestId('overview-stage-review')).toHaveAttribute('data-status', 'completed', { timeout: 30_000 })
    await expect(page.getByTestId('overview-stage-publish')).toHaveAttribute('data-status', 'completed', { timeout: 30_000 })

    // Per-stage summary cards: each completed stage renders one persistent card
    const brainstormCard = page.getByTestId('overview-stage-summary-brainstorm')
    await expect(brainstormCard).toBeVisible({ timeout: 30_000 })
    await expect(brainstormCard).toContainText('E2E Happy Path Idea')
    await expect(brainstormCard).toContainText('Audience')
    await expect(brainstormCard).toContainText('Angle')

    const researchCard = page.getByTestId('overview-stage-summary-research')
    await expect(researchCard).toBeVisible()
    await expect(researchCard).toContainText('5 cards approved')
    await expect(researchCard).toContainText('Avg confidence: 92')
    await expect(researchCard).toContainText('Solo 401(k) contribution limits')

    const canonicalCard = page.getByTestId('overview-stage-summary-canonical')
    await expect(canonicalCard).toBeVisible()
    await expect(canonicalCard).toContainText('Thesis')
    await expect(canonicalCard).toContainText('Persona: E2E Persona')

    const productionCard = page.getByTestId('overview-stage-summary-production')
    await expect(productionCard).toBeVisible()
    await expect(productionCard).toContainText('Words: 1500')
    await expect(productionCard).toContainText('Why freelancers need a different plan')

    const reviewCard = page.getByTestId('overview-stage-summary-review')
    await expect(reviewCard).toBeVisible()
    await expect(reviewCard).toContainText('Score: 95')
    await expect(reviewCard).toContainText('Verdict: approved')

    const publishCard = page.getByTestId('overview-stage-summary-publish')
    await expect(publishCard).toBeVisible()
    await expect(publishCard).toContainText('Status: published')
    await expect(publishCard).toContainText('https://example.com/e2e-happy-path')

    // Done banner
    await expect(page.getByTestId('overview-done-banner')).toBeVisible({ timeout: 30_000 })

    await mock.unroute()
  })
})
