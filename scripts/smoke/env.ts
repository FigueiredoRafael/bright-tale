import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Env } from './types.js'

export function loadEnv(force: boolean): Env {
  const envPath = resolve(process.cwd(), 'apps/api/.env.local')
  let raw = ''
  try { raw = readFileSync(envPath, 'utf8') }
  catch { throw new Error(`cannot read ${envPath}; run from repo root`) }
  const map = parseDotenv(raw)
  const supabaseUrl = required(map, 'SUPABASE_URL')
  validateLocalSupabase(supabaseUrl, force)
  return {
    supabaseUrl,
    supabaseServiceRoleKey: required(map, 'SUPABASE_SERVICE_ROLE_KEY'),
    internalKey: required(map, 'INTERNAL_API_KEY'),
    stripeWebhookSecret: map['STRIPE_WEBHOOK_SECRET'] ?? null,
    apiUrl: map['API_URL'] ?? 'http://localhost:3001',
    refRateLimitMax: parseRefRateLimitMax(map['REF_RATE_LIMIT_MAX']),
  }
}

export function validateLocalSupabase(url: string, force: boolean): void {
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)
  if (!isLocal && !force) {
    throw new Error(
      `SUPABASE_URL is not localhost (${url}). Point apps/api/.env.local ` +
      `at local Supabase, or pass --force to bypass this interlock.`
    )
  }
}

export function parseRefRateLimitMax(raw: string | undefined): number {
  if (raw === undefined) return 30
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`REF_RATE_LIMIT_MAX must be a positive number, got "${raw}"`)
  }
  return n
}

function parseDotenv(src: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const line of src.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (!m) continue
    let v = m[2]
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    map[m[1]] = v
  }
  return map
}

function required(map: Record<string, string>, key: string): string {
  if (!map[key]) throw new Error(`missing ${key} in apps/api/.env.local`)
  return map[key]
}
