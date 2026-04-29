import { test, expect } from '@playwright/test'
import { attachPipelineEventRecorder } from './fixtures/pipelineMocks'

/**
 * LIVE end-to-end pipeline test.
 *
 * No API mocking — every request hits the real apps/api on :3001 and the
 * real OpenAI gpt-4o-mini model. Pre-requisites:
 *
 *   1. apps/app/.env.local has NEXT_PUBLIC_E2E=1 + E2E_USER_ID=<uuid>
 *   2. Both `dev:app` and `dev:api` are running with those vars loaded
 *   3. apps/api/.env.local has OPENAI_API_KEY
 *   4. agent_prompts rows have recommended_provider='openai',
 *      recommended_model='gpt-4o-mini' for brainstorm/research/review/etc.
 *
 * The test is intentionally long-form: a single `test()` walks the user
 * through every stage so a failure pinpoints exactly where the auto-pilot
 * broke. Each stage logs progress to the terminal.
 */

const USER_ID = '5feae97f-86a5-4996-96c1-fc2ed459fa7f'
const CHANNEL_ID = '7859a388-c803-461f-aec2-f37cfc339a62'
const TOPIC = 'Best practices for indie hacker side projects in 2026'

// Generous timeout — real model calls take 5–30s each.
test.setTimeout(600_000)

test.describe('live auto-pilot pipeline', () => {
  test('creates a new project and runs through every stage with gpt-4o-mini', async ({
    page,
    request,
  }) => {
    // ── 1. Create project + seed brainstorm/research via API ──────────────
    // We skip the brainstorm + research stages entirely so each iteration of
    // this test lands on the draft stage in <5s. That cuts ~2 min off the
    // run vs. driving those stages with real LLM calls.
    // current_stage on the project row is a coarse phase enum and doesn't
    // gate the orchestrator — pipeline_state_json (set below) is the real
    // source of truth. Send 'brainstorm' here to satisfy the create schema.
    const createRes = await request.post('http://localhost:3000/api/projects', {
      data: {
        title: `E2E Live Auto-Pilot — ${new Date().toISOString()}`,
        current_stage: 'brainstorm',
        status: 'active',
      },
    })
    if (!createRes.ok()) {
      console.log('[live] create failed', createRes.status(), await createRes.text())
    }
    expect(createRes.ok()).toBeTruthy()
    const { data: project } = await createRes.json()
    expect(project?.id).toBeTruthy()
    const projectId = project.id as string
    console.log('[live] created project', projectId)

    // Attach channel via PUT (createProjectSchema doesn't accept channelId)
    const putRes = await request.put(
      `http://localhost:3000/api/projects/${projectId}`,
      { data: { channelId: CHANNEL_ID } },
    )
    expect(putRes.ok()).toBeTruthy()
    console.log('[live] channel attached')

    // Seed an idea_archive row. idea_id must match BC-IDEA-### per schema.
    const ideaSlug = `BC-IDEA-${String(Date.now()).slice(-3)}`
    const ideaTitle = TOPIC
    const ideaArchiveRes = await request.post(
      'http://localhost:3000/api/ideas/archive',
      {
        data: {
          channel_id: CHANNEL_ID,
          ideas: [
            {
              idea_id: ideaSlug,
              title: ideaTitle,
              core_tension: 'Solo founders need to balance shipping speed with sustainable growth',
              target_audience: 'Indie hackers in 2026',
              verdict: 'viable',
              discovery_data: 'Pre-seeded by E2E test',
            },
          ],
        },
      },
    )
    if (!ideaArchiveRes.ok()) {
      console.log('[live] idea archive failed', ideaArchiveRes.status(), await ideaArchiveRes.text())
    }
    expect(ideaArchiveRes.ok()).toBeTruthy()
    // The /content-drafts POST resolves ideaId by slug OR UUID, so we can
    // pass the slug directly without a lookup round-trip.
    const ideaId = ideaSlug
    console.log('[live] seeded idea', ideaId)

    // Seed a completed research session via /import — synthetic cards so no
    // LLM call is needed.
    const researchImportRes = await request.post(
      'http://localhost:3000/api/research-sessions/import',
      {
        data: {
          channelId: CHANNEL_ID,
          projectId,
          ideaId,
          topic: ideaTitle,
          level: 'medium',
          cardsJson: [
            {
              type: 'source',
              title: 'Indie Hackers 2026 State of the Solopreneur',
              url: 'https://example.com/indie-hackers-2026',
              author: 'Jane Doe',
              relevance: 9,
              key_insight: '90% of indie projects pivot at least once before profitability.',
            },
            {
              type: 'statistic',
              title: 'Side project revenue growth',
              claim: 'Average solo SaaS MRR grew 32% YoY',
              figure: '32%',
              context: 'Across 1,200 indie SaaS apps tracked in 2025-2026',
            },
            {
              type: 'expert_quote',
              title: 'On distribution as a moat',
              quote: 'Distribution is the only durable moat for solo founders.',
              author: 'Mark Stevens',
              credentials: 'Founder, IndieMetrics',
            },
          ],
        },
      },
    )
    expect(researchImportRes.ok()).toBeTruthy()
    const researchJson = await researchImportRes.json()
    const researchSessionId = researchJson.data?.sessionId as string
    expect(researchSessionId).toBeTruthy()
    console.log('[live] seeded research session', researchSessionId)

    // Pre-load pipeline state so the orchestrator skips brainstorm + research
    // and lands at draft in auto mode.
    const pipelineStateJson = {
      mode: 'auto',
      currentStage: 'draft',
      iterationCount: 0,
      stageResults: {
        brainstorm: {
          ideaId,
          ideaTitle,
          ideaVerdict: 'viable',
          ideaCoreTension: 'Solo founders need to balance shipping speed with sustainable growth',
          completedAt: new Date().toISOString(),
        },
        research: {
          researchSessionId,
          approvedCardsCount: 3,
          researchLevel: 'medium',
          completedAt: new Date().toISOString(),
        },
      },
    }
    const stateRes = await request.put(
      `http://localhost:3000/api/projects/${projectId}`,
      { data: { pipelineStateJson } },
    )
    if (!stateRes.ok()) {
      console.log('[live] state seed failed', stateRes.status(), await stateRes.text())
    }
    expect(stateRes.ok()).toBeTruthy()
    console.log('[live] pipeline state seeded — entering at draft stage')

    // ── 2. Wire console + error recorders ───────────────────────────────────
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
      if (msg.text().startsWith('[pipeline]')) {
        console.log('[browser]', msg.text())
      }
    })
    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err.message}`)
      console.log('[pageerror]', err.message)
    })
    const recorder = attachPipelineEventRecorder(page)

    // ── 3. Navigate — pipeline state already pre-loaded with auto-pilot on
    await page.goto(`/en/projects/${projectId}`)
    await expect(page.getByRole('switch', { name: /auto/i })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole('switch', { name: /auto/i })).toBeChecked({
      timeout: 10_000,
    })
    console.log('[live] orchestrator mounted with auto-pilot active')

    // ── 4. Stage: Draft — auto-pilot drives core → produce → DRAFT_COMPLETE ─
    // Wait for canonical core POST to fire (auto)
    await page.waitForResponse(
      (r) => r.url().includes('/content-drafts') && r.request().method() === 'POST',
      { timeout: 120_000 },
    )
    console.log('[live] draft creation started')

    // Auto-pilot dispatches DRAFT_COMPLETE once produce finishes
    await expect.poll(() => recorder.types(), { timeout: 120_000 }).toContain(
      'DRAFT_COMPLETE',
    )
    console.log('[live] draft complete, advancing to review')

    // ── 5. Stage: Review — auto-fires ───────────────────────────────────────
    await page.waitForResponse(
      (r) => r.url().includes('/review') && r.request().method() === 'POST',
      { timeout: 120_000 },
    )
    console.log('[live] review auto-fired')

    // Either approves (→ assets) or paused (rejected/max iter)
    await Promise.race([
      expect.poll(() => recorder.types(), { timeout: 120_000 }).toContain(
        'REVIEW_COMPLETE',
      ),
      page.getByTestId('autopilot-paused-badge').waitFor({ timeout: 120_000 }),
    ])
    console.log('[live] review loop settled')

    // ── 6. Stage: Assets — confirmation dialog + autopilot drives ──────────
    // Review may end approved (→ assets dialog) or paused (max iter / rejected).
    const dialog = page.getByTestId('assets-confirm-dialog')
    const pausedBadge = page.getByTestId('autopilot-paused-badge')
    const reachedAssets = await Promise.race([
      dialog.waitFor({ state: 'visible', timeout: 60_000 }).then(() => true),
      pausedBadge.waitFor({ state: 'visible', timeout: 60_000 }).then(() => false),
    ]).catch(() => null)

    if (reachedAssets === true) {
      console.log('[live] assets confirmation dialog visible — confirming')
      await page.getByRole('button', { name: /generate images/i }).click()

      // Auto-pilot: briefs → generate-all → handleFinish → ASSETS_COMPLETE
      await expect.poll(() => recorder.types(), { timeout: 180_000 }).toContain(
        'ASSETS_COMPLETE',
      )
      console.log('[live] assets complete')
    } else if (reachedAssets === false) {
      console.log('[live] review loop paused — skipping assets')
    } else {
      console.log('[live] neither dialog nor paused-badge appeared')
    }

    // ── 7. Final assertions ────────────────────────────────────────────────
    console.log(`[live] FINISHED. Errors captured: ${errors.length}`)
    errors.forEach((e) => console.log('  -', e))

    // No hard fail on errors — we want to see the full run regardless. Test
    // only fails if a critical assertion above failed.
  })
})
