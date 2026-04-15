import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';
import { adminPath } from '@/lib/admin-path';
import { AdminShell } from '@tn-figueiredo/admin/client';
import type { AdminLayoutConfig } from '@tn-figueiredo/admin';
import { ThemeToggle } from './theme-toggle';

const config: AdminLayoutConfig = {
  appName: 'BrightTale',
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
        { label: 'Usuários', path: adminPath('/users'), icon: 'Users' },
        { label: 'Organizations', path: adminPath('/orgs'), icon: 'Building2' },
        { label: 'Agentes', path: adminPath('/agents'), icon: 'Bot' },
        { label: 'Analytics', path: adminPath('/analytics'), icon: 'BarChart3' },
      ],
    },
  ],
  features: { darkMode: true },
};

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(adminPath('/login'));
  if (!await isAdminUser(supabase, user.id)) redirect(adminPath('/login?error=unauthorized'));

  return (
    <AdminShell config={config} userEmail={user.email!}>
      <div className="flex justify-end mb-4">
        <ThemeToggle />
      </div>
      {children}
    </AdminShell>
  );
}
