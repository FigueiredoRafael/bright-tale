/**
 * Slice 13 (#21) — one-shot backfill from pipeline_state_json → stage_runs.
 *
 * Usage:
 *   tsx scripts/backfill-stage-runs.ts              # dry run (default)
 *   tsx scripts/backfill-stage-runs.ts --apply      # actually write
 *
 * Idempotent: skips any project where `migrated_to_stage_runs_at IS NOT NULL`.
 *
 * Quarantines (and SKIPS) projects whose pipeline_state_json is structurally
 * invalid: missing fields, drift between projects.current_stage and
 * pipeline_state_json.currentStage, or orphaned idea/research IDs.
 */
import { createClient } from '@supabase/supabase-js';
import { resolve as resolvePath } from 'node:path';
import { config as loadEnv } from 'dotenv';

import {
  planProjectBackfill,
  type ProjectRow,
  type PayloadIndex,
  type BackfillPlan,
} from './lib/backfill-stage-runs-plan.js';

loadEnv({ path: resolvePath(__dirname, '..', 'apps', 'api', '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in apps/api/.env.local');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  const sb = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: projects, error } = await sb
    .from('projects')
    .select('*')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .is('migrated_to_stage_runs_at' as any, null)
    .not('pipeline_state_json', 'is', null);
  if (error) {
    console.error('Failed to load projects:', error);
    process.exit(1);
  }

  console.log(`[backfill] candidates: ${projects?.length ?? 0} (apply=${APPLY})`);

  let migrated = 0;
  let quarantined = 0;
  let skipped = 0;

  for (const row of (projects ?? []) as ProjectRow[]) {
    const index = await loadPayloadIndex(sb, row.id);
    const plan = planProjectBackfill(row, index);

    if (plan.kind === 'quarantine') {
      quarantined++;
      console.log(`[quarantine] ${row.id} — ${plan.reason}`);
      continue;
    }
    if (plan.kind === 'skip') {
      skipped++;
      console.log(`[skip] ${row.id} — ${plan.reason}`);
      continue;
    }

    if (!APPLY) {
      console.log(
        `[dry-run] ${row.id} → ${plan.stageRuns.length} stage_runs, mode=${plan.mode}, paused=${plan.paused}`,
      );
      migrated++;
      continue;
    }

    await applyPlan(sb, row.id, plan);
    migrated++;
    console.log(`[migrated] ${row.id} → ${plan.stageRuns.length} stage_runs`);
  }

  console.log(`\n[backfill summary] migrated=${migrated} quarantined=${quarantined} skipped=${skipped}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbClient = any;

async function loadPayloadIndex(sb: SbClient, projectId: string): Promise<PayloadIndex> {
  const [brainstorm, research, draft] = await Promise.all([
    sb
      .from('brainstorm_drafts')
      .select('id, session_id, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from('research_sessions')
      .select('id, status, created_at, completed_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from('content_drafts')
      .select('id, status, created_at, updated_at, published_url')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    brainstorm: brainstorm.data ?? null,
    research: research.data ?? null,
    draft: draft.data ?? null,
  };
}

async function applyPlan(sb: SbClient, projectId: string, plan: BackfillPlan): Promise<void> {
  if (plan.kind !== 'apply') return;

  for (const sr of plan.stageRuns) {
    await sb.from('stage_runs').insert(sr);
  }
  await sb
    .from('projects')
    .update({
      mode: plan.mode,
      paused: plan.paused,
      migrated_to_stage_runs_at: new Date().toISOString(),
    })
    .eq('id', projectId);
}

main().catch((err) => {
  console.error('[backfill] unhandled:', err);
  process.exit(1);
});
