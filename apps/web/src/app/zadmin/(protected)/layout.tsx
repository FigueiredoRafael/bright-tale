import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';
import { adminPath } from '@/lib/admin-path';
import { AdminSidebar } from '@tn-figueiredo/admin/client';
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
    <div className="h-screen bg-slate-50 dark:bg-slate-900 flex overflow-hidden">
      <div className="relative w-64 shrink-0 h-full">
        <AdminSidebar config={config} userEmail={user.email!} />
        {/* Toggle sits above the user-email footer */}
        <div className="absolute bottom-10 left-0 right-0 px-4 py-2 bg-slate-900">
          <ThemeToggle />
        </div>
      </div>
      <main className="flex-1 overflow-y-auto p-8">
        {children}
      </main>
    </div>
  );
}
