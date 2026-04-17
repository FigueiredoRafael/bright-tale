import { describe, it, expect, vi } from 'vitest'
import { SP2_PROBES } from '../probes/sp2.js'
import type { ProbeContext } from '../types.js'

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}

function ctx(supabase?: any): ProbeContext {
  return {
    fixture: {
      adminUserId: 'admin-1', affiliateOwnerUserId: 'owner-1', referredUserId: 'ref-1',
      affiliateId: 'aff-1', affiliateCode: 'SMKabc123', referralId: 'refl-1',
      organizationId: 'org-1', commissionId: 'comm-1', fraudFlagId: 'flag-1',
    },
    baselines: { pendingCommissionCountForAffiliate: 1 },
    apiUrl: 'http://localhost:3001',
    supabase: supabase ?? ({} as any),
    internalKey: 'K',
    stripeWebhookSecret: null,
  }
}

describe('SP2-1 list fraud flags filtered', () => {
  it('passes when bare array contains fixture fraud flag', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okJson({
      success: true, data: [{ id: 'flag-1', status: 'open' }],
    }))
    const out = await SP2_PROBES.find(p => p.id === 'SP2-1')!.run(ctx())
    expect(out.status).toBe('pass')
  })
})

describe('SP2-5 resolve fraud flag', () => {
  it('passes when HTTP 200 + DB shows status=resolved', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okJson({ success: true, data: {} }))
    const sb = {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: { status: 'resolved' }, error: null }) }) }),
      }),
    }
    const out = await SP2_PROBES.find(p => p.id === 'SP2-5')!.run(ctx(sb))
    expect(out.status).toBe('pass')
  })
})

describe('SP2-6 pause', () => {
  it('passes when HTTP 200 + DB shows status=paused', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okJson({ success: true, data: {} }))
    const sb = {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: { status: 'paused' }, error: null }) }) }),
      }),
    }
    const out = await SP2_PROBES.find(p => p.id === 'SP2-6')!.run(ctx(sb))
    expect(out.status).toBe('pass')
  })
})
