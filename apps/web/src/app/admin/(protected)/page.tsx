import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const supabase = createAdminClient();

  const [users, projects] = await Promise.allSettled([
    supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
    supabase.from('projects').select('id', { count: 'exact', head: true }),
  ]);

  const totalUsers = users.status === 'fulfilled' ? (users.value.count ?? 0) : 0;
  const totalProjects = projects.status === 'fulfilled' ? (projects.value.count ?? 0) : 0;

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Dashboard</h1>
      <p style={{ color: '#64748b', marginBottom: 32 }}>Visão geral do BrightTale</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Usuários</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{totalUsers}</div>
        </div>
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Projetos</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{totalProjects}</div>
        </div>
      </div>
    </div>
  );
}
