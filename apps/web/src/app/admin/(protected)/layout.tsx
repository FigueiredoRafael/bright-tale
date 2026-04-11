import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/admin/login');
  }

  if (!await isAdminUser(supabase, user.id)) {
    redirect('/admin/login?error=unauthorized');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f172a', color: '#f1f5f9' }}>
      <nav style={{ width: 220, padding: '24px 16px', borderRight: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 24 }}>BrightTale Admin</div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>VISÃO GERAL</div>
        <a href="/admin" style={{ display: 'block', padding: '8px 12px', borderRadius: 6, color: '#f1f5f9', textDecoration: 'none', marginBottom: 4 }}>Dashboard</a>
        <div style={{ fontSize: 12, color: '#64748b', margin: '16px 0 8px' }}>CONTEÚDO</div>
        <a href="/admin/projects" style={{ display: 'block', padding: '8px 12px', borderRadius: 6, color: '#f1f5f9', textDecoration: 'none', marginBottom: 4 }}>Projetos</a>
        <a href="/admin/users" style={{ display: 'block', padding: '8px 12px', borderRadius: 6, color: '#f1f5f9', textDecoration: 'none', marginBottom: 4 }}>Usuários</a>
        <div style={{ marginTop: 'auto', paddingTop: 24, fontSize: 12, color: '#64748b' }}>{user.email}</div>
      </nav>
      <main style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
