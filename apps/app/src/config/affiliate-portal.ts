import { createPortalConfig } from '@tn-figueiredo/affiliate-portal/config'

export const portalConfig = createPortalConfig({
  appName: 'BrightTale',
  apiUrl: process.env.API_URL!,
  currentContractVersion: 1,
  appWebUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
  primaryColor: 'green',
  routes: {
    // Redirect dashboard to the main app's affiliate settings page
    dashboard: '/settings/affiliate',
    login: '/auth/login',
    apply: '/settings/affiliate/apply',
  },
})
