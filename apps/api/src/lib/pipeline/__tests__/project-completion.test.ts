/**
 * T7.3 — project-completion unit tests.
 *
 * Tests for the pure TS function `recomputeProjectStatus(projectId, sb)` that
 * mirrors the SQL trigger logic. Category A — no live DB needed.
 *
 * Rule: projects.status = 'completed' iff every non-aborted track has a
 * succeeded (status='completed') publish stage_run for every active
 * publish_target configured for that project's channel.
 *
 * TDD order (one test at a time, red → green):
 *   1. Active track + active target + succeeded publish run → 'completed'
 *   2. Aborted track does not block completion
 *   3. New active track on completed project → reverts to 'running'
 *   4. Active target with no succeeded publish run → stays non-completed
 *   5. All-aborted project (no active tracks) → does NOT auto-complete
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recomputeProjectStatus } from '@/lib/pipeline/project-completion';

// ─── Mock Supabase builder ────────────────────────────────────────────────────

/**
 * Minimal fake Supabase client. Each `from(table)` call returns a chainable
 * builder that resolves to `{ data, error }`. The caller sets up what each
 * table returns via the `tables` map before calling `recomputeProjectStatus`.
 */

interface DbRow {
  [key: string]: unknown;
}

interface TableResult {
  data: DbRow[] | DbRow | null;
  error: { message: string } | null;
}

type TableMap = Record<string, TableResult>;

function makeSb(tables: TableMap) {
  return {
    from: vi.fn((table: string) => {
      const result = tables[table] ?? { data: [], error: null };
      const chain: Record<string, unknown> = {};
      const noop = (..._args: unknown[]) => chain;
      chain.select = noop;
      chain.eq = noop;
      chain.in = noop;
      chain.is = noop;
      chain.neq = noop;
      chain.not = noop;
      chain.single = vi.fn(async () => result);
      chain.maybeSingle = vi.fn(async () => result);
      (chain as { then: (resolve: (v: TableResult) => unknown) => Promise<unknown> }).then = (
        resolve,
      ) => Promise.resolve(result).then(resolve);
      return chain;
    }),
  };
}

// ─── helpers to build consistent fake row shapes ─────────────────────────────

function makeProject(overrides: Partial<DbRow> = {}): DbRow {
  return {
    id: 'proj-1',
    channel_id: 'chan-1',
    status: 'running',
    ...overrides,
  };
}

function makeTrack(overrides: Partial<DbRow> = {}): DbRow {
  return {
    id: 'track-1',
    project_id: 'proj-1',
    medium: 'blog',
    status: 'active',
    ...overrides,
  };
}

function makePublishTarget(overrides: Partial<DbRow> = {}): DbRow {
  return {
    id: 'target-1',
    channel_id: 'chan-1',
    type: 'wordpress',
    is_active: true,
    ...overrides,
  };
}

function makeStageRun(overrides: Partial<DbRow> = {}): DbRow {
  return {
    id: 'sr-1',
    project_id: 'proj-1',
    stage: 'publish',
    status: 'completed',
    track_id: 'track-1',
    publish_target_id: 'target-1',
    ...overrides,
  };
}

// ─── Tests (TDD vertical slices) ──────────────────────────────────────────────

const PROJECT_ID = 'proj-1';

describe('recomputeProjectStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Shared builder helper ───────────────────────────────────────────────────
  /**
   * Build a mock Supabase client from a simple config:
   *   tracks: rows returned for .neq('status','aborted')
   *   targets: rows returned for publish_targets
   *   stageRuns: rows returned for stage_runs
   *   projectStatus: current project status (default 'running')
   */
  function buildSb(opts: {
    tracks: DbRow[];
    targets: DbRow[];
    stageRuns: DbRow[];
    projectStatus?: string;
    onProjectUpdate?: (payload: DbRow) => void;
  }) {
    const updateCalls: Array<{ table: string; payload: DbRow }> = [];
    const onUpdate = opts.onProjectUpdate ?? ((p) => updateCalls.push({ table: 'projects', payload: p }));
    return {
      updateCalls,
      sb: {
        from: vi.fn((table: string) => {
          if (table === 'projects') {
            const chain: Record<string, unknown> = {};
            chain.select = vi.fn(() => chain);
            chain.eq = vi.fn(() => chain);
            chain.maybeSingle = vi.fn(async () => ({
              data: makeProject({ status: opts.projectStatus ?? 'running' }),
              error: null,
            }));
            chain.update = vi.fn((payload: DbRow) => {
              onUpdate(payload);
              const updateChain: Record<string, unknown> = {};
              updateChain.eq = vi.fn(() => updateChain);
              (updateChain as { then: (resolve: (v: { error: null }) => unknown) => Promise<unknown> }).then = (
                resolve,
              ) => Promise.resolve({ error: null }).then(resolve);
              return updateChain;
            });
            return chain;
          }
          if (table === 'tracks') {
            const chain: Record<string, unknown> = {};
            chain.select = vi.fn(() => chain);
            chain.eq = vi.fn(() => chain);
            chain.neq = vi.fn(() => chain);
            (chain as { then: (resolve: (v: TableResult) => unknown) => Promise<unknown> }).then = (
              resolve,
            ) => Promise.resolve({ data: opts.tracks, error: null }).then(resolve);
            return chain;
          }
          if (table === 'publish_targets') {
            const chain: Record<string, unknown> = {};
            chain.select = vi.fn(() => chain);
            chain.eq = vi.fn(() => chain);
            chain.in = vi.fn(() => chain);
            (chain as { then: (resolve: (v: TableResult) => unknown) => Promise<unknown> }).then = (
              resolve,
            ) => Promise.resolve({ data: opts.targets, error: null }).then(resolve);
            return chain;
          }
          if (table === 'stage_runs') {
            const chain: Record<string, unknown> = {};
            chain.select = vi.fn(() => chain);
            chain.eq = vi.fn(() => chain);
            chain.in = vi.fn(() => chain);
            (chain as { then: (resolve: (v: TableResult) => unknown) => Promise<unknown> }).then = (
              resolve,
            ) => Promise.resolve({ data: opts.stageRuns, error: null }).then(resolve);
            return chain;
          }
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn(() => chain);
          chain.eq = vi.fn(() => chain);
          (chain as { then: (resolve: (v: TableResult) => unknown) => Promise<unknown> }).then = (
            resolve,
          ) => Promise.resolve({ data: [], error: null }).then(resolve);
          return chain;
        }),
      },
    };
  }

  // ─── Slice 1 ────────────────────────────────────────────────────────────────
  it('flips status to completed when one active track has a succeeded publish run for its active target', async () => {
    const { sb, updateCalls } = buildSb({
      tracks: [makeTrack()],
      targets: [makePublishTarget()],
      stageRuns: [makeStageRun()],
      projectStatus: 'running',
    });

    await recomputeProjectStatus(PROJECT_ID, sb);

    expect(updateCalls.find((c) => c.table === 'projects')?.payload).toMatchObject({
      status: 'completed',
    });
  });

  // ─── Slice 2 ────────────────────────────────────────────────────────────────
  it('does not block completion when one track is aborted (only non-aborted tracks count)', async () => {
    // The mock's tracks query already returns only non-aborted tracks (neq).
    // So we return [activeTrack] as if the aborted one is excluded by DB.
    const { sb, updateCalls } = buildSb({
      tracks: [makeTrack({ id: 'track-active', status: 'active' })],
      targets: [makePublishTarget()],
      stageRuns: [makeStageRun({ track_id: 'track-active' })],
      projectStatus: 'running',
    });

    await recomputeProjectStatus(PROJECT_ID, sb);

    expect(updateCalls.find((c) => c.table === 'projects')?.payload).toMatchObject({
      status: 'completed',
    });
  });

  // ─── Slice 3 ────────────────────────────────────────────────────────────────
  it('reverts completed project to running when a new active track has no publish run', async () => {
    // Two non-aborted tracks; track-2 has no publish run yet.
    const { sb, updateCalls } = buildSb({
      tracks: [
        makeTrack({ id: 'track-1', status: 'active' }),
        makeTrack({ id: 'track-2', status: 'active' }),
      ],
      targets: [makePublishTarget({ id: 'target-1' })],
      // Only track-1 has a completed publish run; track-2 has none.
      stageRuns: [makeStageRun({ track_id: 'track-1', publish_target_id: 'target-1' })],
      projectStatus: 'completed',
    });

    await recomputeProjectStatus(PROJECT_ID, sb);

    expect(updateCalls.find((c) => c.table === 'projects')?.payload).toMatchObject({
      status: 'running',
    });
  });

  // ─── Slice 4 ────────────────────────────────────────────────────────────────
  it('keeps project non-completed when active target has no succeeded publish run', async () => {
    const { sb, updateCalls } = buildSb({
      tracks: [makeTrack()],
      targets: [makePublishTarget()],
      stageRuns: [], // no completed publish run
      projectStatus: 'running',
    });

    await recomputeProjectStatus(PROJECT_ID, sb);

    // No update should have been made
    expect(updateCalls).toHaveLength(0);
  });

  // ─── Slice 5 ────────────────────────────────────────────────────────────────
  it('does NOT flip to completed when all tracks are aborted (vacuous truth guard)', async () => {
    const { sb, updateCalls } = buildSb({
      // DB query uses neq('status','aborted') so returns empty array
      tracks: [],
      targets: [makePublishTarget()],
      stageRuns: [],
      projectStatus: 'running',
    });

    await recomputeProjectStatus(PROJECT_ID, sb);

    // Must not have set status to completed
    expect(updateCalls).toHaveLength(0);
  });
});
