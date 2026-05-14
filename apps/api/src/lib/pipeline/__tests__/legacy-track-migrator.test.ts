/**
 * Legacy Track Migrator — unit tests.
 *
 * Tracer bullet: a legacy project with zero tracks and a `content_drafts`
 * row of `type='blog'` gets a single active blog Track on first call.
 *
 * Each test owns a tiny in-memory fake of the Supabase tables it touches.
 * No global mock state.
 */
import { describe, it, expect } from 'vitest';
import { ensureTracksForProject, splitDraftStageRuns } from '../legacy-track-migrator';

const PROJECT_ID = '00000000-0000-0000-0000-0000000000aa';

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

interface ProjectRow {
  id: string;
  pipeline_state_json: Record<string, unknown> | null;
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
  projects?: ProjectRow[];
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
  const projects = seed.projects ?? [];
  const stageRuns = seed.stage_runs ?? [];

  const pick = (table: string): Record<string, unknown>[] => {
    if (table === 'tracks') return tracks as unknown as Record<string, unknown>[];
    if (table === 'content_drafts') return drafts as unknown as Record<string, unknown>[];
    if (table === 'projects') return projects as unknown as Record<string, unknown>[];
    if (table === 'stage_runs') return stageRuns as unknown as Record<string, unknown>[];
    throw new Error(`Unexpected table: ${table}`);
  };

  function makeQuery(table: string) {
    const filters: Array<[string, unknown]> = [];
    const inFilters: Array<[string, unknown[]]> = [];
    const orders: Array<[string, boolean]> = [];
    let limitN: number | null = null;

    const apply = () => {
      let rows = pick(table).slice();
      for (const [col, val] of filters) rows = rows.filter((r) => r[col] === val);
      for (const [col, vals] of inFilters) rows = rows.filter((r) => vals.includes(r[col]));
      for (const [col, asc] of orders) {
        rows.sort((a, b) => {
          const av = a[col] as string;
          const bv = b[col] as string;
          return asc ? (av < bv ? -1 : av > bv ? 1 : 0) : av < bv ? 1 : av > bv ? -1 : 0;
        });
      }
      if (limitN !== null) rows = rows.slice(0, limitN);
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
      order(col: string, opts?: { ascending?: boolean }) {
        orders.push([col, opts?.ascending !== false]);
        return chain;
      },
      limit(n: number) {
        limitN = n;
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

  let trackSeq = 0;
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
          if (table === 'tracks') {
            trackSeq += 1;
            full = {
              id: `tr-${trackSeq}`,
              status: 'active',
              paused: false,
              autopilot_config_json: null,
              created_at: now,
              updated_at: now,
              ...row,
            };
          } else if (table === 'stage_runs') {
            stageRunSeq += 1;
            full = {
              id: `sr-${stageRunSeq}`,
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

describe('ensureTracksForProject — medium fallback', () => {
  it('falls back to pipeline_state_json.contentType when no content_drafts exist', async () => {
    const sb = makeSb({
      projects: [{ id: PROJECT_ID, pipeline_state_json: { contentType: 'podcast' } }],
      tracks: [],
      content_drafts: [],
    });

    const track = await ensureTracksForProject(sb as unknown as never, PROJECT_ID);

    expect(track.medium).toBe('podcast');
  });

  it("defaults to 'blog' when neither content_drafts nor pipeline_state_json.contentType are present", async () => {
    const sb = makeSb({
      projects: [{ id: PROJECT_ID, pipeline_state_json: null }],
      tracks: [],
      content_drafts: [],
    });

    const track = await ensureTracksForProject(sb as unknown as never, PROJECT_ID);

    expect(track.medium).toBe('blog');
  });

  it("defaults to 'blog' when content_drafts.type is unknown", async () => {
    const sb = makeSb({
      projects: [{ id: PROJECT_ID, pipeline_state_json: null }],
      tracks: [],
      content_drafts: [
        {
          id: 'cd-x',
          project_id: PROJECT_ID,
          type: 'mystery',
          canonical_core_json: null,
          draft_json: null,
        },
      ],
    });

    const track = await ensureTracksForProject(sb as unknown as never, PROJECT_ID);

    expect(track.medium).toBe('blog');
  });
});

describe.each(['video', 'shorts', 'podcast'] as const)(
  'ensureTracksForProject — medium variant %s',
  (medium) => {
    it(`creates a ${medium} track when content_drafts.type is ${medium}`, async () => {
      const sb = makeSb({
        projects: [{ id: PROJECT_ID, pipeline_state_json: null }],
        tracks: [],
        content_drafts: [
          {
            id: `cd-${medium}`,
            project_id: PROJECT_ID,
            type: medium,
            canonical_core_json: null,
            draft_json: null,
          },
        ],
      });

      const track = await ensureTracksForProject(sb as unknown as never, PROJECT_ID);

      expect(track.medium).toBe(medium);
      expect(sb.tracks[0].medium).toBe(medium);
    });
  },
);

describe('ensureTracksForProject — idempotency', () => {
  it('returns the existing active track without inserting when one already exists', async () => {
    const sb = makeSb({
      projects: [{ id: PROJECT_ID, pipeline_state_json: null }],
      tracks: [
        {
          id: 'tr-existing',
          project_id: PROJECT_ID,
          medium: 'video',
          status: 'active',
          paused: false,
          autopilot_config_json: null,
          created_at: '2026-05-13T00:00:00Z',
          updated_at: '2026-05-13T00:00:00Z',
        },
      ],
      content_drafts: [],
    });

    const track = await ensureTracksForProject(sb as unknown as never, PROJECT_ID);

    expect(track).toMatchObject({
      id: 'tr-existing',
      projectId: PROJECT_ID,
      medium: 'video',
      status: 'active',
    });
    expect(sb.tracks).toHaveLength(1);
  });
});

describe('splitDraftStageRuns', () => {
  it('returns null when project has no draft stage_runs', async () => {
    const sb = makeSb({
      projects: [{ id: PROJECT_ID, pipeline_state_json: null }],
      tracks: [],
      content_drafts: [],
      stage_runs: [],
    });

    const result = await splitDraftStageRuns(sb as unknown as never, PROJECT_ID);

    expect(result).toBeNull();
    expect(sb.stage_runs).toHaveLength(0);
  });

  it.each([
    {
      label: 'canonical only',
      canonical_core_json: { thesis: 'x' },
      draft_json: null,
      expected: { canonical: 'completed', production: 'queued' },
    },
    {
      label: 'neither',
      canonical_core_json: null,
      draft_json: null,
      expected: { canonical: 'queued', production: 'queued' },
    },
  ])('derives statuses from content_draft fields — $label', async ({ canonical_core_json, draft_json, expected }) => {
    const sb = makeSb({
      projects: [{ id: PROJECT_ID, pipeline_state_json: null }],
      tracks: [
        {
          id: 'tr-blog',
          project_id: PROJECT_ID,
          medium: 'blog',
          status: 'active',
          paused: false,
          autopilot_config_json: null,
          created_at: '2026-05-13T00:00:00Z',
          updated_at: '2026-05-13T00:00:00Z',
        },
      ],
      content_drafts: [
        {
          id: 'cd-1',
          project_id: PROJECT_ID,
          type: 'blog',
          canonical_core_json,
          draft_json,
        },
      ],
      stage_runs: [
        {
          id: 'sr-draft',
          project_id: PROJECT_ID,
          stage: 'draft',
          status: 'completed',
          payload_ref: { kind: 'content_draft', id: 'cd-1' },
          outcome_json: null,
          track_id: null,
          publish_target_id: null,
          attempt_no: 1,
          started_at: '2026-05-13T00:00:00Z',
          finished_at: '2026-05-13T00:00:00Z',
          created_at: '2026-05-13T00:00:00Z',
          updated_at: '2026-05-13T00:00:00Z',
        },
      ],
    });

    const result = await splitDraftStageRuns(sb as unknown as never, PROJECT_ID);
    expect(result?.canonical.status).toBe(expected.canonical);
    expect(result?.production.status).toBe(expected.production);
  });

  it('emits canonical=completed and production=completed when content_draft has both canonical_core_json and draft_json', async () => {
    const sb = makeSb({
      projects: [{ id: PROJECT_ID, pipeline_state_json: null }],
      tracks: [
        {
          id: 'tr-blog',
          project_id: PROJECT_ID,
          medium: 'blog',
          status: 'active',
          paused: false,
          autopilot_config_json: null,
          created_at: '2026-05-13T00:00:00Z',
          updated_at: '2026-05-13T00:00:00Z',
        },
      ],
      content_drafts: [
        {
          id: 'cd-1',
          project_id: PROJECT_ID,
          type: 'blog',
          canonical_core_json: { thesis: 'x' },
          draft_json: { body: '...' },
        },
      ],
      stage_runs: [
        {
          id: 'sr-draft',
          project_id: PROJECT_ID,
          stage: 'draft',
          status: 'completed',
          payload_ref: { kind: 'content_draft', id: 'cd-1' },
          outcome_json: null,
          track_id: null,
          publish_target_id: null,
          attempt_no: 1,
          started_at: '2026-05-13T00:00:00Z',
          finished_at: '2026-05-13T00:00:00Z',
          created_at: '2026-05-13T00:00:00Z',
          updated_at: '2026-05-13T00:00:00Z',
        },
      ],
    });

    const result = await splitDraftStageRuns(sb as unknown as never, PROJECT_ID);

    expect(result).not.toBeNull();
    expect(result?.canonical.status).toBe('completed');
    expect(result?.production.status).toBe('completed');

    const inserted = sb.stage_runs.filter((r) => r.stage === 'canonical' || r.stage === 'production');
    expect(inserted).toHaveLength(2);
    const canonical = inserted.find((r) => r.stage === 'canonical');
    const production = inserted.find((r) => r.stage === 'production');
    expect(canonical?.status).toBe('completed');
    expect(canonical?.track_id).toBeNull();
    expect(production?.status).toBe('completed');
    expect(production?.track_id).toBe('tr-blog');
  });
});

describe('ensureTracksForProject → splitDraftStageRuns wiring', () => {
  it('runs splitDraftStageRuns on first call (no prior tracks) so canonical+production stage_runs appear', async () => {
    const sb = makeSb({
      projects: [{ id: PROJECT_ID, pipeline_state_json: null }],
      tracks: [],
      content_drafts: [
        {
          id: 'cd-1',
          project_id: PROJECT_ID,
          type: 'blog',
          canonical_core_json: { thesis: 'x' },
          draft_json: { body: '...' },
        },
      ],
      stage_runs: [
        {
          id: 'sr-draft',
          project_id: PROJECT_ID,
          stage: 'draft',
          status: 'completed',
          payload_ref: { kind: 'content_draft', id: 'cd-1' },
          outcome_json: null,
          track_id: null,
          publish_target_id: null,
          attempt_no: 1,
          started_at: '2026-05-13T00:00:00Z',
          finished_at: '2026-05-13T00:00:00Z',
          created_at: '2026-05-13T00:00:00Z',
          updated_at: '2026-05-13T00:00:00Z',
        },
      ],
    });

    await ensureTracksForProject(sb as unknown as never, PROJECT_ID);

    const stages = sb.stage_runs.map((r) => r.stage).sort();
    expect(stages).toEqual(['canonical', 'draft', 'production']);
  });

  it('does NOT call splitDraftStageRuns when track already exists (second call)', async () => {
    const sb = makeSb({
      projects: [{ id: PROJECT_ID, pipeline_state_json: null }],
      tracks: [
        {
          id: 'tr-blog',
          project_id: PROJECT_ID,
          medium: 'blog',
          status: 'active',
          paused: false,
          autopilot_config_json: null,
          created_at: '2026-05-13T00:00:00Z',
          updated_at: '2026-05-13T00:00:00Z',
        },
      ],
      content_drafts: [
        {
          id: 'cd-1',
          project_id: PROJECT_ID,
          type: 'blog',
          canonical_core_json: { thesis: 'x' },
          draft_json: { body: '...' },
        },
      ],
      stage_runs: [
        {
          id: 'sr-draft',
          project_id: PROJECT_ID,
          stage: 'draft',
          status: 'completed',
          payload_ref: { kind: 'content_draft', id: 'cd-1' },
          outcome_json: null,
          track_id: null,
          publish_target_id: null,
          attempt_no: 1,
          started_at: '2026-05-13T00:00:00Z',
          finished_at: '2026-05-13T00:00:00Z',
          created_at: '2026-05-13T00:00:00Z',
          updated_at: '2026-05-13T00:00:00Z',
        },
      ],
    });

    await ensureTracksForProject(sb as unknown as never, PROJECT_ID);

    expect(sb.stage_runs).toHaveLength(1);
    expect(sb.stage_runs[0].stage).toBe('draft');
  });
});

describe('splitDraftStageRuns — idempotency', () => {
  it('returns null and inserts nothing when canonical+production stage_runs already exist', async () => {
    const sb = makeSb({
      projects: [{ id: PROJECT_ID, pipeline_state_json: null }],
      tracks: [
        {
          id: 'tr-blog',
          project_id: PROJECT_ID,
          medium: 'blog',
          status: 'active',
          paused: false,
          autopilot_config_json: null,
          created_at: '2026-05-13T00:00:00Z',
          updated_at: '2026-05-13T00:00:00Z',
        },
      ],
      content_drafts: [
        {
          id: 'cd-1',
          project_id: PROJECT_ID,
          type: 'blog',
          canonical_core_json: { thesis: 'x' },
          draft_json: { body: '...' },
        },
      ],
      stage_runs: [
        {
          id: 'sr-draft',
          project_id: PROJECT_ID,
          stage: 'draft',
          status: 'completed',
          payload_ref: { kind: 'content_draft', id: 'cd-1' },
          outcome_json: null,
          track_id: null,
          publish_target_id: null,
          attempt_no: 1,
          started_at: '2026-05-13T00:00:00Z',
          finished_at: '2026-05-13T00:00:00Z',
          created_at: '2026-05-13T00:00:00Z',
          updated_at: '2026-05-13T00:00:00Z',
        },
        {
          id: 'sr-canonical',
          project_id: PROJECT_ID,
          stage: 'canonical',
          status: 'completed',
          payload_ref: { kind: 'content_draft', id: 'cd-1' },
          outcome_json: null,
          track_id: null,
          publish_target_id: null,
          attempt_no: 1,
          started_at: '2026-05-13T00:00:00Z',
          finished_at: '2026-05-13T00:00:00Z',
          created_at: '2026-05-13T00:00:00Z',
          updated_at: '2026-05-13T00:00:00Z',
        },
        {
          id: 'sr-production',
          project_id: PROJECT_ID,
          stage: 'production',
          status: 'completed',
          payload_ref: { kind: 'content_draft', id: 'cd-1' },
          outcome_json: null,
          track_id: 'tr-blog',
          publish_target_id: null,
          attempt_no: 1,
          started_at: '2026-05-13T00:00:00Z',
          finished_at: '2026-05-13T00:00:00Z',
          created_at: '2026-05-13T00:00:00Z',
          updated_at: '2026-05-13T00:00:00Z',
        },
      ],
    });

    const result = await splitDraftStageRuns(sb as unknown as never, PROJECT_ID);

    expect(result).toBeNull();
    expect(sb.stage_runs).toHaveLength(3);
  });
});

describe('ensureTracksForProject — tracer', () => {
  it('creates a single active blog track when project has no tracks and content_drafts.type is blog', async () => {
    const sb = makeSb({
      projects: [{ id: PROJECT_ID, pipeline_state_json: null }],
      tracks: [],
      content_drafts: [
        {
          id: 'cd-1',
          project_id: PROJECT_ID,
          type: 'blog',
          canonical_core_json: null,
          draft_json: null,
        },
      ],
    });

    const track = await ensureTracksForProject(sb as unknown as never, PROJECT_ID);

    expect(track).toMatchObject({
      projectId: PROJECT_ID,
      medium: 'blog',
      status: 'active',
      paused: false,
    });
    expect(sb.tracks).toHaveLength(1);
    expect(sb.tracks[0]).toMatchObject({
      project_id: PROJECT_ID,
      medium: 'blog',
      status: 'active',
    });
  });
});
