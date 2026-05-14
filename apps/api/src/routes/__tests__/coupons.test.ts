/**
 * M-014 — Coupon redeem route tests (Category A/B — no real DB calls).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

/* ─── Supabase mock ────────────────────────────────────────────────────────── */

const mockMaybeSingle = vi.fn()
const mockSingle = vi.fn()
const mockEq = vi.fn()
const mockIs = vi.fn()
const mockOrder = vi.fn()
const mockLimit = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockSelect = vi.fn()

// Build the mock chain. eq returns a thenable so it can be chained AND awaited.
function makeChain() {
  const chain: Record<string, unknown> = {}
  chain.select = mockSelect.mockReturnValue(chain)
  chain.eq = mockEq.mockReturnValue(chain)
  chain.is = mockIs.mockReturnValue(chain)
  chain.order = mockOrder.mockReturnValue(chain)
  chain.limit = mockLimit.mockReturnValue(chain)
  chain.maybeSingle = mockMaybeSingle
  chain.single = mockSingle
  chain.insert = mockInsert
  chain.update = mockUpdate.mockReturnValue(chain)
  // Default then — so plain await on chain resolves to { data: null, error: null, count: null }
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null, count: null }).then(resolve)
  return chain
}

const mockFrom = vi.fn(() => makeChain())

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}))

/* ─── Auth middleware mock ───────────────────────────────────────────────── */

vi.mock('../../middleware/authenticate.js', () => ({
  authenticate: (_req: unknown, _rep: unknown, done: () => void) => done(),
  authenticateWithUser: (req: { userId?: string }, _rep: unknown, done: () => void) => {
    req.userId = 'user-test-id'
    done()
  },
}))

import { couponsRoutes } from '../coupons.js'

/* ─── Fixtures ────────────────────────────────────────────────────────────── */

const VALID_COUPON = {
  id: 'coupon-1',
  code: 'TESTCODE',
  kind: 'credit_grant',
  credits_amount: 500,
  max_uses_total: null,
  max_uses_per_user: 1,
  valid_from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  valid_until: null,
  allowed_plan_ids: null,
  created_by: 'admin-user',
  created_at: new Date().toISOString(),
  archived_at: null,
}

const MEMBERSHIP = { org_id: 'org-1' }
const ORG = { id: 'org-1', plan: 'starter', credits_addon: 0 }

/* ─── Tests ───────────────────────────────────────────────────────────────── */

describe('coupons routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    // Re-setup the mock chain after clearAllMocks
    mockFrom.mockImplementation(() => makeChain())
    app = Fastify()
    await app.register(couponsRoutes, { prefix: '/coupons' })
    await app.ready()
  })

  describe('POST /coupons/redeem', () => {
    it('returns 400 COUPON_INVALID when coupon not found', async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

      const res = await app.inject({
        method: 'POST',
        url: '/coupons/redeem',
        payload: { code: 'INVALID' },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.error.code).toBe('COUPON_INVALID')
    })

    it('returns 400 COUPON_EXPIRED when past valid_until', async () => {
      const expiredCoupon = {
        ...VALID_COUPON,
        valid_until: new Date(Date.now() - 1000).toISOString(),
      }
      mockMaybeSingle.mockResolvedValueOnce({ data: expiredCoupon, error: null })

      const res = await app.inject({
        method: 'POST',
        url: '/coupons/redeem',
        payload: { code: 'TESTCODE' },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.error.code).toBe('COUPON_EXPIRED')
    })

    it('returns 400 COUPON_EXPIRED when before valid_from', async () => {
      const futureCoupon = {
        ...VALID_COUPON,
        valid_from: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }
      mockMaybeSingle.mockResolvedValueOnce({ data: futureCoupon, error: null })

      const res = await app.inject({
        method: 'POST',
        url: '/coupons/redeem',
        payload: { code: 'TESTCODE' },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.error.code).toBe('COUPON_EXPIRED')
    })

    it('grants credits and records redemption on success', async () => {
      // coupon lookup
      mockMaybeSingle.mockResolvedValueOnce({ data: VALID_COUPON, error: null })

      // Per-user count: override the chain's then to return count=0 for this call
      mockFrom.mockImplementationOnce(() => {
        const chain = makeChain()
        // Override `then` so the count query resolves to { count: 0 }
        chain.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null, count: 0 }).then(resolve)
        return chain
      })

      // getOrgForUser: membership + org (x2 since called in plan check + credits)
      mockSingle
        .mockResolvedValueOnce({ data: MEMBERSHIP, error: null })
        .mockResolvedValueOnce({ data: ORG, error: null })
        .mockResolvedValueOnce({ data: MEMBERSHIP, error: null })
        .mockResolvedValueOnce({ data: ORG, error: null })

      // org update: .update().eq() returns the chain; await chain = undefined (no error check needed)

      // coupon_redemptions insert
      mockInsert.mockResolvedValueOnce({ error: null })

      const res = await app.inject({
        method: 'POST',
        url: '/coupons/redeem',
        payload: { code: 'testcode' }, // lowercase — should be normalized to uppercase
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.error).toBeNull()
      expect(body.data.creditsGranted).toBe(500)
      expect(body.data.message).toContain('500')
    })

    it('rejects if code field is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/coupons/redeem',
        payload: {},
      })

      expect(res.statusCode).toBe(400)
    })

    it('rejects plan-restricted coupon for wrong plan', async () => {
      const restrictedCoupon = {
        ...VALID_COUPON,
        allowed_plan_ids: ['pro', 'creator'],
      }
      // coupon lookup
      mockMaybeSingle.mockResolvedValueOnce({ data: restrictedCoupon, error: null })

      // Per-user count: 0
      mockFrom.mockImplementationOnce(() => {
        const chain = makeChain()
        chain.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null, count: 0 }).then(resolve)
        return chain
      })

      // User is on 'starter' plan
      mockSingle
        .mockResolvedValueOnce({ data: MEMBERSHIP, error: null })
        .mockResolvedValueOnce({ data: { ...ORG, plan: 'starter' }, error: null })

      const res = await app.inject({
        method: 'POST',
        url: '/coupons/redeem',
        payload: { code: 'TESTCODE' },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.error.code).toBe('COUPON_INVALID')
    })
  })
})
