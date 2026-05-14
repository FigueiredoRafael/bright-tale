import type { Page, Route, Request } from '@playwright/test';

/**
 * v2 Pipeline mock helpers — for the supervised <PipelineView /> behind
 * `?v=2`. Distinct from the legacy `pipelineMocks.ts` (which targets the
 * xstate-driven orchestrator + engines).
 *
 * Endpoints owned by this fixture:
 *   GET    /api/projects/:id                       — hydrate project
 *   GET    /api/projects/:id/stages                — snapshot of stage_runs
 *   POST   /api/projects/:id/stage-runs            — create a Stage Run
 *   PATCH  /api/projects/:id/stage-runs/:srId      — action='abort'
 *   POST   /api/projects/:id/stage-runs/:srId/continue
 *   POST   /api/projects/:id/stage-runs/:srId/manual-output
 *   GET    /api/projects/:id/stage-runs/:srId/payload — Payload Ref summary
 *   GET    /api/content-drafts/:id                 — sheet draft viewer
 *   GET    /api/research-sessions/:id              — sheet findings report
 *   GET    /api/brainstorm/drafts/:id              — sheet brainstorm output
 *
 * The mock keeps Stage Runs in an in-memory map; the test scripts call
 * `mock.completeStageRun(stage, payloadRef)` etc. to advance state, then the
 * UI's `refresh()` pulls the new snapshot.
 *
 * IMPORTANT: Playwright matches routes in REVERSE registration order — the
 * route registered LAST is tried FIRST. We therefore register the broad
 * catch-all FIRST and the specific routes LAST so the specifics win.
 */

export type Stage = 'brainstorm' | 'research' | 'draft' | 'review' | 'assets' | 'preview' | 'publish';

export interface StageRunRow {
  id: string;
  project_id: string;
  stage: Stage;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'aborted' | 'awaiting_user' | 'skipped';
  awaiting_reason: 'manual_paste' | 'manual_advance' | 'manual_review' | null;
  payload_ref: { kind: string; id: string } | null;
  attempt_no: number;
  input_json: unknown;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  outcome_json: unknown;
  created_at: string;
  updated_at: string;
}

export interface ProjectV2Seed {
  id: string;
  channelId: string | null;
  title: string;
  mode: 'autopilot' | 'manual';
  paused: boolean;
}

export const DEFAULT_V2_PROJECT: ProjectV2Seed = {
  id: 'proj-v2-1',
  channelId: 'ch-v2-1',
  title: 'V2 Pipeline Project',
  mode: 'manual',
  paused: false,
};

export interface PipelineV2Mock {
  project: ProjectV2Seed;
  runs: Map<Stage, StageRunRow>;
  /** Insert (or replace) a Stage Run row. */
  setStageRun(stage: Stage, partial: Partial<StageRunRow>): StageRunRow;
  /** Convenience: mark a stage completed with a payload_ref. */
  completeStageRun(stage: Stage, payloadRef: { kind: string; id: string }): StageRunRow;
  /** Snapshot of all rows (sorted by created_at). */
  snapshot(): StageRunRow[];
  /** All payload mocks the route returns for `/payload`, keyed by `${kind}#${id}`. */
  payloads: Map<string, Record<string, unknown>>;
  /** All content_draft rows the sheet fetches. */
  drafts: Map<string, Record<string, unknown>>;
  /** All research_session rows the sheet fetches. */
  researchSessions: Map<string, Record<string, unknown>>;
  /** Sequence of POST/PATCH actions for assertion. */
  actions: Array<{ method: string; url: string; body: unknown }>;
}

function nowIso(offsetSec = 0): string {
  return new Date(Date.now() + offsetSec * 1000).toISOString();
}

async function readBody(req: Request): Promise<unknown> {
  const raw = req.postData();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function mockPipelineV2(
  page: Page,
  opts: { project?: ProjectV2Seed } = {},
): Promise<PipelineV2Mock> {
  const project = opts.project ?? DEFAULT_V2_PROJECT;
  const runs = new Map<Stage, StageRunRow>();
  const payloads = new Map<string, Record<string, unknown>>();
  const drafts = new Map<string, Record<string, unknown>>();
  const researchSessions = new Map<string, Record<string, unknown>>();
  const actions: PipelineV2Mock['actions'] = [];

  function setStageRun(stage: Stage, partial: Partial<StageRunRow>): StageRunRow {
    const existing = runs.get(stage);
    const row: StageRunRow = {
      id: existing?.id ?? `sr-${stage}-${runs.size + 1}`,
      project_id: project.id,
      stage,
      status: 'queued',
      awaiting_reason: null,
      payload_ref: null,
      attempt_no: 1,
      input_json: null,
      error_message: null,
      started_at: null,
      finished_at: null,
      outcome_json: null,
      created_at: existing?.created_at ?? nowIso(-(7 - ['brainstorm','research','draft','review','assets','preview','publish'].indexOf(stage)) * 60),
      updated_at: nowIso(),
      ...existing,
      ...partial,
    };
    runs.set(stage, row);
    return row;
  }

  function completeStageRun(stage: Stage, payloadRef: { kind: string; id: string }): StageRunRow {
    return setStageRun(stage, {
      status: 'completed',
      payload_ref: payloadRef,
      finished_at: nowIso(),
      updated_at: nowIso(),
    });
  }

  function snapshot(): StageRunRow[] {
    return Array.from(runs.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  // ─── Register routes in BOTTOM-UP order ───────────────────────────────
  // Playwright tries the LAST registered route first. So the catch-all is
  // registered first (so it runs last), and the specifics are registered
  // last (so they run first).

  // ── Catch-all (registered first → tried last) ──────────────────────────
  await page.route('**/api/**', async (route: Route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: null, error: null }),
    });
  });

  // ── /api/me ────────────────────────────────────────────────────────────
  await page.route('**/api/me', async (route: Route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { id: 'user-e2e', email: 'e2e@example.com' }, error: null }),
    });
  });

  // ── /api/channels ──────────────────────────────────────────────────────
  await page.route('**/api/channels', async (route: Route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { items: [{ id: project.channelId, name: 'E2E Channel' }] },
        error: null,
      }),
    });
  });

  // ── GET /api/research-sessions/:id (sheet) ─────────────────────────────
  await page.route(`**/api/research-sessions/*`, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const id = route.request().url().split('/').pop()?.split('?')[0] ?? '';
    const session = researchSessions.get(id);
    if (!session) {
      return route.fulfill({ status: 404, body: JSON.stringify({ data: null, error: { code: 'NOT_FOUND' } }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: session, error: null }),
    });
  });

  // ── GET /api/content-drafts/:id (sheet) ────────────────────────────────
  await page.route(`**/api/content-drafts/*`, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const id = route.request().url().split('/').pop()?.split('?')[0] ?? '';
    const draft = drafts.get(id);
    if (!draft) {
      return route.fulfill({ status: 404, body: JSON.stringify({ data: null, error: { code: 'NOT_FOUND' } }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: draft, error: null }),
    });
  });

  // ── GET /:srId/payload ─────────────────────────────────────────────────
  await page.route(`**/api/projects/${project.id}/stage-runs/*/payload`, async (route: Route) => {
    const url = route.request().url();
    const match = url.match(/stage-runs\/([^/]+)\/payload/);
    const srId = match?.[1] ?? '';
    const stageRun = Array.from(runs.values()).find((r) => r.id === srId);
    if (!stageRun?.payload_ref) {
      return route.fulfill({ status: 200, body: JSON.stringify({ data: { payload: null }, error: null }) });
    }
    const key = `${stageRun.payload_ref.kind}#${stageRun.payload_ref.id}`;
    const payload = payloads.get(key) ?? { kind: stageRun.payload_ref.kind, raw: { id: stageRun.payload_ref.id } };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { payload }, error: null }),
    });
  });

  // ── PATCH/POST on a specific Stage Run ─────────────────────────────────
  // Use `**` so the matcher captures both `/stage-runs/:id` and the deeper
  // action paths (`/stage-runs/:id/continue`, `/stage-runs/:id/manual-output`).
  await page.route(`**/api/projects/${project.id}/stage-runs/**`, async (route: Route) => {
    const method = route.request().method();
    const url = route.request().url();
    // `/payload` has its own route registered after this one (which therefore
    // runs first); guard here too for safety.
    if (url.includes('/payload')) return route.fallback();
    const body = await readBody(route.request());
    actions.push({ method, url, body });

    // The Stage Run id is the path segment right after `/stage-runs/`.
    const segments = new URL(url).pathname.split('/');
    const srIdx = segments.indexOf('stage-runs');
    const stageRunId = srIdx >= 0 ? segments[srIdx + 1] : '';
    const stageRun = Array.from(runs.values()).find((r) => r.id === stageRunId);
    if (!stageRun) {
      return route.fulfill({ status: 404, body: JSON.stringify({ data: null, error: { code: 'NOT_FOUND' } }) });
    }

    if (method === 'PATCH' && (body as { action?: string } | null)?.action === 'abort') {
      setStageRun(stageRun.stage, { status: 'aborted', finished_at: nowIso() });
      return route.fulfill({
        status: 200,
        body: JSON.stringify({ data: { stageRunId: stageRun.id, status: 'aborted' }, error: null }),
      });
    }
    if (method === 'POST' && url.endsWith('/continue')) {
      setStageRun(stageRun.stage, { status: 'completed', finished_at: nowIso() });
      return route.fulfill({
        status: 200,
        body: JSON.stringify({ data: { stageRunId: stageRun.id, status: 'completed' }, error: null }),
      });
    }
    return route.fallback();
  });

  // ── POST /api/projects/:id/stage-runs ──────────────────────────────────
  await page.route(`**/api/projects/${project.id}/stage-runs`, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = (await readBody(route.request())) as
      | { stage: Stage; input?: unknown; cascade?: boolean }
      | null;
    actions.push({ method: 'POST', url: '/stage-runs', body });
    if (!body?.stage) {
      return route.fulfill({ status: 400, body: JSON.stringify({ data: null, error: { code: 'BAD' } }) });
    }
    const newRow = setStageRun(body.stage, {
      id: `sr-${body.stage}-${Date.now()}`,
      status: 'queued',
      input_json: body.input ?? null,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          stageRun: {
            id: newRow.id,
            projectId: newRow.project_id,
            stage: newRow.stage,
            status: newRow.status,
            attemptNo: newRow.attempt_no,
            inputJson: newRow.input_json,
            createdAt: newRow.created_at,
            updatedAt: newRow.updated_at,
          },
        },
        error: null,
      }),
    });
  });

  // ── /api/projects/:id/stages ───────────────────────────────────────────
  await page.route(`**/api/projects/${project.id}/stages`, async (route: Route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          project: { mode: project.mode, paused: project.paused },
          stageRuns: snapshot().map((row) => ({
            id: row.id,
            projectId: row.project_id,
            stage: row.stage,
            status: row.status,
            awaitingReason: row.awaiting_reason,
            payloadRef: row.payload_ref,
            attemptNo: row.attempt_no,
            inputJson: row.input_json,
            errorMessage: row.error_message,
            startedAt: row.started_at,
            finishedAt: row.finished_at,
            outcomeJson: row.outcome_json,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })),
        },
        error: null,
      }),
    });
  });

  // ── /api/projects/:id (registered LAST so it runs FIRST for exact match) ─
  await page.route(`**/api/projects/${project.id}`, async (route: Route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 405, body: JSON.stringify({ data: null, error: { code: 'METHOD' } }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: project.id,
          channel_id: project.channelId,
          title: project.title,
          mode: project.mode,
          paused: project.paused,
          autopilot_config_json: null,
          pipeline_state_json: null,
          migrated_to_stage_runs_at: nowIso(-86400),
        },
        error: null,
      }),
    });
  });

  return {
    project,
    runs,
    setStageRun,
    completeStageRun,
    snapshot,
    payloads,
    drafts,
    researchSessions,
    actions,
  };
}
