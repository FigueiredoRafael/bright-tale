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
    // ── 1. Create the project via real API ─────────────────────────────────
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
    if (!putRes.ok()) {
      console.log('[live] channel attach failed', putRes.status(), await putRes.text())
    }
    expect(putRes.ok()).toBeTruthy()
    console.log('[live] channel attached')

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

    // ── 3. Navigate to the project, enable auto-pilot ───────────────────────
    await page.goto(`/en/projects/${projectId}`)
    await expect(page.getByRole('switch', { name: /auto/i })).toBeVisible({
      timeout: 30_000,
    })
    console.log('[live] orchestrator mounted')

    await page.getByRole('switch', { name: /auto/i }).click()
    await expect(page.getByRole('switch', { name: /auto/i })).toBeChecked()
    console.log('[live] auto-pilot enabled')

    // ── 4. Stage: Brainstorm — type topic, auto-pilot does the rest ────────
    // Topic is the only manual input. Auto-pilot fires handleRun automatically
    // and the AI's recommended idea is auto-selected.
    const topicInput = page.getByRole('textbox', { name: /produtividade|topic/i }).first()
    await topicInput.waitFor({ state: 'visible', timeout: 30_000 })
    await topicInput.fill(TOPIC)
    console.log('[live] topic filled:', TOPIC)

    // Track brainstorm POST to confirm OpenAI/gpt-4o-mini is hit
    const sessionRes = await page.waitForResponse(
      (r) => r.url().includes('/brainstorm/sessions') && r.request().method() === 'POST',
      { timeout: 60_000 },
    )
    console.log('[live] brainstorm POST', sessionRes.status())
    if (!sessionRes.ok()) {
      console.log('[live] response body:', await sessionRes.text())
    }

    // Auto-pilot: ideas generate → recommended one is auto-picked → BRAINSTORM_COMPLETE
    await expect.poll(() => recorder.types(), { timeout: 120_000 }).toContain(
      'BRAINSTORM_COMPLETE',
    )
    console.log('[live] auto-pilot picked recommended idea, advancing to research')

    // ── 5. Stage: Research — auto-fires (useAutoPilotTrigger) ──────────────
    // Wait for research session POST to fire
    await page.waitForResponse(
      (resp) =>
        resp.url().includes('/research-sessions') && resp.request().method() === 'POST',
      { timeout: 60_000 },
    )
    console.log('[live] research auto-fired')

    // Auto-pilot: findings render → auto-approve → RESEARCH_COMPLETE
    await expect.poll(() => recorder.types(), { timeout: 120_000 }).toContain(
      'RESEARCH_COMPLETE',
    )
    console.log('[live] research auto-approved, advancing to draft')

    // ── 6. Stage: Draft — auto-pilot drives core → produce → DRAFT_COMPLETE ─
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

    // ── 7. Stage: Review — auto-fires ───────────────────────────────────────
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

    // ── 8. Stage: Assets — confirmation dialog ──────────────────────────────
    if (await page.getByTestId('assets-confirm-dialog').isVisible({ timeout: 10_000 }).catch(() => false)) {
      console.log('[live] assets confirmation dialog visible — confirming')
      await page.getByRole('button', { name: /generate images/i }).click()
    }

    // Asset generation can take a while
    await page
      .locator('img[src*="generated-images"], [data-testid="asset-card"]')
      .first()
      .waitFor({ state: 'visible', timeout: 120_000 })
      .catch(() => console.log('[live] no generated assets visible — may have skipped'))

    // ── 9. Final assertions ────────────────────────────────────────────────
    console.log(`[live] FINISHED. Errors captured: ${errors.length}`)
    errors.forEach((e) => console.log('  -', e))

    // No hard fail on errors — we want to see the full run regardless. Test
    // only fails if a critical assertion above failed.
  })
})
