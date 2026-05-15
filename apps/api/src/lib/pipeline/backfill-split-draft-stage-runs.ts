/**
 * T2.9 — one-shot backfill of legacy `stage='draft'` runs into
 * `canonical` + `production` pairs across every project that has any.
 *
 * Reuses the (tested) `splitDraftStageRuns` from T2.1. Idempotent: re-running
 * is a no-op because `splitDraftStageRuns` itself guards on existing splits.
 *
 * Does NOT delete the original `draft` rows — kept for audit. A separate
 * cleanup migration drops them in a later wave.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { splitDraftStageRuns } from './legacy-track-migrator';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

export interface BackfillFailure {
  projectId: string;
  error: string;
}

export interface BackfillSummary {
  scanned: number;
  split: number;
  alreadySplit: number;
  failures: BackfillFailure[];
}

export interface BackfillOptions {
  dryRun?: boolean;
}

export async function backfillSplitDraftStageRuns(
  sb: Sb,
  opts: BackfillOptions = {},
): Promise<BackfillSummary> {
  const { data: rows } = await sb
    .from('stage_runs')
    .select('project_id')
    .eq('stage', 'draft');

  const projectIds = Array.from(
    new Set(((rows as Array<{ project_id: string }> | null) ?? []).map((r) => r.project_id)),
  );

  let split = 0;
  let alreadySplit = 0;
  const failures: Array<{ projectId: string; error: string }> = [];
  for (const projectId of projectIds) {
    if (opts.dryRun) {
      const { data: existing } = await sb
        .from('stage_runs')
        .select('stage')
        .eq('project_id', projectId)
        .in('stage', ['canonical', 'production']);
      const stages = new Set(
        ((existing as Array<{ stage: string }> | null) ?? []).map((r) => r.stage),
      );
      if (stages.has('canonical') && stages.has('production')) alreadySplit += 1;
      else split += 1;
      continue;
    }
    try {
      const result = await splitDraftStageRuns(sb, projectId);
      if (result === null) alreadySplit += 1;
      else split += 1;
    } catch (err) {
      failures.push({ projectId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { scanned: projectIds.length, split, alreadySplit, failures };
}
