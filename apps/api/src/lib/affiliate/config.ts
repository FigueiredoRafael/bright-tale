import type { AffiliateConfig } from '@tn-figueiredo/affiliate'

// Convention: codebase uses APP_ORIGIN (see apps/api/src/index.ts:98,
// lib/email/resend.ts:78); default to apps/app prod origin.
// KNOWN GAP (resolves in 2B): package builds `${webBaseUrl}/signup?ref=X` and
// `${webBaseUrl}/affiliate/portal`. apps/app actual routes are
// `/[locale]/auth/signup` and (TBD) `/[locale]/settings/affiliate`. Click
// tracking still records correctly (use case fires BEFORE redirect), but the
// browser lands on a 404 until 2B adds the matching URLs or apps/app rewrites.
const APP_ORIGIN = process.env.APP_ORIGIN ?? 'https://app.brighttale.io'

export const AFFILIATE_CONFIG: AffiliateConfig = {
  minimumPayoutCents: 5000,
  tierRates: { nano: 0.15, micro: 0.20, mid: 0.25, macro: 0.30, mega: 0.35 },
  currentContractVersion: 1,
  webBaseUrl: APP_ORIGIN,
  appStoreUrl: APP_ORIGIN,
}
