import { describe, it, expect } from 'vitest'

// TODO-test: Category C — runs against Supabase dev manually.
// Per CLAUDE.md, Category C tests are skipped in CI.
//
// Manual smoke per spec/plan §7 + 12-item checklist replaces this for now.
// See docs/superpowers/plans/2026-04-17-affiliate-2a-foundation.md Task 5.5.
describe.skip('affiliate end-to-end flow', () => {
  it('apply → admin approve → track click → attribute → calculate commission → payout', async () => {
    // Manual smoke checklist:
    // 1.  POST /api/affiliate/apply (user A) → 201, payload tem id + code
    // 2.  Email Resend recebido em AFFILIATE_ADMIN_EMAIL (if Resend set)
    // 3.  Email confirmação recebido em A (if Resend set)
    // 4.  POST /api/admin/affiliate/:id/approve (admin) → status 'approved'
    // 5.  Email aprovação recebido em A (if Resend set)
    // 6.  GET /api/affiliate/me (user A) → status approved, tier nano
    // 7.  GET /api/ref/{A.code} (anon) → 302 redirect; affiliate_clicks +1,
    //     affiliates.total_clicks +1
    // 8.  attributeUseCase.execute(code, userId, today, options?) →
    //     cria affiliate_referrals attribution_status pending_contract|active
    // 9.  POST /billing/webhook (invoice.paid) → __fireAffiliateCommissionHook → calcCommissionUseCase.execute({...}) → cria affiliate_commissions
    // 10. POST /api/affiliate/payouts (user A com R$50+ pending) → cria payout pending
    // 11. POST /api/admin/affiliate/:id/payouts/:payoutId/approve (admin)
    // 12. POST /api/internal/affiliate/expire-pending → expira referrals
    //     com window_end < now AND attribution_status='pending_contract'
    expect(true).toBe(true)
  })
})
