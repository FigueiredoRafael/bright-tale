import type { AffiliateConfig } from '@tn-figueiredo/affiliate'

export const AFFILIATE_CONFIG: AffiliateConfig = {
  minimumPayoutCents: 5000,
  tierRates: { nano: 0.15, micro: 0.20, mid: 0.25, macro: 0.30, mega: 0.35 },
  currentContractVersion: 1,
  webBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://brighttale.io',
  appStoreUrl: 'https://brighttale.io',
}
