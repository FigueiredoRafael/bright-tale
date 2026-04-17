import type { AffiliateConfig } from '@tn-figueiredo/affiliate'

// Convention: codebase uses APP_ORIGIN (see apps/api/src/index.ts:98,
// lib/email/resend.ts:78); default to apps/app prod origin.
// /signup drift resolved in Phase 2B via Next.js beforeFiles rewrites in
// apps/app/next.config.ts: /signup → /auth/signup, /parceiros/login → /auth/login,
// /parceiros/dashboard → /settings/affiliate. See
// docs/superpowers/specs/2026-04-17-affiliate-2b-end-user-ui-design.md §6.3.
const APP_ORIGIN = process.env.APP_ORIGIN ?? 'https://app.brighttale.io'

export const AFFILIATE_CONFIG: AffiliateConfig = {
  minimumPayoutCents: 5000,
  tierRates: { nano: 0.15, micro: 0.20, mid: 0.25, macro: 0.30, mega: 0.35 },
  currentContractVersion: 1,
  webBaseUrl: APP_ORIGIN,
  appStoreUrl: APP_ORIGIN,
}
