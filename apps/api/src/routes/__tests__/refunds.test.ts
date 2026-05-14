/**
 * M-007 — Auto-refund route tests (Category A/B — no real DB or Stripe calls).
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
const mockRange = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockSelect = vi.fn()

function makeChain() {
  const chain: Record<string, unknown> = {}
  chain.select = mockSelect.mockReturnValue(chain)
  chain.eq = mockEq.mockReturnValue(chain)
  chain.is = mockIs.mockReturnValue(chain)
  chain.order = mockOrder.mockReturnValue(chain)
  chain.limit = mockLimit.mockReturnValue(chain)
  chain.range = mockRange.mockReturnValue(chain)
  chain.maybeSingle = mockMaybeSingle
  chain.single = mockSingle
  chain.insert = mockInsert
  chain.update = mockUpdate.mockReturnValue(chain)
  // Default then — resolves to empty
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null, count: 0 }).then(resolve)
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

/* ─── Stripe mock ─────────────────────────────────────────────────────────── */

const mockStripeInvoicesList = vi.fn()
const mockStripeRefundsCreate = vi.fn()
const mockStripeSubscriptionsCancel = vi.fn()

vi.mock('../../lib/billing/stripe.js', () => ({
  getStripe: () => ({
    invoices: { list: mockStripeInvoicesList },
    refunds: { create: mockStripeRefundsCreate },
    subscriptions: { cancel: mockStripeSubscriptionsCancel },
  }),
}))

vi.mock('../../lib/billing/plans.js', () => ({
  getPlan: (id: string) => ({
    id,
    displayName: id,
    credits: id === 'free' ? 1000 : 5000,
    usdMonthly: 0,
    usdAnnual: 0,
    features: [],
    stripePriceId: { monthly: null, annual: null },
  }),
}))

import { refundsRoutes } from '../refunds.js'

/* ─── Fixtures ────────────────────────────────────────────────────────────── */

const MEMBERSHIP = { org_id: 'org-1' }
const ORG = {
  id: 'org-1',
  plan: 'starter',
  credits_total: 5000,
  credits_used: 100,
  credits_addon: 0,
  stripe_subscription_id: 'sub_123',
  stripe_customer_id: 'cus_123',
  plan_started_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
  plan_expires_at: null,
}

const USER_PROFILE_NEW = { created_at: new Date().toISOString() }
const USER_PROFILE_OLD = { created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() }

const INVOICE = {
  id: 'inv_123',
  payment_intent: 'pi_123',
  amount_paid: 900,
  billing_reason: 'subscription_create',
}

const MANAGER_ROW = { role: 'admin', is_active: true }

/* ─── Tests ───────────────────────────────────────────────────────────────── */

describe('refunds routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    mockFrom.mockImplementation(() => makeChain())
    app = Fastify()
    await app.register(refundsRoutes)
    await app.ready()
  })

  describe('POST /billing/refund', () => {
    it('rejects if account < 24h old', async () => {
      // user_profiles → new account
      mockMaybeSingle.mockResolvedValueOnce({ data: USER_PROFILE_NEW, error: null })

      const res = await app.inject({ method: 'POST', url: '/billing/refund', payload: {} })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.error.code).toBe('REFUND_INELIGIBLE')
    })

    it('rejects if previous approved refund exists', async () => {
      mockMaybeSingle
        .mockResolvedValueOnce({ data: USER_PROFILE_OLD, error: null })   // user_profiles
        .mockResolvedValueOnce({ data: { id: 'old-refund' }, error: null }) // refund_audit

      const res = await app.inject({ method: 'POST', url: '/billing/refund', payload: {} })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.error.code).toBe('REFUND_INELIGIBLE')
    })

    it('rejects if credits used > 10%', async () => {
      mockMaybeSingle
        .mockResolvedValueOnce({ data: USER_PROFILE_OLD, error: null }) // user_profiles
        .mockResolvedValueOnce({ data: null, error: null })              // refund_audit (no prev)

      mockSingle
        .mockResolvedValueOnce({ data: MEMBERSHIP, error: null })
        .mockResolvedValueOnce({ data: { ...ORG, credits_used: 1000 }, error: null }) // 20% usage

      const res = await app.inject({ method: 'POST', url: '/billing/refund', payload: {} })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.error.code).toBe('REFUND_INELIGIBLE')
    })

    it('rejects if subscription > 7 days old', async () => {
      const oldSub = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()

      mockMaybeSingle
        .mockResolvedValueOnce({ data: USER_PROFILE_OLD, error: null })
        .mockResolvedValueOnce({ data: null, error: null })

      mockSingle
        .mockResolvedValueOnce({ data: MEMBERSHIP, error: null })
        .mockResolvedValueOnce({ data: { ...ORG, plan_started_at: oldSub }, error: null })

      const res = await app.inject({ method: 'POST', url: '/billing/refund', payload: {} })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.error.code).toBe('REFUND_INELIGIBLE')
    })

    it('issues refund when all checks pass', async () => {
      mockMaybeSingle
        .mockResolvedValueOnce({ data: USER_PROFILE_OLD, error: null }) // user_profiles
        .mockResolvedValueOnce({ data: null, error: null })              // refund_audit (no prev)

      mockSingle
        .mockResolvedValueOnce({ data: MEMBERSHIP, error: null }) // org_memberships
        .mockResolvedValueOnce({ data: ORG, error: null })         // organizations

      mockStripeInvoicesList.mockResolvedValueOnce({ data: [INVOICE] })
      mockStripeRefundsCreate.mockResolvedValueOnce({ amount: 900, currency: 'brl' })
      mockInsert.mockResolvedValueOnce({ error: null })
      mockStripeSubscriptionsCancel.mockResolvedValueOnce({ id: 'sub_123', status: 'canceled' })

      const res = await app.inject({ method: 'POST', url: '/billing/refund', payload: {} })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.error).toBeNull()
      expect(body.data.refunded).toBe(true)
      expect(body.data.amountCents).toBe(900)
      expect(body.data.currency).toBe('brl')
      expect(mockStripeSubscriptionsCancel).toHaveBeenCalledWith('sub_123')
    })
  })

  describe('GET /admin/refunds', () => {
    it('returns 403 if user is not a manager', async () => {
      // managers check: no row
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

      const res = await app.inject({ method: 'GET', url: '/admin/refunds' })

      expect(res.statusCode).toBe(403)
    })

    it('returns paginated refund list for managers', async () => {
      // managers check
      mockMaybeSingle.mockResolvedValueOnce({ data: MANAGER_ROW, error: null })

      const ROWS = [
        { id: 'r1', user_id: 'u1', decision: 'approved', amount_usd_cents: 900 },
        { id: 'r2', user_id: 'u2', decision: 'denied', amount_usd_cents: 0 },
      ]

      // 1st from() → assertManager (managers table): regular chain, maybeSingle returns MANAGER_ROW
      mockFrom.mockImplementationOnce(() => makeChain())
      // 2nd from() → refund_audit: overridden chain with count=2
      mockFrom.mockImplementationOnce(() => {
        const chain = makeChain()
        chain.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: ROWS, error: null, count: 2 }).then(resolve)
        return chain
      })

      const res = await app.inject({ method: 'GET', url: '/admin/refunds?page=1&limit=20' })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.error).toBeNull()
      expect(body.data.total).toBe(2)
      expect(body.data.items).toHaveLength(2)
      expect(body.data.page).toBe(1)
    })

    it('defaults to page=1 limit=20 when no query params', async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: MANAGER_ROW, error: null })

      // 1st from() → assertManager: regular chain
      mockFrom.mockImplementationOnce(() => makeChain())
      // 2nd from() → refund_audit: empty result
      mockFrom.mockImplementationOnce(() => {
        const chain = makeChain()
        chain.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null, count: 0 }).then(resolve)
        return chain
      })

      const res = await app.inject({ method: 'GET', url: '/admin/refunds' })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.page).toBe(1)
      expect(body.data.limit).toBe(20)
      expect(body.data.total).toBe(0)
    })
  })
})
