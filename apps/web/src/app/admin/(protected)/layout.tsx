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
    <>
      {/* Remove landing-page class from body so admin gets clean light bg */}
      <script dangerouslySetInnerHTML={{ __html: `document.body.classList.remove('landing-page')` }} />
      <AdminShell config={config} userEmail={user.email!}>
        {children}
      </AdminShell>
    </>
  );
}
