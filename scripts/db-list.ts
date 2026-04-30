#!/usr/bin/env tsx
/**
 * List and search projects in the remote DB.
 *
 * Usage (from repo root):
 *   npx tsx scripts/db-list.ts                      — last 20 projects
 *   npx tsx scripts/db-list.ts --search "title"     — filter by title
 *   npx tsx scripts/db-list.ts --user <userId>      — filter by user
 *   npx tsx scripts/db-list.ts --channel <id>       — filter by channel
 *   npx tsx scripts/db-list.ts --stage assets       — filter by current_stage
 *   npm run db:list                                  — shorthand
 *
 * Env loaded from: apps/api/.env.local
 */

import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadEnv({ path: path.resolve(__dirname, '../apps/api/.env.local') })

function parseArgs() {
  const args = process.argv.slice(2)
  const opts: { search?: string; user?: string; channel?: string; stage?: string; limit: number } = { limit: 20 }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--search' && args[i + 1]) opts.search = args[++i]
    else if (args[i] === '--user' && args[i + 1]) opts.user = args[++i]
    else if (args[i] === '--channel' && args[i + 1]) opts.channel = args[++i]
    else if (args[i] === '--stage' && args[i + 1]) opts.stage = args[++i]
    else if (args[i] === '--limit' && args[i + 1]) opts.limit = parseInt(args[++i], 10)
    else if (!args[i].startsWith('--')) opts.search = args[i]
  }
  return opts
}

async function main() {
  const opts = parseArgs()
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let query = sb
    .from('projects')
    .select('id, title, current_stage, channel_id, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(opts.limit)

  if (opts.search) query = query.ilike('title', `%${opts.search}%`)
  if (opts.channel) query = query.eq('channel_id', opts.channel)
  if (opts.stage) query = query.eq('current_stage', opts.stage)

  const { data: projects, error } = await query
  if (error) throw error

  if (!projects || projects.length === 0) {
    console.log('No projects found.')
    return
  }

  console.log(`\n  ${'ID'.padEnd(38)} ${'STAGE'.padEnd(14)} ${'UPDATED'.padEnd(20)} TITLE`)
  console.log('  ' + '─'.repeat(100))
  for (const p of projects) {
    const updated = p.updated_at ? p.updated_at.slice(0, 16).replace('T', ' ') : '-'
    const title = (p.title ?? '(no title)').slice(0, 40)
    console.log(`  ${p.id.padEnd(38)} ${(p.current_stage ?? '-').padEnd(14)} ${updated.padEnd(20)} ${title}`)
  }
  console.log(`\n  ${projects.length} project(s)`)

  if (opts.search || opts.stage || opts.channel) {
    const parts = []
    if (opts.search) parts.push(`title contains "${opts.search}"`)
    if (opts.stage) parts.push(`stage = "${opts.stage}"`)
    if (opts.channel) parts.push(`channel = "${opts.channel}"`)
    console.log(`  Filter: ${parts.join(' + ')}`)
  }
  console.log('')
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
