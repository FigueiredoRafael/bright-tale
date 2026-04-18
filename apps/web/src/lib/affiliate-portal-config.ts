import { createPortalConfig } from '@tn-figueiredo/affiliate-portal/config'

export const portalConfig = createPortalConfig({
  appName: 'BrightTale',
  apiUrl: process.env.API_URL ?? 'http://localhost:3001',
  currentContractVersion: 1,
  appWebUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
  primaryColor: 'green',
})
