import type { AdminLayoutConfig } from '@tn-figueiredo/admin'
import { adminPath } from '@/lib/admin-path'
import { ThemeToggle } from '@/app/zadmin/(protected)/theme-toggle'

export const ADMIN_LAYOUT_CONFIG: AdminLayoutConfig = {
  appName: 'BrightTale Admin',
  sections: [
    {
      group: 'Principal',
      items: [
        { label: 'Dashboard', path: adminPath(), icon: 'LayoutDashboard' },
      ],
    },
    {
      group: 'Gestão',
      items: [
        { label: 'Managers', path: adminPath('/managers'), icon: 'ShieldCheck' },
        { label: 'Usuários', path: adminPath('/users'), icon: 'Users' },
        { label: 'Organizations', path: adminPath('/orgs'), icon: 'Building2' },
        { label: 'Agentes', path: adminPath('/agents'), icon: 'Bot' },
        { label: 'Analytics', path: adminPath('/analytics'), icon: 'BarChart3' },
        { label: 'Afiliados', path: adminPath('/affiliates'), icon: 'Users2' },
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
