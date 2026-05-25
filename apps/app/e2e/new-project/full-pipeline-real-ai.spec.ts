/**
 * full-pipeline-real-ai.spec.ts — T4: Full pipeline with real AI providers.
 *
 * NO route mocking — every request hits the real apps/api and real AI models.
 *
 * Pre-requisites:
 *   1. apps/app/.env.local:  NEXT_PUBLIC_E2E=1, E2E_USER_ID=<uuid>
 *   2. Both `dev:app` (port 3000) and `dev:api` (port 3001) running
 *   3. apps/api/.env.local: OPENAI_API_KEY or GEMINI_API_KEY (costs apply)
 *   4. agent_prompts rows populated for all active stages
 *   5. A channel already exists for the E2E user (or run onboardZeroToProjects)
 *
 * This test is intentionally excluded from the default CI Playwright run.
 * It is gated by:
 *   - playwright.config.ts testIgnore: /live-autopilot|full-pipeline-real-ai/
 *   - Guard inside: process.env.E2E_RUN_LIVE !== '1' → test.skip()
 *
 * To run manually:
 *   E2E_RUN_LIVE=1 npx playwright test e2e/new-project/full-pipeline-real-ai.spec.ts
 *
 * See also: e2e/live-autopilot.spec.ts for the legacy single-file live test.
 */

import { test, expect } from '@playwright/test'
import { attachPipelineEventRecorder } from '../fixtures/pipelineMocks'
import { fillWizard } from '../fixtures/newProject/fillWizard'
import { driveStageManual } from '../fixtures/newProject/driveStageManual'
import { assertStageComplete } from '../fixtures/newProject/assertStageComplete'
import { resetChannel } from '../fixtures/newProject/cleanupHelper'

// Generous timeout — real AI calls can take 5–30 s each.
test.setTimeout(600_000)

const USER_ID = process.env.E2E_USER_ID ?? ''
const TOPIC = 'Best practices for building a content engine in 2026'

test.describe('T4 — full pipeline with real AI (live)', () => {
  // Skip unless explicitly opted in
  test.skip(
    process.env.E2E_RUN_LIVE !== '1',
    'Set E2E_RUN_LIVE=1 and ensure dev servers + AI keys are ready.',
  )

  test.beforeAll(async () => {
    if (!USER_ID) throw new Error('[T4] E2E_USER_ID env var is required')

    // Wipe any leftover state from previous runs so each test starts clean.
    // Each test bootstraps the channel it needs via POST /api/channels — we
    // no longer drive the brittle 7-step onboarding UI.
    await resetChannel(USER_ID)
  })

  test.afterAll(async () => {
    // Skip cleanup when E2E_KEEP=1 so we can post-mortem the DB state.
    if (USER_ID && process.env.E2E_KEEP !== '1') await resetChannel(USER_ID)
  })

  test('creates project via wizard and drives all 6 stages to completion', async ({ page }) => {
    const _recorder = attachPipelineEventRecorder(page)

    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[browser:error]', msg.text())
    })
    page.on('pageerror', (err) => console.log('[pageerror]', err.message))

    // Bootstrap a channel for this run. resetChannel in beforeAll wipes the
    // user's channels, so we always need to create one before opening the
    // wizard (which requires a channel selection).
    await page.goto('/en/projects')

    const channelsRes = await page.request.get('/api/channels')
    let channelId = ''
    if (channelsRes.ok()) {
      const { data } = await channelsRes.json()
      const items = (data?.items ?? data?.channels ?? []) as Array<{ id: string }>
      if (items.length > 0) channelId = items[0].id
    }
    if (!channelId) {
      const created = await page.request.post('/api/channels', {
        data: {
          name: 'E2E Test Channel',
          niche: 'general',
          language: 'en',
          tone: 'neutral',
          presentation_style: 'concise',
        },
      })
      expect(created.ok(), `POST /api/channels failed: ${created.status()} ${await created.text()}`).toBeTruthy()
      const json = await created.json()
      channelId = json?.data?.id ?? ''
    }
    expect(channelId, 'need a channel for the e2e user').toBeTruthy()

    // Click "Start Workflow" — race the click navigation against a direct
    // goto, because ProjectsDashboard's filter-fetch effect calls
    // window.history.replaceState which can stomp router.push back to
    // /projects right after the wizard navigation.
    const startBtn = page.getByRole('button', { name: 'Start Workflow', exact: true }).last()
    await startBtn.waitFor({ state: 'visible', timeout: 15_000 })
    await Promise.race([
      (async () => {
        await startBtn.click()
        await page.waitForURL(/\/projects\/new/, { timeout: 5_000 }).catch(() => {})
      })(),
      page.waitForTimeout(6_000),
    ])
    if (!/\/projects\/new/.test(page.url())) {
      console.warn('[T4] Start Workflow click did not navigate — falling back to direct goto')
      await page.goto('/en/projects/new')
    }
    await page.waitForURL(/\/projects\/new/, { timeout: 10_000 })

    // Fill the wizard and get the new projectId
    const projectId = await fillWizard({
      page,
      title: `T4 Live Pipeline — ${new Date().toISOString()}`,
      channelId,
      topic: TOPIC,
      mode: 'step-by-step',
    })
    console.log('[T4] projectId', projectId)
    expect(projectId).toBeTruthy()

    // Wait for project page to load and brainstorm engine to appear
    await page.getByTestId('brainstorm-engine-root').waitFor({ state: 'visible', timeout: 30_000 })

    // ── Brainstorm ────────────────────────────────────────────────────────────
    console.log('[T4] driving brainstorm...')
    await driveStageManual(page, 'brainstorm')
    await assertStageComplete(page, 'brainstorm', { timeout: 120_000 })
    console.log('[T4] brainstorm complete')

    // ── Research ──────────────────────────────────────────────────────────────
    console.log('[T4] driving research...')
    await driveStageManual(page, 'research')
    await assertStageComplete(page, 'research', { timeout: 120_000 })
    console.log('[T4] research complete')

    // ── Canonical ─────────────────────────────────────────────────────────────
    console.log('[T4] driving canonical...')
    await driveStageManual(page, 'canonical')
    await assertStageComplete(page, 'canonical', { timeout: 120_000 })
    console.log('[T4] canonical complete')

    // ── Production ────────────────────────────────────────────────────────────
    console.log('[T4] driving production...')
    await driveStageManual(page, 'production')
    await assertStageComplete(page, 'production', { timeout: 120_000 })
    console.log('[T4] production complete')

    // ── Review ────────────────────────────────────────────────────────────────
    console.log('[T4] driving review...')
    await driveStageManual(page, 'review')
    await assertStageComplete(page, 'review', { timeout: 120_000 })
    console.log('[T4] review complete')

    // ── Publish ───────────────────────────────────────────────────────────────
    console.log('[T4] driving publish...')
    await driveStageManual(page, 'publish')
    await assertStageComplete(page, 'publish', { timeout: 120_000 })
    console.log('[T4] publish complete')

    console.log('[T4] All stages completed successfully.')
  })
})
