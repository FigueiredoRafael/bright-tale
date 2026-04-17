import { describe, it, expect, vi } from 'vitest'
import { SP1_PROBES } from '../probes/sp1.js'
import type { ProbeContext } from '../types.js'

function makeCtx(overrides: Partial<ProbeContext> = {}): ProbeContext {
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
    ...overrides,
  }
}

describe('SP1-1 GET /affiliate/me', () => {
  it('passes when body.success is true + code/tier match', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: { code: 'SMKabc123', tier: 'nano', status: 'active' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    const probe = SP1_PROBES.find(p => p.id === 'SP1-1')!
    const out = await probe.run(makeCtx())
    expect(out.status).toBe('pass')
  })

  it('fails when code mismatches', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: { code: 'OTHER', tier: 'nano', status: 'active' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    const probe = SP1_PROBES.find(p => p.id === 'SP1-1')!
    const out = await probe.run(makeCtx())
    expect(out.status).toBe('fail')
    expect(out.detail).toContain('code')
  })
})

describe('SP1-2 GET /affiliate/me/commissions', () => {
  it('passes when bare array contains fixture.commissionId', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: [{ id: 'comm-1', totalBrl: 1420 }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    const probe = SP1_PROBES.find(p => p.id === 'SP1-2')!
    const out = await probe.run(makeCtx())
    expect(out.status).toBe('pass')
  })
})

describe('SP1-3 GET /affiliate/referrals', () => {
  it('passes when bare array contains referralId with attributionStatus=active', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: [{ id: 'refl-1', attributionStatus: 'active' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    const probe = SP1_PROBES.find(p => p.id === 'SP1-3')!
    const out = await probe.run(makeCtx())
    expect(out.status).toBe('pass')
  })
})
