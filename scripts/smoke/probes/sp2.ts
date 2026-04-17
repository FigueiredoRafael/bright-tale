import { smokeRequest } from '../http.js'
import type { Probe } from '../types.js'

export const SP2_PROBES: Probe[] = [
  {
    id: 'SP2-1', sp: 2,
    desc: 'GET /admin/affiliate/fraud-flags?affiliateId=',
    async run(ctx) {
      const r = await smokeRequest({
        apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
        userId: ctx.fixture.adminUserId,
        method: 'GET',
        path: `/admin/affiliate/fraud-flags?affiliateId=${ctx.fixture.affiliateId}`,
      })
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const b = r.body as any
      if (b?.success !== true) return { status: 'fail', detail: 'success !== true' }
      const mine = Array.isArray(b.data) ? b.data : (b.data?.items ?? [])
      if (!mine.find((f: any) => f.id === ctx.fixture.fraudFlagId)) {
        return { status: 'fail', detail: `fraud flag ${ctx.fixture.fraudFlagId} not in list` }
      }
      return { status: 'pass' }
    },
  },
  {
    id: 'SP2-2', sp: 2,
    desc: 'GET /admin/affiliate/ overview',
    async run(ctx) {
      for (let page = 1; page <= 5; page++) {
        const r = await smokeRequest({
          apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
          userId: ctx.fixture.adminUserId,
          method: 'GET', path: `/admin/affiliate/?page=${page}`,
        })
        if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status} on page ${page}` }
        const b = r.body as any
        if (b?.success !== true) return { status: 'fail', detail: 'success !== true' }
        const items = Array.isArray(b.data) ? b.data : (b.data?.items ?? b.data?.affiliates ?? [])
        if (items.find((a: any) => a.id === ctx.fixture.affiliateId)) return { status: 'pass' }
        if (items.length === 0) break
      }
      return { status: 'fail', detail: `affiliate ${ctx.fixture.affiliateId} not found in first 5 pages` }
    },
  },
  {
    id: 'SP2-3', sp: 2,
    desc: 'GET /admin/affiliate/:id',
    async run(ctx) {
      const r = await smokeRequest({
        apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
        userId: ctx.fixture.adminUserId,
        method: 'GET', path: `/admin/affiliate/${ctx.fixture.affiliateId}`,
      })
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const b = r.body as any
      if (b?.success !== true) return { status: 'fail', detail: 'success !== true' }
      if (b.data?.id !== ctx.fixture.affiliateId) {
        return { status: 'fail', detail: `id mismatch: expected ${ctx.fixture.affiliateId}, got ${b.data?.id}` }
      }
      if (b.data?.status !== 'active') {
        return { status: 'fail', detail: `status: expected active, got ${b.data?.status}` }
      }
      return { status: 'pass' }
    },
  },
  {
    id: 'SP2-4', sp: 2,
    desc: 'GET /admin/affiliate/payouts',
    async run(ctx) {
      const r = await smokeRequest({
        apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
        userId: ctx.fixture.adminUserId,
        method: 'GET', path: '/admin/affiliate/payouts',
      })
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const b = r.body as any
      if (b?.success !== true) return { status: 'fail', detail: 'success !== true' }
      if (b.data === undefined) return { status: 'fail', detail: 'missing data field' }
      return { status: 'pass' }
    },
  },
  {
    id: 'SP2-5', sp: 2,
    desc: 'POST /admin/affiliate/fraud-flags/:id/resolve',
    async run(ctx) {
      const r = await smokeRequest({
        apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
        userId: ctx.fixture.adminUserId,
        method: 'POST',
        path: `/admin/affiliate/fraud-flags/${ctx.fixture.fraudFlagId}/resolve`,
        body: { status: 'false_positive', notes: 'smoke', pauseAffiliate: false },
      })
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const b = r.body as any
      if (b?.success !== true) return { status: 'fail', detail: 'success !== true' }
      const { data, error } = await ctx.supabase.from('affiliate_fraud_flags')
        .select('status').eq('id', ctx.fixture.fraudFlagId).single()
      if (error) return { status: 'fail', detail: `DB re-read: ${error.message}` }
      if (data?.status !== 'resolved') {
        return { status: 'fail', detail: `expected status=resolved, got ${data?.status}` }
      }
      return { status: 'pass' }
    },
  },
  {
    id: 'SP2-6', sp: 2,
    desc: 'POST /admin/affiliate/:id/pause',
    async run(ctx) {
      const r = await smokeRequest({
        apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
        userId: ctx.fixture.adminUserId,
        method: 'POST',
        path: `/admin/affiliate/${ctx.fixture.affiliateId}/pause`,
      })
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const b = r.body as any
      if (b?.success !== true) return { status: 'fail', detail: 'success !== true' }
      const { data, error } = await ctx.supabase.from('affiliates')
        .select('status').eq('id', ctx.fixture.affiliateId).single()
      if (error) return { status: 'fail', detail: `DB re-read: ${error.message}` }
      if (data?.status !== 'paused') {
        return { status: 'fail', detail: `expected status=paused, got ${data?.status}` }
      }
      return { status: 'pass' }
    },
  },
]
