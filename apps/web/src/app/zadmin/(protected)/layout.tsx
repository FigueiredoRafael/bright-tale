import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';
import { adminPath } from '@/lib/admin-path';
import { AdminSidebarCustom } from './admin-sidebar';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(adminPath('/login'));
  if (!await isAdminUser(supabase, user.id)) redirect(adminPath('/login?error=unauthorized'));

  return (
    <div className="h-screen bg-[var(--bg-primary)] flex overflow-hidden">
      <AdminSidebarCustom userEmail={user.email!} />
      <main className="flex-1 overflow-y-auto p-8">
        {children}
      </main>
    </div>
  );
}
