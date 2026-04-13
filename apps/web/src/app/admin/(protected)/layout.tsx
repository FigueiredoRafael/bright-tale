import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';
import { AdminShell } from '@tn-figueiredo/admin/client';
import type { AdminLayoutConfig } from '@tn-figueiredo/admin';

const config: AdminLayoutConfig = {
  appName: 'BrightTale',
  sections: [
    {
      group: 'Principal',
      items: [
        { label: 'Dashboard', path: '/admin', icon: 'LayoutDashboard' },
      ],
    },
    {
      group: 'Gestão',
      items: [
        { label: 'Usuários', path: '/admin/users', icon: 'Users' },
        { label: 'Organizations', path: '/admin/orgs', icon: 'Building2' },
        { label: 'Agentes', path: '/admin/agents', icon: 'Bot' },
      ],
    },
  ],
  features: { darkMode: true },
};

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/admin/login');
  if (!await isAdminUser(supabase, user.id)) redirect('/admin/login?error=unauthorized');

  return (
    <AdminShell config={config} userEmail={user.email!}>
      {children}
    </AdminShell>
  );
}
