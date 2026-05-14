/**
 * T2.9 — one-shot backfill of legacy `stage='draft'` runs into canonical +
 * production pairs, across every project that has any.
 *
 * Usage:
 *   tsx scripts/backfill-split-draft-stage-runs.ts              # dry run (default)
 *   tsx scripts/backfill-split-draft-stage-runs.ts --apply      # actually write
 *
 * Idempotent: re-running on the same DB is a no-op. The legacy `draft` rows
 * are kept for audit; a later cleanup migration drops them.
 */
import { createClient } from '@supabase/supabase-js';
import { resolve as resolvePath } from 'node:path';
import { config as loadEnv } from 'dotenv';

import { backfillSplitDraftStageRuns } from '../apps/api/src/lib/pipeline/backfill-split-draft-stage-runs';

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

  console.log(`[backfill-split] apply=${APPLY}`);
  const summary = await backfillSplitDraftStageRuns(sb, { dryRun: !APPLY });
  console.log(
    `[backfill-split summary] scanned=${summary.scanned} split=${summary.split} alreadySplit=${summary.alreadySplit}`,
  );
}

main().catch((err) => {
  console.error('[backfill-split] unhandled:', err);
  process.exit(1);
});
