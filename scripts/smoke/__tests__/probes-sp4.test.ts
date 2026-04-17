import { describe, it, expect } from 'vitest'
import { SP4_PROBES } from '../probes/sp4.js'
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

describe('SP4 skip when no secret', () => {
  it('all 3 SP4 probes skip when stripeWebhookSecret is null', async () => {
    const c = ctx()
    for (const probe of SP4_PROBES) {
      const out = await probe.run(c)
      expect(out.status).toBe('skip')
      expect(out.detail).toContain('STRIPE_WEBHOOK_SECRET')
    }
  })
})
