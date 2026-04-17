import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { seed, cleanup, captureBaselines, makeRunId } from '../fixture.js'

const envPath = resolve(process.cwd(), 'apps/api/.env.local')
let envRaw = ''
try { envRaw = readFileSync(envPath, 'utf8') } catch { /* ignore */ }
const map: Record<string, string> = {}
for (const line of envRaw.split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (m) map[m[1]] = m[2].replace(/^"|"$/g, '')
}
const SUPABASE_URL = map.SUPABASE_URL ?? ''
const SERVICE_KEY = map.SUPABASE_SERVICE_ROLE_KEY ?? ''
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(SUPABASE_URL)

describe.skipIf(!isLocal || !SERVICE_KEY)('fixture (integration)', () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  })

  it('seed creates all rows, cleanup removes them', async () => {
    const runId = makeRunId()
    const handles = await seed(supabase, runId)
    expect(handles.affiliateCode).toBe(`SMK${runId}`)

    const baselines = await captureBaselines(supabase, handles)
    expect(baselines.pendingCommissionCountForAffiliate).toBe(1)

    const result = await cleanup(supabase, handles)
    expect(result.failures).toEqual([])
    expect(result.rowsRemoved).toBeGreaterThanOrEqual(10)
  }, 30_000)

  it('cleanup is idempotent on partial handles', async () => {
    const runId = makeRunId()
    const handles = await seed(supabase, runId)
    const first = await cleanup(supabase, handles)
    expect(first.failures).toEqual([])
    const second = await cleanup(supabase, handles)
    expect(second.failures).toEqual([])
  }, 30_000)
})
