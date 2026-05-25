/**
 * full-pipeline-mocked.spec.ts — T4-Mock: Full pipeline with mocked AI providers.
 *
 * Mirrors full-pipeline-real-ai.spec.ts exactly — same fixtures (fillWizard,
 * driveStageManual, assertStageComplete), same 6-stage sequence — but every
 * /api/* call is intercepted via mockPipelineHappy so no real AI runs and no
 * tokens are burned.
 *
 * This is the development gate that must be green before swapping to real AI.
 * It runs in the default CI Playwright project (no E2E_RUN_LIVE guard needed).
 *
 * Why option (b) over (a):
 *   The existing full-pipeline-real-ai.spec.ts is explicitly marked "NO route
 *   mocking" in its header, and its testIgnore / E2E_RUN_LIVE gate is a
 *   deliberate cost-control boundary. Adding a MOCK_AI=1 branch inside that
 *   file would muddy the gate and risk accidental real-AI runs. A sibling spec
 *   keeps the two concerns cleanly separated.
 *
 * Channels blocker fix (root cause):
 *   The real-AI test calls page.request.post('/api/channels') then opens the
 *   wizard expecting GET /channels to return the new channel. With real APIs
 *   this races against the org-lookup in the channels route. With mocks there
 *   is no race: mockPipelineHappy intercepts GET /channels and returns the
 *   seeded channel immediately, so the wizard always sees it.
 *
 * To run:
 *   DISPLAY=:0 npx playwright test \
 *     apps/app/e2e/new-project/full-pipeline-mocked.spec.ts \
 *     --project=chromium --headed
 */

import { test, expect } from '@playwright/test'
import { mockPipelineHappy, type HappyProjectSeed } from '../fixtures/newProject/mockPipelineHappy'
import { attachPipelineEventRecorder } from '../fixtures/pipelineMocks'
import { fillWizard } from '../fixtures/newProject/fillWizard'
import { driveStageManual } from '../fixtures/newProject/driveStageManual'
import { assertStageComplete } from '../fixtures/newProject/assertStageComplete'

// Fixed IDs — the mock returns these from POST /api/projects so the page
// navigates to /projects/<PROJECT_ID> and the route mocks are anchored there.
// PROJECT_ID must be UUID-format: fillWizard anchors waitForURL on the UUID
// regex /\/projects\/[0-9a-f]{8}-[0-9a-f]{4}-.../ so non-UUID ids time out.
const PROJECT_ID = 'e2e00004-e2e0-0000-0000-00000000000c'
const CHANNEL_ID = 'ch-e2e-t4-mock'
const TOPIC = 'Best practices for building a content engine in 2026'

test.describe('T4-Mock — full pipeline with mocked AI (all 6 stages)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[browser:error]', msg.text())
    })
    page.on('pageerror', (err) => console.log('[pageerror]', err.message))
  })

  test('creates project via wizard and drives all 6 stages to completion (mocked)', async ({ page }) => {
    test.setTimeout(300_000)

    const project: HappyProjectSeed = {
      id: PROJECT_ID,
      channelId: CHANNEL_ID,
      title: `T4 Mocked Pipeline — ${new Date().toISOString()}`,
      mode: 'step-by-step',
    }

    const _recorder = attachPipelineEventRecorder(page)

    // Install mocks BEFORE navigating so every API call — including the
    // channels list the wizard fetches on mount — is intercepted.
    const mock = await mockPipelineHappy(page, { project })

    // Navigate to the wizard (same entry-point as the real-AI test).
    await page.goto('/en/projects/new')

    // Use the shared fillWizard helper so this spec exercises the same code-path
    // as full-pipeline-real-ai.spec.ts. The mock intercepts GET /channels and
    // returns the seeded channel immediately, so "No channels found" cannot occur.
    const projectId = await fillWizard({
      page,
      title: project.title,
      channelId: CHANNEL_ID,
      topic: TOPIC,
      mode: 'step-by-step',
    })

    console.log('[T4-Mock] projectId from wizard', projectId)
    // The mock always returns PROJECT_ID from POST /api/projects.
    expect(projectId).toBe(PROJECT_ID)

    // Wait for the sidebar — step-by-step renders FocusSidebar not an engine.
    await page.getByTestId('sidebar-item-brainstorm').waitFor({ state: 'visible', timeout: 20_000 })

    // ── Brainstorm ────────────────────────────────────────────────────────────
    console.log('[T4-Mock] driving brainstorm...')
    await driveStageManual(page, 'brainstorm')
    mock.completeStage('brainstorm')
    await assertStageComplete(page, 'brainstorm', { timeout: 30_000 })
    console.log('[T4-Mock] brainstorm complete')

    // ── Research ──────────────────────────────────────────────────────────────
    console.log('[T4-Mock] driving research...')
    await driveStageManual(page, 'research')
    mock.completeStage('research')
    await assertStageComplete(page, 'research', { timeout: 30_000 })
    console.log('[T4-Mock] research complete')

    // ── Canonical ─────────────────────────────────────────────────────────────
    console.log('[T4-Mock] driving canonical...')
    await driveStageManual(page, 'canonical')
    mock.completeStage('canonical')
    await assertStageComplete(page, 'canonical', { timeout: 30_000 })
    console.log('[T4-Mock] canonical complete')

    // ── Production ────────────────────────────────────────────────────────────
    console.log('[T4-Mock] driving production...')
    await driveStageManual(page, 'production')
    mock.completeStage('production')
    await assertStageComplete(page, 'production', { timeout: 30_000 })
    console.log('[T4-Mock] production complete')

    // ── Review ────────────────────────────────────────────────────────────────
    console.log('[T4-Mock] driving review...')
    await driveStageManual(page, 'review')
    mock.completeStage('review')
    await assertStageComplete(page, 'review', { timeout: 30_000 })
    console.log('[T4-Mock] review complete')

    // ── Publish ───────────────────────────────────────────────────────────────
    console.log('[T4-Mock] driving publish...')
    await driveStageManual(page, 'publish')
    mock.completeStage('publish')
    await assertStageComplete(page, 'publish', { timeout: 30_000 })
    console.log('[T4-Mock] publish complete')

    // Sanity: at least one POST was recorded (project creation + stage runs).
    const postActions = mock.actions.filter((a) => a.method === 'POST')
    expect(postActions.length).toBeGreaterThanOrEqual(1)

    console.log('[T4-Mock] All 6 stages completed successfully with mocked AI.')

    await mock.unroute()
  })
})
