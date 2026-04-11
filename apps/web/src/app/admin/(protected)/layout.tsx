import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';
import { createAdminLayout } from '@tn-figueiredo/admin';
import type { AdminLayoutConfig } from '@tn-figueiredo/admin';

const config: AdminLayoutConfig = {
  appName: 'BrightTale Admin',
  sections: [
    {
      group: 'Visão Geral',
      items: [
        { label: 'Dashboard', path: '/admin', icon: 'LayoutDashboard' },
      ],
    },
    {
      group: 'Conteúdo',
      items: [
        { label: 'Projetos', path: '/admin/projects', icon: 'FolderOpen' },
        { label: 'Usuários', path: '/admin/users', icon: 'Users' },
      ],
    },
  ],
  features: {
    darkMode: true,
    autoRefresh: false,
  },
};

const AdminLayout = createAdminLayout(config);

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/admin/login');
  }

  if (!await isAdminUser(supabase, user.id)) {
    redirect('/admin/login?error=unauthorized');
  }

  return <AdminLayout userEmail={user.email!}>{children}</AdminLayout>;
}
