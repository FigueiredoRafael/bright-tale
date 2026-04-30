#!/usr/bin/env tsx
/**
 * Comprehensive project inspector — shows pipeline state, stages, assets,
 * drafts, review iterations, and recent AI usage logs for a project.
 *
 * Usage (from repo root):
 *   npx tsx scripts/db-inspect.ts <projectId>
 *   npm run db:inspect -- <projectId>
 *
 * Env loaded from: apps/api/.env.local (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 */

import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadEnv({ path: path.resolve(__dirname, '../apps/api/.env.local') })

const projectId = process.argv[2]
if (!projectId) {
  console.error('Usage: db-inspect.ts <projectId>')
  process.exit(1)
}

function section(title: string) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(60))
}

function kv(label: string, value: unknown) {
  const display = value === null || value === undefined ? '(null)' : String(value)
  console.log(`  ${label.padEnd(24)} ${display}`)
}

async function main() {
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // ── Project ───────────────────────────────────────────────────
  const { data: project, error: pErr } = await sb
    .from('projects')
    .select('id, title, current_stage, pipeline_state_json, channel_id, created_at, updated_at')
    .eq('id', projectId)
    .maybeSingle()
  if (pErr) throw pErr
  if (!project) {
    console.error(`Project not found: ${projectId}`)
    process.exit(1)
  }

  section('PROJECT')
  kv('id', project.id)
  kv('title', project.title)
  kv('current_stage', project.current_stage)
  kv('channel_id', project.channel_id)
  kv('created_at', project.created_at)
  kv('updated_at', project.updated_at)

  // ── Pipeline state machine ────────────────────────────────────
  const state = project.pipeline_state_json as Record<string, unknown> | null
  if (!state) {
    console.log('\n  pipeline_state_json: NULL')
  } else {
    section('PIPELINE STATE')
    const ctx = (state.context ?? state) as Record<string, unknown>
    kv('machine value', JSON.stringify(state.value ?? ctx.value ?? '?'))
    kv('mode', String(ctx.mode ?? state.mode ?? '?'))
    kv('paused', String(ctx.paused ?? state.paused ?? '?'))
    kv('currentStage', String(ctx.currentStage ?? state.currentStage ?? '?'))

    const sr = (ctx.stageResults ?? state.stageResults) as Record<string, unknown> | undefined
    if (sr) {
      console.log('\n  stageResults:')
      for (const [stage, result] of Object.entries(sr)) {
        if (result == null) {
          console.log(`    ${stage}: (null)`)
        } else if (typeof result === 'object') {
          const keys = Object.keys(result as object)
          const hasAssetIds = 'assetIds' in (result as object)
          const assetCount = hasAssetIds ? ((result as { assetIds: unknown[] }).assetIds?.length ?? 0) : null
          let summary = `{ ${keys.join(', ')} }`
          if (stage === 'assets' && !hasAssetIds) summary += ' ← partial (no assetIds)'
          if (stage === 'assets' && hasAssetIds) summary += ` ← complete (${assetCount} assets)`
          console.log(`    ${stage}: ${summary}`)
        } else {
          console.log(`    ${stage}: ${result}`)
        }
      }
    }
  }

  // ── Stages ────────────────────────────────────────────────────
  const { data: stages, error: stErr } = await sb
    .from('stages')
    .select('id, stage_type, status, created_at, updated_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  if (!stErr && stages && stages.length > 0) {
    section('STAGES')
    for (const s of stages) {
      console.log(`  ${s.stage_type.padEnd(14)} ${s.status.padEnd(12)} ${s.id}  ${s.updated_at}`)
    }
  }

  // ── Assets ────────────────────────────────────────────────────
  const { data: assets, error: aErr } = await sb
    .from('assets')
    .select('id, asset_type, source, role, content_type, webp_url, source_url, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (!aErr && assets) {
    section(`ASSETS (${assets.length})`)
    if (assets.length === 0) {
      console.log('  (none)')
    } else {
      for (const a of assets) {
        console.log(`  [${a.asset_type}] ${a.role ?? '-'} / ${a.content_type ?? '-'}  ${a.source}  ${a.id}`)
        console.log(`    url: ${a.webp_url ?? a.source_url ?? '(no url)'}`)
      }
    }
  }

  // ── Blog drafts ───────────────────────────────────────────────
  const { data: drafts, error: dErr } = await sb
    .from('blog_drafts')
    .select('id, status, title, word_count, created_at, updated_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(5)
  if (!dErr && drafts) {
    section(`BLOG DRAFTS (last ${drafts.length})`)
    if (drafts.length === 0) {
      console.log('  (none)')
    } else {
      for (const d of drafts) {
        console.log(`  [${d.status}] ${d.title ?? '(no title)'}  words:${d.word_count ?? '?'}`)
        console.log(`    id: ${d.id}  updated: ${d.updated_at}`)
      }
    }
  }

  // ── Review iterations ─────────────────────────────────────────
  const { data: reviews, error: rErr } = await sb
    .from('review_iterations')
    .select('id, iteration, overall_score, status, created_at')
    .eq('project_id', projectId)
    .order('iteration', { ascending: false })
    .limit(5)
  if (!rErr && reviews && reviews.length > 0) {
    section(`REVIEW ITERATIONS (last ${reviews.length})`)
    for (const r of reviews) {
      console.log(`  iter ${r.iteration}  score:${r.overall_score ?? '?'}  [${r.status}]  ${r.created_at}`)
    }
  }

  // ── AI usage logs ─────────────────────────────────────────────
  const { data: logs, error: lErr } = await sb
    .from('engine_logs')
    .select('id, stage, action, status, created_at, error_message')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (!lErr && logs && logs.length > 0) {
    section(`ENGINE LOGS (last ${logs.length})`)
    for (const l of logs) {
      const err = l.error_message ? `  ✗ ${l.error_message}` : ''
      console.log(`  ${l.created_at}  [${l.stage ?? '-'}] ${l.action ?? '-'}  ${l.status}${err}`)
    }
  }

  console.log('')
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
