#!/usr/bin/env npx tsx
/**
 * Dump the persisted pipeline_state_json for a project, focused on the
 * stage results that drive the publish payload.
 *
 *   cd apps/api && npx tsx ../../scripts/pipeline-state-dump.ts <projectId>
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import path from "path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const projectId = process.argv[2];
if (!projectId) {
  console.error("Usage: pipeline-state-dump.ts <projectId>");
  process.exit(1);
}

async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await sb
    .from("projects")
    .select("id, pipeline_state_json, channel_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    console.error("Project not found");
    process.exit(1);
  }
  console.log("=== project ===");
  console.log("id:", data.id);
  console.log("channel_id:", data.channel_id);

  const state = data.pipeline_state_json as Record<string, unknown> | null;
  if (!state) {
    console.log("\npipeline_state_json is NULL");
    return;
  }

  const ctx = (state as { context?: Record<string, unknown> }).context ?? state;
  console.log("\n=== context.stageResults.draft ===");
  const stageResults = (ctx.stageResults as Record<string, unknown>) ?? {};
  console.log(JSON.stringify(stageResults.draft, null, 2));
  console.log("\n=== context.stageResults.brainstorm.personaWpAuthorId ===");
  console.log(JSON.stringify(stageResults.brainstorm, null, 2));
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
