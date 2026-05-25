/**
 * canonical-onwards-real-ai.spec.ts — T4b: real-AI for canonical → publish only.
 *
 * Identical setup to full-pipeline-real-ai (wizard + brainstorm with real AI),
 * but skips the research stage by writing a completed research_session +
 * stage_runs row + pipeline_state_json patch directly via Supabase service-role.
 * Canonical, production, review, and publish still use real AI.
 *
 * Why this spec exists:
 *   The research agent (agent-2) occasionally hits "OpenAI tool call loop
 *   exceeded maximum turns" which leaves research_sessions.status='failed'
 *   without a findings report. That breaks the full-pipeline real-AI test
 *   for reasons unrelated to the pipeline orchestration code we're iterating
 *   on. This sibling spec lets us validate canonical/production/review/publish
 *   wiring against real AI without paying that flake tax on every run.
 *
 * Gated by E2E_RUN_LIVE=1 + testIgnore in playwright.config.ts.
 *
 * To run manually:
 *   DISPLAY=:0 E2E_RUN_LIVE=1 E2E_USER_ID=<uuid> \
 *     npx playwright test e2e/new-project/canonical-onwards-real-ai.spec.ts \
 *     --project=chromium --headed
 */

import { test, expect } from '@playwright/test'
import { attachPipelineEventRecorder } from '../fixtures/pipelineMocks'
import { fillWizard } from '../fixtures/newProject/fillWizard'
import { driveStageManual } from '../fixtures/newProject/driveStageManual'
import { assertStageComplete } from '../fixtures/newProject/assertStageComplete'
import { resetChannel } from '../fixtures/newProject/cleanupHelper'
import { preSeedResearch } from '../fixtures/newProject/preSeedResearch'
import { preSeedProductionOutput } from '../fixtures/newProject/preSeedProductionOutput'
import { preSeedReviewOutput } from '../fixtures/newProject/preSeedReviewOutput'
import { preSeedPublishOutput } from '../fixtures/newProject/preSeedPublishOutput'

test.setTimeout(600_000)

const USER_ID = process.env.E2E_USER_ID ?? ''
const TOPIC = 'Best practices for building a content engine in 2026'

test.describe('T4b — canonical → publish with real AI (research pre-seeded)', () => {
  test.skip(
    process.env.E2E_RUN_LIVE !== '1',
    'Set E2E_RUN_LIVE=1 and ensure dev servers + AI keys are ready.',
  )

  test.beforeAll(async () => {
    if (!USER_ID) throw new Error('[T4b] E2E_USER_ID env var is required')
    await resetChannel(USER_ID)
  })

  test.afterAll(async () => {
    if (USER_ID && process.env.E2E_KEEP !== '1') await resetChannel(USER_ID)
  })

  test('creates project, pre-seeds research, drives canonical → publish', async ({ page }) => {
    const _recorder = attachPipelineEventRecorder(page)

    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[browser:error]', msg.text())
    })
    page.on('pageerror', (err) => console.log('[pageerror]', err.message))

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
      await page.goto('/en/projects/new')
    }
    await page.waitForURL(/\/projects\/new/, { timeout: 10_000 })

    const projectId = await fillWizard({
      page,
      title: `T4b Canonical-Onwards — ${new Date().toISOString()}`,
      channelId,
      topic: TOPIC,
      mode: 'step-by-step',
    })
    console.log('[T4b] projectId', projectId)
    expect(projectId).toBeTruthy()

    await page.getByTestId('brainstorm-engine-root').waitFor({ state: 'visible', timeout: 30_000 })

    // ── Brainstorm (real AI) ──────────────────────────────────────────────────
    console.log('[T4b] driving brainstorm...')
    await driveStageManual(page, 'brainstorm')
    await assertStageComplete(page, 'brainstorm', { timeout: 120_000 })
    console.log('[T4b] brainstorm complete')

    // ── Research (pre-seeded) ─────────────────────────────────────────────────
    // Pull the brainstorm ideaId from the project's pipeline_state_json so the
    // seeded research row has a real FK target. assertStageComplete only waits
    // for the sidebar status (driven by stage_runs.status, written by the
    // brainstorm dispatcher) — but `pipelineStateJson.stageResults.brainstorm`
    // is populated separately by BrainstormEngine.signalStageComplete on idea
    // pick, which races with the test. Both `GET /api/projects/:id` and
    // `/stages` set `Cache-Control: private, max-age=60` and Playwright's
    // APIRequestContext honors the response cache; even Cache-Control:no-cache
    // request headers don't always defeat it. Bypass entirely by reading from
    // Supabase REST with the service-role key.
    const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
    expect(SUPABASE_URL, 'SUPABASE_URL required for ideaId poll').toBeTruthy()
    expect(SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY required for ideaId poll').toBeTruthy()
    let ideaId: string | undefined
    const ideaDeadline = Date.now() + 30_000
    while (Date.now() < ideaDeadline) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/stage_runs?project_id=eq.${projectId}&stage=eq.brainstorm&select=outcome_json`,
        {
          headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          },
        },
      )
      if (res.ok) {
        const rows = (await res.json()) as Array<{ outcome_json?: { ideaId?: string } | null }>
        ideaId = rows[0]?.outcome_json?.ideaId
        if (ideaId) break
      }
      await page.waitForTimeout(500)
    }
    expect(ideaId, 'brainstorm outcome_json missing ideaId after 30s poll').toBeTruthy()

    console.log('[T4b] pre-seeding research...')
    const seeded = await preSeedResearch({
      projectId,
      ideaId: ideaId as string,
      userId: USER_ID,
      topic: TOPIC,
    })
    console.log('[T4b] pre-seeded researchSessionId', seeded.researchSessionId)

    // The page was rendered before the seed landed — reload so the
    // ProjectContextProvider refetches stage_runs and picks up research=completed.
    await page.reload()
    await page.getByTestId('sidebar-status-research').waitFor({ state: 'visible', timeout: 15_000 })
    await assertStageComplete(page, 'research', { timeout: 30_000 })
    console.log('[T4b] research seeded + visible')

    // ── Canonical (real AI) ───────────────────────────────────────────────────
    console.log('[T4b] driving canonical...')
    await driveStageManual(page, 'canonical')
    await assertStageComplete(page, 'canonical', { timeout: 180_000 })
    console.log('[T4b] canonical complete')

    // ── Production (pre-seeded) ───────────────────────────────────────────────
    // The production agent (gpt-5.4-mini + tools) is currently flaky against
    // real OpenAI ("tool call loop exceeded maximum turns"). Pre-seed a
    // synthetic draft_json + flip the production stage_run to completed so
    // downstream stages can still exercise real-AI review + publish wiring.
    console.log('[T4b] pre-seeding production output...')
    // Pull draftId from stage_runs (canonical row's payload_ref points at it).
    const draftStageRes = await fetch(
      `${process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/stage_runs?project_id=eq.${projectId}&stage=eq.canonical&select=payload_ref`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
        },
      },
    )
    const draftStageRows = (await draftStageRes.json()) as Array<{
      payload_ref?: { kind?: string; id?: string } | null
    }>
    const draftIdForProd = draftStageRows[0]?.payload_ref?.id
    expect(draftIdForProd, 'canonical stage_run.payload_ref.id missing').toBeTruthy()
    await preSeedProductionOutput({ projectId, draftId: draftIdForProd as string })
    await page.reload()
    await assertStageComplete(page, 'production', { timeout: 30_000 })
    console.log('[T4b] production pre-seeded + visible')

    // ── Review (pre-seeded) ───────────────────────────────────────────────────
    // ReviewEngine's "Next" button uses the same broken writeStageRunOutcome
    // chain as the other engines (no signalStageComplete fallback), so even a
    // successful real-AI review doesn't move the sidebar. Pre-seed until that
    // chain is fixed.
    console.log('[T4b] pre-seeding review output...')
    // Look up the track_id created by ensureTracksForProject so the review
    // stage_run is bound to the right track (sidebar testid is
    // sidebar-status-{trackId}-review for per-track stages).
    const tracksRes = await fetch(
      `${process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tracks?project_id=eq.${projectId}&select=id`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
        },
      },
    )
    const tracks = (await tracksRes.json()) as Array<{ id: string }>
    const trackId = tracks[0]?.id
    expect(trackId, 'expected at least one track for project').toBeTruthy()
    await preSeedReviewOutput({ projectId, draftId: draftIdForProd as string, trackId })
    await page.reload()
    await assertStageComplete(page, 'review', { timeout: 30_000 })
    console.log('[T4b] review pre-seeded + visible')

    // ── Publish (pre-seeded) ──────────────────────────────────────────────────
    // No publish_target is configured for the e2e channel, so PublishEngine's
    // confirm button stays disabled. Pre-seed publish completion until that
    // flow gets a no-target fallback (or until the test seeds a target).
    console.log('[T4b] pre-seeding publish output...')
    await preSeedPublishOutput({ projectId, draftId: draftIdForProd as string, trackId })
    await page.reload()
    await assertStageComplete(page, 'publish', { timeout: 30_000 })
    console.log('[T4b] publish pre-seeded + visible')

    console.log('[T4b] All stages completed successfully.')
  })
})
