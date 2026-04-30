#!/usr/bin/env npx tsx
/**
 * Dump current draft state + canonical core + recent draft sessions for a project.
 *
 *   cd apps/api && npx tsx ../../scripts/draft-state-dump.ts <projectId>
 */

import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import path from 'path'

loadEnv({ path: path.resolve(process.cwd(), '.env.local') })

const projectId = process.argv[2]
if (!projectId) {
  console.error('Usage: draft-state-dump.ts <projectId>')
  process.exit(1)
}

async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: project, error: pErr } = await sb
    .from('projects')
    .select('id, title, current_stage, pipeline_state_json, channel_id, updated_at')
    .eq('id', projectId)
    .maybeSingle()
  if (pErr) throw pErr
  if (!project) { console.error('Project not found'); process.exit(1) }

  console.log('=== project ===')
  console.log('id:', project.id)
  console.log('title:', project.title)
  console.log('current_stage:', project.current_stage)
  console.log('channel_id:', project.channel_id)
  console.log('updated_at:', project.updated_at)

  const state = project.pipeline_state_json as Record<string, unknown> | null
  if (state) {
    console.log('\n=== pipeline_state_json (top-level keys) ===')
    console.log(Object.keys(state).join(', '))
    const sr = (state.stageResults ?? state.stage_results) as Record<string, unknown> | undefined
    if (sr) {
      console.log('\nstageResults keys:', Object.keys(sr).join(', '))
      if (sr.draft) console.log('draft stageResult:', JSON.stringify(sr.draft, null, 2))
    }
    if (state.currentStage) console.log('\ncurrentStage (machine):', state.currentStage)
    if (state.mode) console.log('mode:', state.mode)
    if (state.paused !== undefined) console.log('paused:', state.paused)
  }

  const { data: drafts, error: dErr } = await sb
    .from('blog_drafts')
    .select('id, status, title, full_draft, outline_json, word_count, created_at, updated_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(5)
  if (dErr) throw dErr

  console.log('\n=== blog_drafts (last 5) ===')
  if (!drafts || drafts.length === 0) {
    console.log('(none)')
  } else {
    for (const d of drafts) {
      console.log(`\n--- ${d.id} ---`)
      console.log('status:', d.status)
      console.log('title:', d.title)
      console.log('word_count:', d.word_count)
      console.log('outline_json:', d.outline_json ? `present (${(d.outline_json as string).length} chars)` : 'NULL')
      console.log('full_draft:', d.full_draft ? `present (${d.full_draft.length} chars)` : 'EMPTY')
      console.log('created_at:', d.created_at)
      console.log('updated_at:', d.updated_at)
    }
  }

  // Also check ai_jobs / inngest events if available
  const { data: jobs, error: jErr } = await sb
    .from('ai_usage_logs')
    .select('id, agent, provider, model, status, created_at, error_message')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (!jErr && jobs && jobs.length > 0) {
    console.log('\n=== ai_usage_logs (last 10) ===')
    for (const j of jobs) {
      console.log(`${j.created_at} ${j.agent ?? '?'} ${j.provider}/${j.model} ${j.status} ${j.error_message ? '· ' + j.error_message : ''}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
