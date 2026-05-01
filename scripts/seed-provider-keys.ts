#!/usr/bin/env tsx
/**
 * Seeds AI provider API keys from apps/api/.env.local into ai_provider_configs.
 * Keys are encrypted with AES-256-GCM before being stored.
 *
 * Run: npx tsx scripts/seed-provider-keys.ts
 *
 * Env loaded from: apps/api/.env.local
 *   GOOGLE_AI_KEY      → gemini
 *   OPENAI_API_KEY     → openai
 *   ANTHROPIC_API_KEY  → anthropic
 *   ENCRYPTION_SECRET  → used to encrypt keys before storing
 */

import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomBytes, createCipheriv } from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadEnv({ path: path.resolve(__dirname, '../apps/api/.env.local') })

// ── Inline encrypt (mirrors apps/api/src/lib/crypto.ts) ──────────────────
function encrypt(plaintext: string, aad: string): string {
  const secret = process.env.ENCRYPTION_SECRET
  if (!secret || secret.length !== 64) throw new Error('ENCRYPTION_SECRET must be a 64-char hex string')
  const key = Buffer.from(secret, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

// ── Supabase client ───────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/api/.env.local')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Provider → env var mapping ────────────────────────────────────────────
const KEY_MAP: Record<string, string | undefined> = {
  gemini:    process.env.GOOGLE_AI_KEY,
  openai:    process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
}

async function main() {
  // Fetch existing rows to get their IDs (needed for AAD)
  const { data: rows, error } = await sb
    .from('ai_provider_configs')
    .select('id, provider')

  if (error) { console.error('Fetch failed:', error.message); process.exit(1) }

  let updated = 0
  let skipped = 0

  for (const row of rows ?? []) {
    const plainKey = KEY_MAP[row.provider]

    if (!plainKey || plainKey.trim() === '') {
      console.log(`  ⚠  ${row.provider}: no key in .env.local — skipped`)
      skipped++
      continue
    }

    const aad = `ai_provider_configs:api_key:${row.id}:admin`
    const encryptedKey = encrypt(plainKey.trim(), aad)

    const { error: updateError } = await sb
      .from('ai_provider_configs')
      .update({ api_key: encryptedKey, is_active: true } as any)
      .eq('id', row.id)

    if (updateError) {
      console.error(`  ✗  ${row.provider}: ${updateError.message}`)
    } else {
      console.log(`  ✓  ${row.provider}: key encrypted and saved, provider activated`)
      updated++
    }
  }

  console.log(`\nDone — ${updated} updated, ${skipped} skipped.`)
}

main()
