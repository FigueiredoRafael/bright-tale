import { describe, it, expect, vi } from 'vitest'
import { buildSp3Probes } from '../probes/sp3.js'
import type { ProbeContext } from '../types.js'

function ctx(): ProbeContext {
  return {
    fixture: {
      adminUserId: 'admin-1', affiliateOwnerUserId: 'owner-1', referredUserId: 'ref-1',
      affiliateId: 'aff-1', affiliateCode: 'SMKabc123', referralId: 'refl-1',
      organizationId: 'org-1', commissionId: 'comm-1', fraudFlagId: 'flag-1',
    },
    baselines: { pendingCommissionCountForAffiliate: 1 },
    apiUrl: 'http://localhost:3001',
    supabase: {} as any,
    internalKey: 'K',
    stripeWebhookSecret: null,
  }
}

describe('SP3-2 over-limit', () => {
  it('passes on 429 with RATE_LIMITED + headers', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: null, error: { code: 'RATE_LIMITED', message: 'Too many' } }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'x-ratelimit-limit': '30',
          'x-ratelimit-remaining': '0',
          'retry-after': '42',
        },
      },
    ))
    const probes = buildSp3Probes(30)
    const out = await probes.find(p => p.id === 'SP3-2')!.run(ctx())
    expect(out.status).toBe('pass')
  })

  it('fails when retry-after missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: null, error: { code: 'RATE_LIMITED' } }),
      { status: 429, headers: { 'content-type': 'application/json', 'x-ratelimit-limit': '30', 'x-ratelimit-remaining': '0' } },
    ))
    const probes = buildSp3Probes(30)
    const out = await probes.find(p => p.id === 'SP3-2')!.run(ctx())
    expect(out.status).toBe('fail')
    expect(out.detail).toMatch(/retry-after/i)
  })
})
