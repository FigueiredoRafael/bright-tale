import type { SupabaseClient } from '@supabase/supabase-js'

export interface HealthResult {
  status: 'pass' | 'fail'
  durationMs: number
  detail?: string
}

export async function probeApiHealth(apiUrl: string): Promise<HealthResult> {
  const start = Date.now()
  try {
    const res = await fetch(`${apiUrl}/health`, { method: 'GET' })
    const durationMs = Date.now() - start
    if (res.status !== 200) {
      return { status: 'fail', durationMs, detail: `expected 200, got ${res.status}` }
    }
    return { status: 'pass', durationMs }
  } catch (err) {
    return {
      status: 'fail',
      durationMs: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function probeSupabaseHealth(supabase: SupabaseClient): Promise<HealthResult> {
  const start = Date.now()
  try {
    const { error } = await supabase.auth.admin.listUsers({ perPage: 1 })
    const durationMs = Date.now() - start
    if (error) return { status: 'fail', durationMs, detail: error.message }
    return { status: 'pass', durationMs }
  } catch (err) {
    return {
      status: 'fail',
      durationMs: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}
