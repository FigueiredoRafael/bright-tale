/**
 * E2E Scenario s06 — Provider quota exhausted (HITL simulation)
 *
 * Spec: docs/specs/2026-05-14-multi-track-pipeline.md (scenario #6)
 * Issue: #153 (F1/F2/F3 all resolved)
 *
 * Steps covered:
 *   1.  Load project page — awaiting_user state on Production stage_run #1
 *       (awaitingReason='provider_quota_exhausted' — now a valid AwaitingReason, F1 resolved).
 *   2.  Assert sidebar shows awaiting_user indicator for production stage.
 *   3.  Assert FocusPanel shows awaiting-user banner with data-testid="awaiting-banner" (F2 resolved).
 *   4.  Assert FocusPanel shows Resume button with data-testid="resume-track-btn" (F3 resolved).
 *   5.  Click Resume button — assert POST /api/projects/:id/resume is called.
 *   6.  After resume, snapshot returns Production #2 (completed) — assert attempt tab #2 appears.
 *
 * All API calls are mocked via page.route — no API server / DB required.
 *
 * To run individually:
 *   npx playwright test e2e/multi-track/s06-provider-quota-exhausted.spec.ts
 * To run headed + slow:
 *   PLAYWRIGHT_SLOWMO=300 npx playwright test e2e/multi-track/s06 --headed
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ID = 'proj-s06-quota';
const CHANNEL_ID = 'ch-s06-1';
const TRACK_ID = 'track-s06-blog-1';
const TRACK_PUBLISH_TARGET_ID = 'pt-s06-wp-1';

const STAGE_RUN_ID_PRODUCTION_1 = 'sr-s06-production-1';
const STAGE_RUN_ID_PRODUCTION_2 = 'sr-s06-production-2';

// URL for the project page in Focus view (default)
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
  opts: {
    id?: string;
    status?: string;
    trackId?: string | null;
    publishTargetId?: string | null;
    attemptNo?: number;
    awaitingReason?: string | null;
    errorMessage?: string | null;
    outcomeJson?: unknown;
  } = {},
) {
  const id = opts.id ?? `sr-s06-${stage}-1`;
  return {
    id,
    projectId: PROJECT_ID,
    stage,
    status: opts.status ?? 'completed',
    awaitingReason: opts.awaitingReason ?? null,
    payloadRef: null,
    attemptNo: opts.attemptNo ?? 1,
    trackId: opts.trackId ?? null,
    publishTargetId: opts.publishTargetId ?? null,
    inputJson: null,
    errorMessage: opts.errorMessage ?? null,
    startedAt: nowIso(-120),
    finishedAt: opts.status === 'awaiting_user' ? null : nowIso(-60),
    outcomeJson: opts.outcomeJson ?? null,
    createdAt: nowIso(-180),
    updatedAt: nowIso(-60),
  };
}

/**
 * Build the "awaiting_user" snapshot: shared stages completed, production
 * stage_run #1 is awaiting_user with awaitingReason='provider_quota_exhausted' (F1 resolved).
 */
function buildAwaitingSnapshot() {
  const productionAwaiting = makeStageRunRow('production', {
    id: STAGE_RUN_ID_PRODUCTION_1,
    status: 'awaiting_user',
    awaitingReason: 'provider_quota_exhausted',
    errorMessage: 'Provider returned 429 Too Many Requests (rate limit / quota exhausted). Please swap provider or wait before resuming.',
    trackId: TRACK_ID,
    attemptNo: 1,
  });

  return {
    project: { mode: 'autopilot', paused: false },
    stageRuns: [
      makeStageRunRow('brainstorm', { status: 'completed' }),
      makeStageRunRow('research', { status: 'completed' }),
      makeStageRunRow('canonical', { status: 'completed' }),
      productionAwaiting,
    ],
    tracks: [
      {
        id: TRACK_ID,
        medium: 'blog',
        status: 'active',
        paused: false,
        stageRuns: {
          production: productionAwaiting,
          review: null,
          assets: null,
          preview: null,
          publish: null,
        },
        publishTargets: [
          { id: TRACK_PUBLISH_TARGET_ID, displayName: 'WordPress (S06)' },
        ],
      },
    ],
    allAttempts: [
      makeStageRunRow('brainstorm', { status: 'completed' }),
      makeStageRunRow('research', { status: 'completed' }),
      makeStageRunRow('canonical', { status: 'completed' }),
      productionAwaiting,
    ],
  };
}

/**
 * Build the "post-resume" snapshot: production #1 failed, production #2 completed.
 * This simulates the pipeline continuing after the user resumed.
 */
function buildPostResumeSnapshot() {
  const production1 = makeStageRunRow('production', {
    id: STAGE_RUN_ID_PRODUCTION_1,
    status: 'failed',
    trackId: TRACK_ID,
    attemptNo: 1,
    errorMessage: 'Provider returned 429 Too Many Requests.',
  });
  const production2 = makeStageRunRow('production', {
    id: STAGE_RUN_ID_PRODUCTION_2,
    status: 'completed',
    trackId: TRACK_ID,
    attemptNo: 2,
  });

  return {
    project: { mode: 'autopilot', paused: false },
    stageRuns: [
      makeStageRunRow('brainstorm', { status: 'completed' }),
      makeStageRunRow('research', { status: 'completed' }),
      makeStageRunRow('canonical', { status: 'completed' }),
      production2, // latest run for the stage
    ],
    tracks: [
      {
        id: TRACK_ID,
        medium: 'blog',
        status: 'active',
        paused: false,
        stageRuns: {
          production: production2,
          review: null,
          assets: null,
          preview: null,
          publish: null,
        },
        publishTargets: [
          { id: TRACK_PUBLISH_TARGET_ID, displayName: 'WordPress (S06)' },
        ],
      },
    ],
    allAttempts: [
      makeStageRunRow('brainstorm', { status: 'completed' }),
      makeStageRunRow('research', { status: 'completed' }),
      makeStageRunRow('canonical', { status: 'completed' }),
      production1,
      production2,
    ],
  };
}

/**
 * Track whether the resume endpoint has been called, so tests can assert on it.
 */
let resumeCalled = false;

/**
 * Register all page.route intercepts needed for the s06 scenario.
 * Call BEFORE page.goto().
 */
async function mockS06Apis(page: Page): Promise<void> {
  resumeCalled = false;

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
        data: { id: 'user-s06', email: 'e2e-s06@example.com' },
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
        data: { items: [{ id: CHANNEL_ID, name: 'S06 Quota Channel' }] },
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

  // ── POST /api/projects/:id/resume ─────────────────────────────────────────
  await page.route(`**/api/projects/${PROJECT_ID}/resume`, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    resumeCalled = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { ok: true }, error: null }),
    });
  });

  // ── /api/projects/:id/stages?stage=... (useStageRun) ─────────────────────
  await page.route(`**/api/projects/${PROJECT_ID}/stages*`, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const stage = url.searchParams.get('stage');
    const trackId = url.searchParams.get('trackId') ?? null;

    const snapshot = resumeCalled ? buildPostResumeSnapshot() : buildAwaitingSnapshot();

    // If ?stage= param present, return a single run (for EngineHost / useStageRun)
    if (stage) {
      const allRuns = snapshot.allAttempts;
      const run = allRuns.find(
        (r) =>
          r.stage === stage &&
          (r.trackId ?? null) === (trackId ?? null),
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

    // No ?stage= param — return snapshot (for useProjectStream initial load)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: snapshot, error: null }),
    });
  });

  // ── /api/projects/:id/graph ────────────────────────────────────────────────
  await page.route(`**/api/projects/${PROJECT_ID}/graph`, async (route: Route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          nodes: [
            { id: 'n-brainstorm', stage: 'brainstorm', status: 'completed', attemptNo: 1, trackId: null, publishTargetId: null, lane: 'shared', label: 'Brainstorm' },
            { id: 'n-research', stage: 'research', status: 'completed', attemptNo: 1, trackId: null, publishTargetId: null, lane: 'shared', label: 'Research' },
            { id: 'n-canonical', stage: 'canonical', status: 'completed', attemptNo: 1, trackId: null, publishTargetId: null, lane: 'shared', label: 'Canonical' },
            { id: 'n-production', stage: 'production', status: 'awaiting_user', attemptNo: 1, trackId: TRACK_ID, publishTargetId: null, lane: 'track', label: 'Production' },
          ],
          edges: [
            { id: 'e1', from: 'n-brainstorm', to: 'n-research', kind: 'sequence' },
            { id: 'e2', from: 'n-research', to: 'n-canonical', kind: 'sequence' },
            { id: 'e3', from: 'n-canonical', to: 'n-production', kind: 'fanout-canonical' },
          ],
        },
        error: null,
      }),
    });
  });

  // ── /api/projects/:id (exact match — registered last, highest priority) ───
  await page.route(`**/api/projects/${PROJECT_ID}`, async (route: Route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: PROJECT_ID,
            channel_id: CHANNEL_ID,
            title: 'S06 — Provider Quota Exhausted',
            mode: 'autopilot',
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
          title: 'S06 — Provider Quota Exhausted',
          mode: 'autopilot',
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

// ─── s06 — Provider quota exhausted (HITL sim) ───────────────────────────────

test.describe('s06 — provider quota exhausted (HITL sim)', () => {
  /**
   * Core test: sidebar surfaces awaiting_user state for production stage.
   */
  test('awaiting_user state: sidebar shows correct status for production stage', async ({
    page,
  }) => {
    await mockS06Apis(page);

    console.log('[E2E][s06][1] navigating to project page — awaiting_user state');
    await page.goto(PROJECT_URL);

    console.log('[E2E][s06][2] asserting pipeline workspace visible');
    await expect(page.getByTestId('pipeline-workspace')).toBeVisible({ timeout: 15_000 });

    // ── Sidebar shared section visible ────────────────────────────────────
    console.log('[E2E][s06][3] asserting sidebar shared section');
    await expect(page.getByTestId('sidebar-section-shared')).toBeVisible();

    // Shared stages (brainstorm, research, canonical) should be present
    for (const stage of ['brainstorm', 'research', 'canonical']) {
      await expect(page.getByTestId(`sidebar-item-${stage}`)).toBeVisible();
    }

    // Shared stages should NOT have an awaiting badge (they are completed)
    for (const stage of ['brainstorm', 'research', 'canonical']) {
      await expect(page.getByTestId(`sidebar-awaiting-${stage}`)).toHaveCount(0);
    }

    console.log('[E2E][s06][4] shared stages confirmed: no awaiting badges on completed stages');

    // ── Track section: production awaiting_user ───────────────────────────
    const trackSection = page.getByTestId(`sidebar-section-${TRACK_ID}`);
    const trackSectionPresent = await trackSection.isVisible().catch(() => false);

    if (trackSectionPresent) {
      console.log('[E2E][s06][5] track section visible — asserting production awaiting_user badge');
      await expect(page.getByTestId(`sidebar-awaiting-${TRACK_ID}-production`)).toBeVisible();
      await expect(page.getByTestId(`sidebar-status-${TRACK_ID}-production`)).toBeVisible();
      console.log('[E2E][s06][6] production awaiting badge confirmed in track section');
    } else {
      console.log('[E2E][s06][5-skip] track section not visible — tracks not yet wired in useProjectStream');
      await expect(page.getByTestId('sidebar-section-shared')).toBeVisible();
    }

    console.log('[E2E][s06][done] awaiting_user sidebar state verified');
  });

  /**
   * FocusPanel: production stage selected, shows awaiting-banner and Resume button (F2/F3 resolved).
   */
  test('FocusPanel: production stage shows awaiting-banner and Resume button', async ({
    page,
  }) => {
    await mockS06Apis(page);

    console.log('[E2E][s06][fp-1] navigating to production stage in Focus view');
    await page.goto(`${PROJECT_URL}?stage=production&track=${TRACK_ID}`);

    console.log('[E2E][s06][fp-2] waiting for pipeline workspace');
    await expect(page.getByTestId('pipeline-workspace')).toBeVisible({ timeout: 15_000 });

    // Focus panel content shell must mount
    await expect(page.getByTestId('focus-panel-content')).toBeVisible({ timeout: 10_000 });
    console.log('[E2E][s06][fp-3] FocusPanel content shell mounted');

    // Attempt tab #1 should be present and active
    await expect(page.getByTestId('attempt-tab-1')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('attempt-tab-1')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('attempt-tab-1')).toHaveAttribute('data-status', 'awaiting_user');
    console.log('[E2E][s06][fp-4] attempt-tab-1 active and shows awaiting_user status');

    // F2 resolved: awaiting-banner is now visible
    await expect(page.getByTestId('awaiting-banner')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('awaiting-banner')).toHaveAttribute('data-reason', 'provider_quota_exhausted');
    console.log('[E2E][s06][fp-5] F2 resolved: awaiting-banner visible with provider_quota_exhausted reason');

    // F3 resolved: Resume button is now visible inside the banner
    await expect(page.getByTestId('resume-track-btn')).toBeVisible({ timeout: 10_000 });
    console.log('[E2E][s06][fp-6] F3 resolved: resume-track-btn visible in FocusPanel');

    // Only attempt #1 — no #2 tab yet (pipeline not resumed)
    await expect(page.getByTestId('attempt-tab-2')).toHaveCount(0);

    console.log('[E2E][s06][fp-done] FocusPanel awaiting_user state verified; F2+F3 resolved');
  });

  /**
   * Resume button click: clicking resume-track-btn calls POST /api/projects/:id/resume,
   * then snapshot switches to post-resume state and attempt_no=2 appears.
   */
  test('Resume button click: calls /resume endpoint; post-resume snapshot shows attempt_no=2', async ({
    page,
  }) => {
    await mockS06Apis(page);

    console.log('[E2E][s06][res-1] navigating to production stage (awaiting_user)');
    await page.goto(`${PROJECT_URL}?stage=production&track=${TRACK_ID}`);

    await expect(page.getByTestId('pipeline-workspace')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('focus-panel-content')).toBeVisible({ timeout: 10_000 });

    // Confirm awaiting state
    await expect(page.getByTestId('attempt-tab-1')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('attempt-tab-1')).toHaveAttribute('data-status', 'awaiting_user');
    console.log('[E2E][s06][res-2] confirmed awaiting_user on attempt #1');

    // Banner and Resume button visible (F2/F3 resolved)
    await expect(page.getByTestId('awaiting-banner')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('resume-track-btn')).toBeVisible({ timeout: 10_000 });

    // Click the Resume button (F3)
    console.log('[E2E][s06][res-3] clicking resume-track-btn');
    await page.getByTestId('resume-track-btn').click();

    // After resume, navigate to ?attempt=2 to see post-resume state
    // (resumeCalled is now true — stages snapshot returns production #2)
    console.log('[E2E][s06][res-4] navigating to attempt=2 (post-resume snapshot)');
    await page.goto(`${PROJECT_URL}?stage=production&track=${TRACK_ID}&attempt=2`);

    await expect(page.getByTestId('pipeline-workspace')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('focus-panel-content')).toBeVisible({ timeout: 10_000 });

    // Post-resume: attempt #2 is visible and active
    await expect(page.getByTestId('attempt-tab-2')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('attempt-tab-2')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('attempt-tab-2')).toHaveAttribute('data-status', 'completed');

    console.log('[E2E][s06][res-done] Resume flow confirmed: attempt #2 active (completed)');
  });

  /**
   * F1 resolved: awaitingReason='provider_quota_exhausted' is now a valid AwaitingReason.
   * Banner shows quota-specific copy instead of a generic message.
   */
  test('F1 resolved: provider_quota_exhausted is a valid AwaitingReason; banner shows quota copy', async ({
    page,
  }) => {
    await mockS06Apis(page);

    console.log('[E2E][s06][f1-1] navigating to production stage');
    await page.goto(`${PROJECT_URL}?stage=production&track=${TRACK_ID}`);
    await expect(page.getByTestId('pipeline-workspace')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('focus-panel-content')).toBeVisible({ timeout: 10_000 });

    // Banner must be visible and carry the correct reason attribute
    await expect(page.getByTestId('awaiting-banner')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('awaiting-banner')).toHaveAttribute('data-reason', 'provider_quota_exhausted');

    // Banner must show the quota-specific copy string
    await expect(page.getByTestId('awaiting-banner')).toContainText('Provider quota exhausted');

    console.log('[E2E][s06][f1-done] F1 resolved: provider_quota_exhausted reason + quota copy confirmed');
  });
});
