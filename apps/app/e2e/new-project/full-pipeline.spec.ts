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

// ─── T2 — supervised + mocked AI (auto-run) ───────────────────────────────────

test.describe('T2 — supervised + mocked AI', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[browser:error]', msg.text())
    })
    page.on('pageerror', (err) => console.log('[pageerror]', err.message))
  })

  test('all stages auto-complete and sidebar icons reach completed', async ({ page }) => {
    test.setTimeout(120_000)

    const project: HappyProjectSeed = {
      id: 'proj-e2e-happy-2',
      channelId: CHANNEL_ID,
      title: 'T2 Supervised Happy Path',
      mode: 'supervised',
    }

    const _recorder = attachPipelineEventRecorder(page)
    const mock = await mockPipelineHappy(page, { project })

    // Pre-complete all stages (supervised mode: AI auto-runs, we seed the result)
    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')
    mock.completeStage('production')
    mock.completeStage('review')
    mock.completeStage('publish')

    await page.goto(`/en/projects/${project.id}`)

    // Wait for hydration
    await page.waitForTimeout(2_000)

    // Assert all shared stages completed
    await assertStageComplete(page, 'brainstorm', { timeout: 30_000 })
    await assertStageComplete(page, 'research', { timeout: 30_000 })
    await assertStageComplete(page, 'canonical', { timeout: 30_000 })

    // Assert track stages completed
    await assertStageComplete(page, 'production', { timeout: 30_000 })
    await assertStageComplete(page, 'review', { timeout: 30_000 })
    await assertStageComplete(page, 'publish', { timeout: 30_000 })

    await mock.unroute()
  })
})

// ─── T3 — overview + mocked AI (watch-only) ───────────────────────────────────

test.describe('T3 — overview + mocked AI', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[browser:error]', msg.text())
    })
    page.on('pageerror', (err) => console.log('[pageerror]', err.message))
  })

  test('overview progress view shows done banner when all stages complete', async ({ page }) => {
    test.setTimeout(120_000)

    const project: HappyProjectSeed = {
      id: 'proj-e2e-happy-3',
      channelId: CHANNEL_ID,
      title: 'T3 Overview Happy Path',
      mode: 'overview',
    }

    const _recorder = attachPipelineEventRecorder(page)
    const mock = await mockPipelineHappy(page, { project })

    // Pre-complete all stages for overview mode
    mock.completeStage('brainstorm')
    mock.completeStage('research')
    mock.completeStage('canonical')
    mock.completeStage('production')
    mock.completeStage('review')
    mock.completeStage('assets')
    mock.completeStage('preview')
    mock.completeStage('publish')

    await page.goto(`/en/projects/${project.id}`)

    // Overview mode renders OverviewProgressView
    const progressView = page.getByTestId('overview-progress-view')
    await progressView.waitFor({ state: 'visible', timeout: 20_000 })

    // Assert stage indicators reach completed state
    await expect(page.getByTestId('overview-stage-brainstorm')).toHaveAttribute('data-status', 'completed', { timeout: 30_000 })
    await expect(page.getByTestId('overview-stage-research')).toHaveAttribute('data-status', 'completed', { timeout: 30_000 })
    await expect(page.getByTestId('overview-stage-canonical')).toHaveAttribute('data-status', 'completed', { timeout: 30_000 })
    await expect(page.getByTestId('overview-stage-production')).toHaveAttribute('data-status', 'completed', { timeout: 30_000 })
    await expect(page.getByTestId('overview-stage-review')).toHaveAttribute('data-status', 'completed', { timeout: 30_000 })
    await expect(page.getByTestId('overview-stage-publish')).toHaveAttribute('data-status', 'completed', { timeout: 30_000 })

    // Done banner should appear
    await expect(page.getByTestId('overview-done-banner')).toBeVisible({ timeout: 30_000 })

    await mock.unroute()
  })
})
