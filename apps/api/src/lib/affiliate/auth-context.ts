import type { FastifyRequest } from 'fastify'
import { ApiError } from '@/lib/api/errors'
import { createServiceClient } from '@/lib/supabase'

// Per-request memoization. Avoids hitting user_roles N times per request when
// the package's route handler invokes isAdmin from multiple places. WeakMap so
// request objects can be GC'd; no global type pollution.
const adminCache = new WeakMap<object, boolean>()

export async function getAuthenticatedUser(request: unknown): Promise<{ id: string }> {
  const req = request as FastifyRequest
  if (!req.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED')
  return { id: req.userId }
}

export async function isAdmin(request: unknown): Promise<boolean> {
  const req = request as FastifyRequest
  if (!req.userId) return false
  if (typeof request === 'object' && request !== null) {
    const cached = adminCache.get(request)
    if (cached !== undefined) return cached
  }
  const sb = createServiceClient()
  const { data } = await sb
    .from('user_roles')
    .select('role')
    .eq('user_id', req.userId)
    .eq('role', 'admin')
    .maybeSingle()
  const result = data?.role === 'admin'
  if (typeof request === 'object' && request !== null) {
    adminCache.set(request, result)
  }
  return result
}
