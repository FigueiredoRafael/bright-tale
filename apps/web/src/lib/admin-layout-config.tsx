import type { AdminLayoutConfig } from '@tn-figueiredo/admin'
import { adminPath } from '@/lib/admin-path'
import { ThemeToggle } from '@/app/zadmin/(protected)/theme-toggle'

export const ADMIN_LAYOUT_CONFIG: AdminLayoutConfig = {
  appName: 'BrightTale Admin',
  sections: [
    {
      group: 'Principal',
      items: [
        { label: 'Dashboard', path: adminPath(), icon: 'Activity' },
      ],
    },
    {
      group: 'Gestão',
      items: [
        { label: 'Managers', path: adminPath('/managers'), icon: 'Shield' },
        { label: 'Usuários', path: adminPath('/users'), icon: 'Users' },
        { label: 'Organizations', path: adminPath('/orgs'), icon: 'Package' },
        { label: 'Agentes', path: adminPath('/agents'), icon: 'Star' },
        { label: 'Tools', path: adminPath('/agents/tools'), icon: 'Settings' },
        { label: 'Providers', path: adminPath('/providers'), icon: 'Database' },
        { label: 'Afiliados', path: adminPath('/affiliates'), icon: 'TrendingUp' },
      ],
    },
    {
      group: 'Monetização',
      items: [
        { label: 'Planos', path: adminPath('/plans'), icon: 'FileText' },
        { label: 'Cupons', path: adminPath('/coupons'), icon: 'Bell' },
        { label: 'Doações', path: adminPath('/donations'), icon: 'Globe' },
      ],
    },
    {
      group: 'Operações',
      items: [
        { label: 'Suporte', path: adminPath('/support'), icon: 'Bell' },
        { label: 'Refunds', path: adminPath('/refunds'), icon: 'Activity' },
        { label: 'Finance', path: adminPath('/finance'), icon: 'BarChart3' },
      ],
    },
    {
      group: 'Sistema',
      items: [
        { label: 'Analytics', path: adminPath('/analytics'), icon: 'BarChart3' },
        { label: 'Settings', path: adminPath('/settings'), icon: 'Settings' },
      ],
    },
  ],
  branding: {
    siteName: 'BrightTale',
    primaryDomain: 'brighttale.io',
    defaultLocale: 'pt-BR',
    primaryColor: '#2DD4A8',
  },
  logoutPath: adminPath('/logout'),
  logoutLabel: 'Sair',
  siteSwitcherSlot: <ThemeToggle />,
}
