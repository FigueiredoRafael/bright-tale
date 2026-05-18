import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MANAGER_ROLES = new Set(['owner', 'admin', 'support', 'billing', 'readonly'])

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ data: null, error: { code, message } }, { status })
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  // Auth — must be a manager
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail(401, 'UNAUTHORIZED', 'Not authenticated')

  const sb = createAdminClient()
  const { data: mgr } = await sb
    .from('managers')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!mgr || !MANAGER_ROLES.has(mgr.role)) {
    return fail(403, 'FORBIDDEN', 'Manager access required')
  }

  const apiUrl = process.env.API_URL ?? 'http://localhost:3001'
  const internalKey = process.env.INTERNAL_API_KEY
  if (!internalKey) return fail(500, 'MISCONFIGURED', 'INTERNAL_API_KEY not set')

  const { id } = await context.params
  const upstream = await fetch(`${apiUrl}/ai-providers/${id}/sync-models`, {
    method: 'POST',
    headers: {
      'x-internal-key': internalKey,
      'x-user-id': user.id,
    },
  })

  const json = await upstream.json()
  return NextResponse.json(json, { status: upstream.status })
}
