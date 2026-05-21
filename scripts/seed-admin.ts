#!/usr/bin/env tsx
/**
 * Creates a local-dev admin manager account.
 *
 * Uses the Supabase auth admin API (service_role) to create the auth.users
 * row with a properly hashed password, then inserts the managers row.
 * Safe to re-run — idempotent on both email and managers.user_id.
 *
 * Reads env from: apps/web/.env.local
 *   NEXT_PUBLIC_SUPABASE_URL   — local Supabase URL (http://127.0.0.1:54321)
 *   SUPABASE_SERVICE_ROLE_KEY  — service role key (bypasses RLS)
 *
 * Usage:
 *   npx tsx scripts/seed-admin.ts
 *   npx tsx scripts/seed-admin.ts --email me@example.com --password secret123 --name "Rafael" --role owner
 */

import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadEnv({ path: path.resolve(__dirname, '../apps/web/.env.local') })

// ── CLI args ─────────────────────────────────────────────────────────────────
function arg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? (process.argv[idx + 1] ?? fallback) : fallback
}

const EMAIL       = arg('--email',    'admin@brighttale.local')
const PASSWORD    = arg('--password', 'Admin123!')
const DISPLAY     = arg('--name',     'Admin')
const ROLE        = arg('--role',     'owner')

const VALID_ROLES = new Set(['owner', 'admin', 'support', 'billing', 'readonly'])
if (!VALID_ROLES.has(ROLE)) {
  console.error(`Invalid role "${ROLE}". Must be one of: ${[...VALID_ROLES].join(', ')}`)
  process.exit(1)
}

// ── Supabase admin client ─────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nSeeding admin manager: ${EMAIL} (role: ${ROLE})\n`)

  // 1. Check if auth user already exists
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) {
    console.error('Failed to list users:', listErr.message)
    process.exit(1)
  }

  let userId: string
  const existing = listData.users.find(u => u.email === EMAIL)

  if (existing) {
    console.log(`  auth.users — already exists (${existing.id}), updating password...`)
    const { error: updateErr } = await supabase.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
    })
    if (updateErr) {
      console.error('  Failed to update password:', updateErr.message)
      process.exit(1)
    }
    console.log('  auth.users — password updated')
    userId = existing.id
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    })
    if (error) {
      console.error('  Failed to create user:', error.message)
      process.exit(1)
    }
    userId = data.user.id
    console.log(`  auth.users — created (${userId})`)
  }

  // 2. Upsert managers row
  const { error: mgrErr } = await supabase
    .from('managers')
    .upsert(
      {
        user_id:      userId,
        role:         ROLE,
        display_name: DISPLAY,
        title:        'Local Dev Admin',
        invited_by:   userId,
      },
      { onConflict: 'user_id' }
    )

  if (mgrErr) {
    console.error('  Failed to upsert managers row:', mgrErr.message)
    process.exit(1)
  }
  console.log('  managers    — upserted')

  console.log(`
Done! Log in at http://localhost:3002/zadmin/login
  Email:    ${EMAIL}
  Password: ${PASSWORD}

MFA: on first login you will be redirected to /zadmin/mfa to enroll TOTP
(only if you have an MFA factor enrolled in Supabase — local dev skips this).
`)
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
