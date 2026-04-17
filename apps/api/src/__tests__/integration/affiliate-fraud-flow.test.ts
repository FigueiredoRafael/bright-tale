import { describe, it } from 'vitest';

// TODO-test: Category C — requires local Supabase + MailHog + seeded affiliate.
// Ships as a documentation stub of the assertions we want once 2F wires the
// signup → attribute → fraud end-to-end harness.
describe.skip('affiliate fraud flow (integration, Category C)', () => {
  it('self-referral with same IP creates self_referral_ip_match flag + risk score', () => {
    // 1. Applicant A applies, admin approves (→ code C-A).
    // 2. Applicant A signs up second account via ?ref=C-A with same hashed IP.
    // 3. Assert affiliate_fraud_flags has one row where flag_type='self_referral_ip_match', severity='high'.
    // 4. Assert affiliate_risk_scores.score >= 45 for affiliate A.
    // 5. Assert MailHog captured one email with subject matching /\[Fraud\] self_referral_ip_match/.
  });

  it('auto-pause triggers when combined flags push score ≥ 80', () => {
    // Additional self_referral_email_similar flag lifts score over threshold;
    // affiliates.status flips to 'paused' and affiliate_contract_history has
    // one row with action='paused', notes starting '[fraud-engine]'.
  });
});
