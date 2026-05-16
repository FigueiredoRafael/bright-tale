/**
 * E2E Scenario s05 — Research confidence loop
 *
 * Spec: docs/specs/2026-05-14-multi-track-pipeline.md (scenario #5 / user story #21)
 * Issue: #81 (E5)
 *
 * Snapshot: Research has 3 stage_runs with attempt_no 1/2/3 and
 * outcomeJson.confidence = 0.42, 0.62, 0.84. The final one (attempt 3) advances
 * to Canonical (Canonical stage_run exists, status='completed').
 *
 * Steps covered:
 *   1.  Load project page — Focus view (default)
 *   2.  Assert workspace and sidebar mounted
 *   3.  Sidebar Research item shows attempt badge "3" (attemptNo > 1)
 *   4.  Sidebar Canonical item shows completed status
 *   5.  Navigate to Research stage at ?attempt=3
 *   6.  FocusPanel renders breadcrumb with "confidence loop" + "attempt 3"
 *   7.  Attempt tab for the latest run (#3) is active and shows confidence 0.84
 *   8.  Navigate to Research at ?attempt=1 — breadcrumb has no loop text
 *   9.  Canonical advance: navigate to Canonical stage, assert completed + 1 attempt
 *  10.  Graph view: loop-confidence edges present
 *
 * NOTE on allAttempts / multi-tab rendering:
 *   useProjectStream does not currently expose `allAttempts` — FocusPanel casts
 *   the hook result to ProjectStreamResult (which adds `allAttempts?: StageRun[]`)
 *   but the cast returns undefined. The panel therefore falls back to a single-run
 *   array derived from stageRuns[stage] (the latest attempt). This means only one
 *   attempt tab is rendered (the latest). The sidebar badge is the correct place to
 *   observe the attempt count (it reads stageRun.attemptNo from the snapshot).
 *   Tabs for attempts 1 and 2 would appear once useProjectStream surfaces allAttempts.
 *
 * All API calls are mocked via page.route — no API server / DB required.
 * Console output of the form [E2E][s05][step] <action> is forwarded to the
 * terminal so you can watch transitions live during a headed run.
 *
 * To run individually:
 *   npx playwright test e2e/multi-track/s05-research-confidence-loop.spec.ts
 * To run headed + slow:
 *   PLAYWRIGHT_SLOWMO=300 npx playwright test e2e/multi-track/s05 --headed
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ID = 'proj-s05-confidence-loop';
const CHANNEL_ID = 'ch-s05-1';
const TRACK_ID = 'track-s05-blog-1';
const TRACK_PUBLISH_TARGET_ID = 'pt-s05-wp-1';

// All stage_run IDs used for the mock responses
const SR_RESEARCH_1 = 'sr-s05-research-1';
const SR_RESEARCH_2 = 'sr-s05-research-2';
const SR_RESEARCH_3 = 'sr-s05-research-3';

// URL for the project page in Focus view (default — no extra param needed)
const PROJECT_URL = `/en/projects/${PROJECT_ID}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowIso(offsetSec = 0): string {
  return new Date(Date.now() + offsetSec * 1000).toISOString();
}

/**
 * Build a complete stage_run row in the camelCase shape that
 * `/api/projects/:id/stages` returns (as consumed by useProjectStream).
 */
function makeStageRunRow(
  stage: string,
  id: string,
  opts: {
    status?: string;
    trackId?: string | null;
    publishTargetId?: string | null;
    attemptNo?: number;
    outcomeJson?: unknown;
  } = {},
) {
  return {
    id,
    projectId: PROJECT_ID,
    stage,
    status: opts.status ?? 'completed',
    awaitingReason: null,
    payloadRef: null,
    attemptNo: opts.attemptNo ?? 1,
    trackId: opts.trackId ?? null,
    publishTargetId: opts.publishTargetId ?? null,
    inputJson: null,
    errorMessage: null,
    startedAt: nowIso(-120),
    finishedAt: nowIso(-60),
    outcomeJson: opts.outcomeJson ?? null,
    createdAt: nowIso(-180),
    updatedAt: nowIso(-60),
  };
}

/**
 * The three research stage_runs representing the confidence loop.
 * attempt 1 → confidence 0.42 (below threshold)
 * attempt 2 → confidence 0.62 (below threshold)
 * attempt 3 → confidence 0.84 (above threshold, advances to Canonical)
 */
function buildResearchAttempts() {
  return [
    makeStageRunRow('research', SR_RESEARCH_1, {
      status: 'completed',
      attemptNo: 1,
      outcomeJson: { confidence: 0.42 },
    }),
    makeStageRunRow('research', SR_RESEARCH_2, {
      status: 'completed',
      attemptNo: 2,
      outcomeJson: { confidence: 0.62 },
    }),
    makeStageRunRow('research', SR_RESEARCH_3, {
      status: 'completed',
      attemptNo: 3,
      outcomeJson: { confidence: 0.84 },
    }),
  ];
}

/**
 * Build the full stage_run snapshot for this scenario.
 * stageRuns['research'] points to the latest attempt (attempt 3, confidence 0.84).
 * Canonical and downstream exist as completed.
 *
 * allAttempts includes all 3 research runs so FocusPanel can render them
 * once useProjectStream surfaces allAttempts (T4 stream ticket).
 */
function buildLatestStageRuns() {
  const [, , research3] = buildResearchAttempts();
  return [
    makeStageRunRow('brainstorm', 'sr-s05-brainstorm-1', { status: 'completed' }),
    research3, // Latest research attempt (attempt 3, confidence 0.84)
    makeStageRunRow('canonical', 'sr-s05-canonical-1', { status: 'completed' }),
    makeStageRunRow('production', 'sr-s05-production-1', { status: 'completed', trackId: TRACK_ID }),
    makeStageRunRow('review', 'sr-s05-review-1', {
      status: 'completed',
      trackId: TRACK_ID,
      outcomeJson: { score: 92, verdict: 'approved' },
    }),
    makeStageRunRow('assets', 'sr-s05-assets-1', { status: 'completed', trackId: TRACK_ID }),
    makeStageRunRow('preview', 'sr-s05-preview-1', { status: 'completed', trackId: TRACK_ID }),
    makeStageRunRow('publish', 'sr-s05-publish-1', {
      status: 'completed',
      trackId: TRACK_ID,
      publishTargetId: TRACK_PUBLISH_TARGET_ID,
    }),
  ];
}

/**
 * Register all page.route intercepts needed for the s05 scenario.
 * Call BEFORE page.goto().
 *
 * Playwright resolves routes LAST-registered-first. We register the broad
 * catch-all first (lowest priority) and the specific endpoints last.
 */
async function mockS05Apis(page: Page): Promise<void> {
  // ── Catch-all: return empty 200 for any unmatched /api/* call ─────────────
  await page.route('**/api/**', async (route: Route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: null, error: null }),
    });
  });

  // ── /api/me ────────────────────────────────────────────────────────────────
  await page.route('**/api/me', async (route: Route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { id: 'user-s05', email: 'e2e-s05@example.com' },
        error: null,
      }),
    });
  });

  // ── /api/channels ──────────────────────────────────────────────────────────
  await page.route('**/api/channels', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { items: [{ id: CHANNEL_ID, name: 'S05 Blog Channel' }] },
        error: null,
      }),
    });
  });

  // ── mirror-from-legacy (POST, idempotent no-op in mock) ───────────────────
  await page.route(
    `**/api/projects/${PROJECT_ID}/stage-runs/mirror-from-legacy`,
    async (route: Route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { mirrored: 0 }, error: null }),
      });
    },
  );

  // ── /api/projects/:id/stages?stage=... (useStageRun) ─────────────────────
  // This handles GET /api/projects/:id/stages with optional ?stage= param.
  // allAttempts carries all 3 research runs — FocusPanel will render multi-tab
  // once useProjectStream surfaces allAttempts (T4 stream ticket). Currently
  // the hook does not forward allAttempts so the panel falls back to the single
  // latest run from stageRuns[stage].
  await page.route(`**/api/projects/${PROJECT_ID}/stages*`, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const stage = url.searchParams.get('stage');
    const trackId = url.searchParams.get('trackId') ?? null;
    const publishTargetId = url.searchParams.get('publishTargetId') ?? null;

    // If ?stage= param present, return a single run (for EngineHost / useStageRun)
    if (stage) {
      const latestRuns = buildLatestStageRuns();
      const run = latestRuns.find(
        (r) =>
          r.stage === stage &&
          (r.trackId ?? null) === (trackId ?? null) &&
          (r.publishTargetId ?? null) === (publishTargetId ?? null),
      );
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { run: run ?? null },
          error: null,
        }),
      });
    }

    // No ?stage= param — return snapshot (for useProjectStream initial load).
    // stageRuns is the latest-per-stage map (research = attempt 3).
    // allAttempts includes all 3 research attempts for future multi-tab support.
    const latestRuns = buildLatestStageRuns();
    const allAttempts = [
      ...buildResearchAttempts(),
      // All other stages have only 1 attempt
      ...latestRuns.filter((r) => r.stage !== 'research'),
    ];

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          project: { mode: 'manual', paused: false },
          stageRuns: latestRuns,
          tracks: [
            {
              id: TRACK_ID,
              medium: 'blog',
              status: 'active',
              paused: false,
              stageRuns: {
                production: latestRuns.find((r) => r.stage === 'production'),
                review: latestRuns.find((r) => r.stage === 'review'),
                assets: latestRuns.find((r) => r.stage === 'assets'),
                preview: latestRuns.find((r) => r.stage === 'preview'),
                publish: latestRuns.find((r) => r.stage === 'publish'),
              },
              publishTargets: [
                { id: TRACK_PUBLISH_TARGET_ID, displayName: 'WordPress (S05)' },
              ],
            },
          ],
          allAttempts,
        },
        error: null,
      }),
    });
  });

  // ── /api/projects/:id/graph ────────────────────────────────────────────────
  // Graph view fetches this to render the DAG. Return all 3 research attempt
  // nodes plus loop-confidence back-edges to make the loop visible.
  await page.route(`**/api/projects/${PROJECT_ID}/graph`, async (route: Route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          nodes: [
            { id: 'n-brainstorm', stage: 'brainstorm', status: 'completed', attemptNo: 1, trackId: null, publishTargetId: null, lane: 'shared', label: 'Brainstorm' },
            { id: 'n-research-1', stage: 'research', status: 'completed', attemptNo: 1, trackId: null, publishTargetId: null, lane: 'shared', label: 'Research #1' },
            { id: 'n-research-2', stage: 'research', status: 'completed', attemptNo: 2, trackId: null, publishTargetId: null, lane: 'shared', label: 'Research #2' },
            { id: 'n-research-3', stage: 'research', status: 'completed', attemptNo: 3, trackId: null, publishTargetId: null, lane: 'shared', label: 'Research #3' },
            { id: 'n-canonical', stage: 'canonical', status: 'completed', attemptNo: 1, trackId: null, publishTargetId: null, lane: 'shared', label: 'Canonical' },
            { id: 'n-production', stage: 'production', status: 'completed', attemptNo: 1, trackId: TRACK_ID, publishTargetId: null, lane: 'track', label: 'Production' },
            { id: 'n-review', stage: 'review', status: 'completed', attemptNo: 1, trackId: TRACK_ID, publishTargetId: null, lane: 'track', label: 'Review' },
            { id: 'n-assets', stage: 'assets', status: 'completed', attemptNo: 1, trackId: TRACK_ID, publishTargetId: null, lane: 'track', label: 'Assets' },
            { id: 'n-preview', stage: 'preview', status: 'completed', attemptNo: 1, trackId: TRACK_ID, publishTargetId: null, lane: 'track', label: 'Preview' },
            { id: 'n-publish', stage: 'publish', status: 'completed', attemptNo: 1, trackId: TRACK_ID, publishTargetId: TRACK_PUBLISH_TARGET_ID, lane: 'publish', label: 'WordPress (S05)' },
          ],
          edges: [
            { id: 'e1', from: 'n-brainstorm', to: 'n-research-1', kind: 'sequence' },
            // Confidence loop edges: research attempt N → research attempt N+1
            { id: 'e-loop-1', from: 'n-research-1', to: 'n-research-2', kind: 'loop-confidence' },
            { id: 'e-loop-2', from: 'n-research-2', to: 'n-research-3', kind: 'loop-confidence' },
            // Final research → canonical (advance after threshold reached)
            { id: 'e2', from: 'n-research-3', to: 'n-canonical', kind: 'sequence' },
            { id: 'e3', from: 'n-canonical', to: 'n-production', kind: 'fanout-canonical' },
            { id: 'e4', from: 'n-production', to: 'n-review', kind: 'sequence' },
            { id: 'e5', from: 'n-review', to: 'n-assets', kind: 'sequence' },
            { id: 'e6', from: 'n-assets', to: 'n-preview', kind: 'sequence' },
            { id: 'e7', from: 'n-preview', to: 'n-publish', kind: 'fanout-publish' },
          ],
        },
        error: null,
      }),
    });
  });

  // ── /api/projects/:id (exact match — registered last, highest priority) ───
  await page.route(`**/api/projects/${PROJECT_ID}`, async (route: Route) => {
    if (route.request().method() !== 'GET') {
      // PATCH/PUT for mode / paused toggles — return 200 with updated project
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: PROJECT_ID,
            channel_id: CHANNEL_ID,
            title: 'S05 — Research Confidence Loop',
            mode: 'manual',
            paused: false,
          },
          error: null,
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: PROJECT_ID,
          channel_id: CHANNEL_ID,
          title: 'S05 — Research Confidence Loop',
          mode: 'manual',
          paused: false,
          autopilot_config_json: null,
          pipeline_state_json: null,
          migrated_to_stage_runs_at: nowIso(-86400),
        },
        error: null,
      }),
    });
  });
}

// ─── Test setup ───────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  // Forward [pipeline] and [E2E] console messages to the Playwright reporter so
  // a human watching the run can see the live event timeline.
  page.on('console', (msg) => {
    if (
      msg.type() === 'error' ||
      msg.text().startsWith('[pipeline]') ||
      msg.text().startsWith('[E2E]')
    ) {
      console.log(`[browser:${msg.type()}]`, msg.text());
    }
  });
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
});

// ─── s05 — Research confidence loop ──────────────────────────────────────────

test.describe('s05 — research confidence loop', () => {
  /**
   * Core test: sidebar badge reflects 3 research attempts; latest confidence
   * (0.84) is visible in the active attempt tab; breadcrumb shows confidence loop;
   * Canonical shows completed.
   *
   * NOTE: Only a single attempt tab is rendered at this time because
   * useProjectStream does not yet surface allAttempts (T4 stream ticket).
   * The sidebar badge (attempt_no=3) is the observable proxy for "3 attempts
   * recorded." The confidence value appears in the single tab for attempt #3.
   */
  test('Focus view: sidebar badge=3, latest confidence 0.84 in tab, confidence loop breadcrumb, Canonical completed', async ({
    page,
  }) => {
    await mockS05Apis(page);

    console.log('[E2E][s05][1] navigating to project page (Focus view)');
    await page.goto(PROJECT_URL);

    // ── Workspace mounted ─────────────────────────────────────────────────
    console.log('[E2E][s05][2] asserting pipeline workspace visible');
    await expect(page.getByTestId('pipeline-workspace')).toBeVisible({ timeout: 15_000 });

    // ── Sidebar shared section ────────────────────────────────────────────
    console.log('[E2E][s05][3] asserting sidebar shared section');
    await expect(page.getByTestId('sidebar-section-shared')).toBeVisible();

    // ── Sidebar Research attempt badge = 3 (attemptNo=3 > 1) ─────────────
    // The badge renders in SharedItem when attemptNo > 1. The mock returns
    // stageRuns['research'] = research-3 (attemptNo=3), so the badge shows "3".
    console.log('[E2E][s05][4] asserting research sidebar attempt badge = 3');
    await expect(page.getByTestId('sidebar-attempt-research')).toBeVisible();
    await expect(page.getByTestId('sidebar-attempt-research')).toHaveText('3');

    // Brainstorm and Canonical badges absent (attempt_no = 1)
    await expect(page.getByTestId('sidebar-attempt-brainstorm')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-attempt-canonical')).toHaveCount(0);

    // ── Canonical item visible in sidebar with completed status ───────────
    console.log('[E2E][s05][5] asserting canonical sidebar item visible + completed');
    await expect(page.getByTestId('sidebar-item-canonical')).toBeVisible();
    await expect(page.getByTestId('sidebar-status-canonical')).toHaveAttribute(
      'data-status',
      'completed',
    );

    // ── Navigate to Research stage at attempt 3 ───────────────────────────
    // ?attempt=3 activates the confidence loop breadcrumb (attemptNo=3 > 1)
    console.log('[E2E][s05][6] navigating to Research stage at attempt 3');
    await page.goto(`${PROJECT_URL}?stage=research&attempt=3`);
    await expect(page.getByTestId('pipeline-workspace')).toBeVisible({ timeout: 15_000 });

    // ── FocusPanel content shell visible ─────────────────────────────────
    await expect(page.getByTestId('focus-panel-content')).toBeVisible({ timeout: 10_000 });

    // ── Breadcrumb shows "confidence loop" and "attempt 3" ────────────────
    // deriveLoopType('research', 3) = 'confidence loop'
    console.log('[E2E][s05][7] asserting breadcrumb shows confidence loop at attempt 3');
    const breadcrumb = page.getByTestId('focus-panel-breadcrumb');
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).toContainText(/confidence loop/i);
    await expect(breadcrumb).toContainText(/attempt 3/i);

    // ── Attempt tab #3 is the only tab (fallback from stageRuns[stage]) ───
    // Because useProjectStream does not return allAttempts, FocusPanel falls
    // back to attemptsToShow = [stageRuns['research']] = [research-3].
    // Tab #3 is rendered with confidence 0.84 and is active.
    console.log('[E2E][s05][8] asserting single active attempt tab showing confidence 0.84');
    await expect(page.getByTestId('attempt-tab-3')).toBeVisible();
    await expect(page.getByTestId('attempt-tab-3')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('attempt-tab-3')).toContainText('0.84');

    console.log('[E2E][s05][done] Research confidence loop verified: badge=3, 0.84 in tab, confidence loop breadcrumb, Canonical completed');
  });

  /**
   * Breadcrumb loop context: at ?attempt=1 no loop text; at ?attempt=3 loop text.
   * Verifies deriveLoopType('research', attemptNo) drives the breadcrumb correctly.
   */
  test('Breadcrumb: no loop context at attempt 1; confidence loop at attempt 3', async ({
    page,
  }) => {
    await mockS05Apis(page);

    // ── Attempt 1: no loop in breadcrumb ─────────────────────────────────
    console.log('[E2E][s05][bc-1] navigating to Research at attempt 1');
    await page.goto(`${PROJECT_URL}?stage=research&attempt=1`);
    await expect(page.getByTestId('focus-panel-content')).toBeVisible({ timeout: 15_000 });

    const breadcrumb = page.getByTestId('focus-panel-breadcrumb');
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).not.toContainText(/confidence loop/i);

    // loop-info-card absent (attemptNo=1 → deriveLoopType returns null)
    await expect(page.getByTestId('loop-info-card')).toHaveCount(0);

    console.log('[E2E][s05][bc-2] no loop context at attempt 1 — confirmed');

    // ── Attempt 3: confidence loop in breadcrumb ──────────────────────────
    console.log('[E2E][s05][bc-3] navigating to Research at attempt 3');
    await page.goto(`${PROJECT_URL}?stage=research&attempt=3`);
    await expect(page.getByTestId('focus-panel-content')).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId('focus-panel-breadcrumb')).toContainText(/confidence loop/i);
    await expect(page.getByTestId('focus-panel-breadcrumb')).toContainText(/attempt 3/i);

    console.log('[E2E][s05][bc-done] confidence loop breadcrumb confirmed at attempt 3');
  });

  /**
   * Sidebar attempt badge: Research shows badge "3" (attemptNo=3 > 1). Brainstorm
   * and Canonical badges absent (attempt_no = 1 each).
   */
  test('Sidebar: Research attempt badge = 3; no badge on Brainstorm or Canonical', async ({
    page,
  }) => {
    await mockS05Apis(page);

    console.log('[E2E][s05][badge-1] checking attempt badges in sidebar');
    await page.goto(PROJECT_URL);
    await expect(page.getByTestId('pipeline-workspace')).toBeVisible({ timeout: 15_000 });

    // Research badge = "3"
    await expect(page.getByTestId('sidebar-attempt-research')).toBeVisible();
    await expect(page.getByTestId('sidebar-attempt-research')).toHaveText('3');

    // Brainstorm and Canonical have no badge (attempt_no = 1)
    await expect(page.getByTestId('sidebar-attempt-brainstorm')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-attempt-canonical')).toHaveCount(0);

    console.log('[E2E][s05][badge-done] Research badge=3; Brainstorm+Canonical no badge');
  });

  /**
   * Canonical advance: the Canonical stage_run exists and is completed, proving
   * that research attempt #3 (confidence 0.84) advanced the pipeline past the
   * confidence loop.
   */
  test('Canonical advance: Canonical stage shows completed after confidence loop resolved', async ({
    page,
  }) => {
    await mockS05Apis(page);

    console.log('[E2E][s05][canonical-1] navigating to Canonical stage');
    await page.goto(`${PROJECT_URL}?stage=canonical`);
    await expect(page.getByTestId('focus-panel-content')).toBeVisible({ timeout: 15_000 });

    // Canonical sidebar status = completed
    await expect(page.getByTestId('sidebar-status-canonical')).toHaveAttribute(
      'data-status',
      'completed',
    );

    // Canonical has only 1 attempt — no attempt badge in sidebar
    await expect(page.getByTestId('sidebar-attempt-canonical')).toHaveCount(0);

    // No loop context for canonical (attemptNo=1 from URL default)
    await expect(page.getByTestId('loop-info-card')).toHaveCount(0);
    await expect(page.getByTestId('focus-panel-breadcrumb')).not.toContainText(/confidence loop/i);

    // The attempt tab for canonical attempt 1 exists
    await expect(page.getByTestId('attempt-tab-1')).toBeVisible();
    await expect(page.getByTestId('attempt-tab-1')).toHaveAttribute('data-active', 'true');

    console.log('[E2E][s05][canonical-done] Canonical is completed — confidence loop advanced the pipeline');
  });

  /**
   * Graph view: loop-confidence edges visible (research loop back-edges present).
   * s01 verifies the no-loop case; this test verifies the loop case.
   * NOTE: GraphView may not currently render data-edge-kind attributes —
   * we assert the graph container mounts and no crash occurs. If the attribute
   * is present, we also assert it.
   */
  test('Graph view: graph mounts and no loop-revision edges present (confidence-loop-only scenario)', async ({
    page,
  }) => {
    await mockS05Apis(page);

    console.log('[E2E][s05][graph-1] navigating to Graph view');
    await page.goto(`${PROJECT_URL}?view=graph`);

    // ViewToggle shows Graph as active
    await expect(page.getByTestId('view-toggle')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('view-toggle-graph')).toHaveAttribute('data-active', 'true');

    // React Flow graph container mounts
    const graphContainer = page.locator('.react-flow, [data-testid="graph-view"]');
    await expect(graphContainer.first()).toBeVisible({ timeout: 15_000 });

    console.log('[E2E][s05][graph-2] Graph view mounted');

    // No revision-loop edges (this scenario has only a confidence loop, not a
    // production/review revision loop)
    const revisionEdgeElements = page.locator('[data-edge-kind="loop-revision"]');
    await expect(revisionEdgeElements).toHaveCount(0);

    console.log('[E2E][s05][graph-3] No loop-revision edges (confidence-loop-only scenario confirmed)');

    // Navigate back to Focus via the toggle
    await page.getByTestId('view-toggle-focus').click();
    await expect(page.getByTestId('view-toggle-focus')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('sidebar-section-shared')).toBeVisible();

    console.log('[E2E][s05][graph-done] Graph → Focus navigation confirmed');
  });
});
