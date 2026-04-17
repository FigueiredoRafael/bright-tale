import { smokeRequest } from '../http.js'
import type { Probe } from '../types.js'

export const SP1_PROBES: Probe[] = [
  {
    id: 'SP1-1',
    sp: 1,
    desc: 'GET /affiliate/me',
    async run(ctx) {
      const r = await smokeRequest({
        apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
        userId: ctx.fixture.affiliateOwnerUserId,
        method: 'GET', path: '/affiliate/me',
      })
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const b = r.body as any
      if (b?.success !== true) return { status: 'fail', detail: 'body.success !== true' }
      if (b.data?.code !== ctx.fixture.affiliateCode) {
        return { status: 'fail', detail: `code: expected ${ctx.fixture.affiliateCode}, got ${b.data?.code}` }
      }
      if (b.data?.tier !== 'nano') return { status: 'fail', detail: `tier: expected nano, got ${b.data?.tier}` }
      if (b.data?.status !== 'active') return { status: 'fail', detail: `status: expected active, got ${b.data?.status}` }
      return { status: 'pass' }
    },
  },
  {
    id: 'SP1-2',
    sp: 1,
    desc: 'GET /affiliate/me/commissions',
    async run(ctx) {
      const r = await smokeRequest({
        apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
        userId: ctx.fixture.affiliateOwnerUserId,
        method: 'GET', path: '/affiliate/me/commissions',
      })
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const b = r.body as any
      if (b?.success !== true) return { status: 'fail', detail: 'body.success !== true' }
      if (!Array.isArray(b.data)) return { status: 'fail', detail: 'data is not an array' }
      if (!b.data.some((c: any) => c.id === ctx.fixture.commissionId)) {
        return { status: 'fail', detail: `commission ${ctx.fixture.commissionId} not in list` }
      }
      return { status: 'pass' }
    },
  },
  {
    id: 'SP1-3',
    sp: 1,
    desc: 'GET /affiliate/referrals',
    async run(ctx) {
      const r = await smokeRequest({
        apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
        userId: ctx.fixture.affiliateOwnerUserId,
        method: 'GET', path: '/affiliate/referrals',
      })
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const b = r.body as any
      if (b?.success !== true) return { status: 'fail', detail: 'body.success !== true' }
      if (!Array.isArray(b.data)) return { status: 'fail', detail: 'data is not an array' }
      const mine = b.data.find((rr: any) => rr.id === ctx.fixture.referralId)
      if (!mine) return { status: 'fail', detail: `referral ${ctx.fixture.referralId} not in list` }
      if (mine.attributionStatus !== 'active') {
        return { status: 'fail', detail: `attributionStatus: expected active, got ${mine.attributionStatus}` }
      }
      return { status: 'pass' }
    },
  },
]
