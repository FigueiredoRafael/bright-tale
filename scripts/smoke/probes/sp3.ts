import { smokeRequest } from '../http.js'
import type { Probe } from '../types.js'

export function buildSp3Probes(max: number): Probe[] {
  const IP_A = '198.51.100.1'
  const IP_B = '198.51.100.2'
  return [
    {
      id: 'SP3-1', sp: 3, timeoutMs: 20_000,
      desc: `/ref × ${max} (IP .1, within limit)`,
      async run(ctx) {
        for (let i = 0; i < max; i++) {
          const r = await smokeRequest({
            apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
            userId: null, forwardedFor: IP_A,
            method: 'GET', path: `/ref/${ctx.fixture.affiliateCode}`,
          })
          if (r.status !== 302) return { status: 'fail', detail: `req ${i+1}: expected 302, got ${r.status}` }
          const loc = r.headers['location'] ?? ''
          if (!loc.includes(ctx.fixture.affiliateCode)) {
            return { status: 'fail', detail: `req ${i+1}: Location missing code (${loc})` }
          }
        }
        return { status: 'pass' }
      },
    },
    {
      id: 'SP3-2', sp: 3,
      desc: `/ref ${max+1}th (IP .1) → 429 + headers`,
      async run(ctx) {
        const r = await smokeRequest({
          apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
          userId: null, forwardedFor: IP_A,
          method: 'GET', path: `/ref/${ctx.fixture.affiliateCode}`,
        })
        if (r.status !== 429) return { status: 'fail', detail: `expected 429, got ${r.status}` }
        const b = r.body as any
        if (b?.error?.code !== 'RATE_LIMITED') return { status: 'fail', detail: `body.error.code: ${b?.error?.code}` }
        if (r.headers['x-ratelimit-limit'] !== String(max)) {
          return { status: 'fail', detail: `x-ratelimit-limit: expected ${max}, got ${r.headers['x-ratelimit-limit']}` }
        }
        if (r.headers['x-ratelimit-remaining'] !== '0') {
          return { status: 'fail', detail: `x-ratelimit-remaining: expected 0, got ${r.headers['x-ratelimit-remaining']}` }
        }
        const retry = Number(r.headers['retry-after'])
        if (!Number.isFinite(retry) || retry <= 0) {
          return { status: 'fail', detail: `retry-after: expected positive int, got ${r.headers['retry-after']}` }
        }
        return { status: 'pass' }
      },
    },
    {
      id: 'SP3-3', sp: 3,
      desc: '/ref (IP .2) → 302 fresh bucket',
      async run(ctx) {
        const r = await smokeRequest({
          apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
          userId: null, forwardedFor: IP_B,
          method: 'GET', path: `/ref/${ctx.fixture.affiliateCode}`,
        })
        if (r.status !== 302) return { status: 'fail', detail: `expected 302, got ${r.status}` }
        return { status: 'pass' }
      },
    },
    {
      id: 'SP3-4', sp: 3,
      desc: '/affiliate/me after exhaustion (scope isolation)',
      async run(ctx) {
        const r = await smokeRequest({
          apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
          userId: ctx.fixture.affiliateOwnerUserId,
          method: 'GET', path: '/affiliate/me',
        })
        if (r.status !== 200) return { status: 'fail', detail: `expected 200, got ${r.status}` }
        return { status: 'pass' }
      },
    },
  ]
}
