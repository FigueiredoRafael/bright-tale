import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';
import { AdminShell } from '@tn-figueiredo/admin/client';
import type { AdminLayoutConfig } from '@tn-figueiredo/admin';

const config: AdminLayoutConfig = {
  appName: 'BrightTale Admin',
  sections: [
    {
      group: 'Principal',
      items: [
        { label: 'Dashboard', path: '/admin', icon: 'LayoutDashboard' },
      ],
    },
    {
      group: 'Usuários',
      items: [
        { label: 'Usuários', path: '/admin/users', icon: 'Users' },
      ],
    },
    {
      group: 'Conteúdo',
      items: [
        { label: 'Pipeline', path: '/admin/pipeline', icon: 'GitBranch' },
        { label: 'Agent Prompts', path: '/admin/agents', icon: 'Bot' },
      ],
    },
    {
      group: 'Sistema',
      items: [
        { label: 'Configs AI', path: '/admin/ai', icon: 'Cpu' },
        { label: 'WordPress', path: '/admin/wordpress', icon: 'Globe' },
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
