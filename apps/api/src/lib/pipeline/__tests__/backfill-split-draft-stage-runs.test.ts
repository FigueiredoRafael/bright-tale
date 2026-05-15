/**
 * T2.9 — one-shot backfill: splitDraftStageRuns across all legacy projects.
 *
 * Tracer bullet: an empty DB yields zero counts and writes nothing.
 *
 * Tests own a tiny in-memory fake of the Supabase tables the orchestrator
 * touches (stage_runs, tracks, content_drafts). No global mock state.
 */
import { describe, it, expect } from 'vitest';
import { backfillSplitDraftStageRuns } from '../backfill-split-draft-stage-runs';

interface TrackRow {
  id: string;
  project_id: string;
  medium: string;
  status: string;
  paused: boolean;
  autopilot_config_json: unknown;
  created_at: string;
  updated_at: string;
}

interface DraftRow {
  id: string;
  project_id: string;
  type: string;
  canonical_core_json: unknown;
  draft_json: unknown;
}

interface StageRunRow {
  id: string;
  project_id: string;
  stage: string;
  status: string;
  payload_ref: { kind: string; id: string } | null;
  outcome_json: Record<string, unknown> | null;
  track_id: string | null;
  publish_target_id: string | null;
  attempt_no: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Seed {
  tracks?: TrackRow[];
  content_drafts?: DraftRow[];
  stage_runs?: StageRunRow[];
}

interface FakeSb {
  tracks: TrackRow[];
  stage_runs: StageRunRow[];
  from: (table: string) => unknown;
}

function makeSb(seed: Seed): FakeSb {
  const tracks = seed.tracks ?? [];
  const drafts = seed.content_drafts ?? [];
  const stageRuns = seed.stage_runs ?? [];

  const pick = (table: string): Record<string, unknown>[] => {
    if (table === 'tracks') return tracks as unknown as Record<string, unknown>[];
    if (table === 'content_drafts') return drafts as unknown as Record<string, unknown>[];
    if (table === 'stage_runs') return stageRuns as unknown as Record<string, unknown>[];
    throw new Error(`Unexpected table: ${table}`);
  };

  function makeQuery(table: string) {
    const filters: Array<[string, unknown]> = [];
    const inFilters: Array<[string, unknown[]]> = [];

    const apply = () => {
      let rows = pick(table).slice();
      for (const [col, val] of filters) rows = rows.filter((r) => r[col] === val);
      for (const [col, vals] of inFilters) rows = rows.filter((r) => vals.includes(r[col]));
      return rows;
    };

    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return chain;
      },
      in(col: string, vals: unknown[]) {
        inFilters.push([col, vals]);
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        return chain;
      },
      maybeSingle: async () => {
        const rows = apply();
        return { data: rows[0] ?? null, error: null };
      },
      single: async () => {
        const rows = apply();
        if (rows.length === 0) return { data: null, error: { message: 'no rows' } };
        return { data: rows[0], error: null };
      },
      then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve({ data: apply(), error: null }).then(resolve);
      },
    };
    return chain;
  }

  let stageRunSeq = 0;
  return {
    tracks,
    stage_runs: stageRuns,
    from(table: string) {
      return {
        select: () => makeQuery(table),
        insert: (row: Record<string, unknown>) => {
          const now = '2026-05-14T00:00:00Z';
          let full: Record<string, unknown>;
          if (table === 'stage_runs') {
            stageRunSeq += 1;
            full = {
              id: `sr-new-${stageRunSeq}`,
              attempt_no: 1,
              outcome_json: null,
              payload_ref: null,
              track_id: null,
              publish_target_id: null,
              started_at: null,
              finished_at: null,
              created_at: now,
              updated_at: now,
              ...row,
            };
          } else {
            full = { ...row };
          }
          pick(table).push(full);
          return {
            select: () => ({
              single: async () => ({ data: full, error: null }),
            }),
          };
        },
      };
    },
  };
}

const PROJECT_A = '00000000-0000-0000-0000-0000000000aa';
const PROJECT_B = '00000000-0000-0000-0000-0000000000bb';

function legacyDraftRow(projectId: string, contentDraftId: string): StageRunRow {
  return {
    id: `sr-draft-${projectId}`,
    project_id: projectId,
    stage: 'draft',
    status: 'completed',
    payload_ref: { kind: 'content_draft', id: contentDraftId },
    outcome_json: null,
    track_id: null,
    publish_target_id: null,
    attempt_no: 1,
    started_at: '2026-05-13T00:00:00Z',
    finished_at: '2026-05-13T00:00:00Z',
    created_at: '2026-05-13T00:00:00Z',
    updated_at: '2026-05-13T00:00:00Z',
  };
}

function legacyContentDraft(projectId: string, contentDraftId: string): DraftRow {
  return {
    id: contentDraftId,
    project_id: projectId,
    type: 'blog',
    canonical_core_json: { thesis: 'x' },
    draft_json: { body: '...' },
  };
}

describe('backfillSplitDraftStageRuns — tracer', () => {
  it('returns zero counts and writes nothing when no draft stage_runs exist', async () => {
    const sb = makeSb({ stage_runs: [] });

    const result = await backfillSplitDraftStageRuns(sb as unknown as never);

    expect(result).toEqual({ scanned: 0, split: 0, alreadySplit: 0, failures: [] });
    expect(sb.stage_runs).toHaveLength(0);
  });
});

describe('backfillSplitDraftStageRuns — single legacy project', () => {
  it('splits one project with a draft stage_run into canonical + production', async () => {
    const sb = makeSb({
      content_drafts: [legacyContentDraft(PROJECT_A, 'cd-a')],
      stage_runs: [legacyDraftRow(PROJECT_A, 'cd-a')],
    });

    const result = await backfillSplitDraftStageRuns(sb as unknown as never);

    expect(result).toEqual({ scanned: 1, split: 1, alreadySplit: 0, failures: [] });
    const stages = sb.stage_runs.map((r) => r.stage).sort();
    expect(stages).toEqual(['canonical', 'draft', 'production']);
  });
});

describe('backfillSplitDraftStageRuns — multiple projects', () => {
  it('splits every distinct project that has draft stage_runs', async () => {
    const sb = makeSb({
      content_drafts: [
        legacyContentDraft(PROJECT_A, 'cd-a'),
        legacyContentDraft(PROJECT_B, 'cd-b'),
      ],
      stage_runs: [legacyDraftRow(PROJECT_A, 'cd-a'), legacyDraftRow(PROJECT_B, 'cd-b')],
    });

    const result = await backfillSplitDraftStageRuns(sb as unknown as never);

    expect(result).toEqual({ scanned: 2, split: 2, alreadySplit: 0, failures: [] });
    const byProject = (pid: string) =>
      sb.stage_runs.filter((r) => r.project_id === pid).map((r) => r.stage).sort();
    expect(byProject(PROJECT_A)).toEqual(['canonical', 'draft', 'production']);
    expect(byProject(PROJECT_B)).toEqual(['canonical', 'draft', 'production']);
  });

  it('deduplicates project_ids when a project has multiple draft rows', async () => {
    const sb = makeSb({
      content_drafts: [legacyContentDraft(PROJECT_A, 'cd-a')],
      stage_runs: [
        legacyDraftRow(PROJECT_A, 'cd-a'),
        { ...legacyDraftRow(PROJECT_A, 'cd-a'), id: 'sr-draft-2', attempt_no: 2 },
      ],
    });

    const result = await backfillSplitDraftStageRuns(sb as unknown as never);

    expect(result.scanned).toBe(1);
    expect(result.split).toBe(1);
  });
});

describe('backfillSplitDraftStageRuns — dry-run', () => {
  it('reports counts without inserting canonical/production rows when dryRun=true', async () => {
    const sb = makeSb({
      content_drafts: [
        legacyContentDraft(PROJECT_A, 'cd-a'),
        legacyContentDraft(PROJECT_B, 'cd-b'),
      ],
      stage_runs: [legacyDraftRow(PROJECT_A, 'cd-a'), legacyDraftRow(PROJECT_B, 'cd-b')],
    });

    const result = await backfillSplitDraftStageRuns(sb as unknown as never, { dryRun: true });

    expect(result).toEqual({ scanned: 2, split: 2, alreadySplit: 0, failures: [] });
    expect(sb.stage_runs.filter((r) => r.stage !== 'draft')).toHaveLength(0);
  });

  it('counts already-split projects as alreadySplit in dry-run', async () => {
    const sb = makeSb({
      content_drafts: [legacyContentDraft(PROJECT_A, 'cd-a')],
      stage_runs: [
        legacyDraftRow(PROJECT_A, 'cd-a'),
        { ...legacyDraftRow(PROJECT_A, 'cd-a'), id: 'sr-canonical-a', stage: 'canonical' },
        { ...legacyDraftRow(PROJECT_A, 'cd-a'), id: 'sr-production-a', stage: 'production' },
      ],
    });

    const result = await backfillSplitDraftStageRuns(sb as unknown as never, { dryRun: true });

    expect(result).toEqual({ scanned: 1, split: 0, alreadySplit: 1, failures: [] });
    expect(sb.stage_runs).toHaveLength(3);
  });
});

describe('backfillSplitDraftStageRuns — idempotency', () => {
  it('counts a project as alreadySplit and writes nothing when canonical+production exist', async () => {
    const existing: StageRunRow[] = [
      legacyDraftRow(PROJECT_A, 'cd-a'),
      {
        ...legacyDraftRow(PROJECT_A, 'cd-a'),
        id: 'sr-canonical-a',
        stage: 'canonical',
      },
      {
        ...legacyDraftRow(PROJECT_A, 'cd-a'),
        id: 'sr-production-a',
        stage: 'production',
      },
    ];
    const sb = makeSb({
      content_drafts: [legacyContentDraft(PROJECT_A, 'cd-a')],
      stage_runs: existing,
    });

    const result = await backfillSplitDraftStageRuns(sb as unknown as never);

    expect(result).toEqual({ scanned: 1, split: 0, alreadySplit: 1, failures: [] });
    expect(sb.stage_runs).toHaveLength(3);
  });
});
