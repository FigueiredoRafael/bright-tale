import { createAdminClient } from '@/lib/supabase/admin';
import { KpiCard, KpiSection } from '@tn-figueiredo/admin/client';

export const dynamic = 'force-dynamic';

const STAGE_LABELS: Record<string, string> = {
  brainstorm: 'Brainstorm',
  research: 'Research',
  production: 'Production',
  review: 'Review',
  publish: 'Publish',
};

async function fetchDashboardData() {
  const db = createAdminClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [
    totalUsers,
    newToday,
    newThisWeek,
    recentUsers,
    totalProjects,
    projectStages,
    publishedProjects,
    researchArchives,
    blogDrafts,
    ideaArchives,
    activeAI,
    apiHealth,
  ] = await Promise.allSettled([
    db.from('user_profiles').select('id', { count: 'exact', head: true }),
    db.from('user_profiles').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
    db.from('user_profiles').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString()),
    db.from('user_profiles').select('id, first_name, last_name, created_at').order('created_at', { ascending: false }).limit(8),
    db.from('projects').select('id', { count: 'exact', head: true }),
    db.from('projects').select('current_stage'),
    db.from('projects').select('id', { count: 'exact', head: true }).eq('winner', true),
    db.from('research_archives').select('id', { count: 'exact', head: true }),
    db.from('blog_drafts').select('id', { count: 'exact', head: true }),
    db.from('idea_archives').select('id', { count: 'exact', head: true }),
    db.from('ai_provider_configs').select('id', { count: 'exact', head: true }).eq('is_active', true),
    fetch(`${process.env.API_URL ?? 'https://api.brighttale.io'}/health`, { cache: 'no-store' })
      .then((r) => r.ok)
      .catch(() => false),
  ]);

  // Stage breakdown
  const byStage: Record<string, number> = {};
  if (projectStages.status === 'fulfilled' && projectStages.value.data) {
    for (const p of projectStages.value.data) {
      const s = p.current_stage as string;
      byStage[s] = (byStage[s] ?? 0) + 1;
    }
  }

  return {
    users: {
      total: totalUsers.status === 'fulfilled' ? (totalUsers.value.count ?? 0) : 0,
      today: newToday.status === 'fulfilled' ? (newToday.value.count ?? 0) : 0,
      week: newThisWeek.status === 'fulfilled' ? (newThisWeek.value.count ?? 0) : 0,
      recent: recentUsers.status === 'fulfilled' ? (recentUsers.value.data ?? []) : [],
    },
    pipeline: {
      total: totalProjects.status === 'fulfilled' ? (totalProjects.value.count ?? 0) : 0,
      byStage,
      published: publishedProjects.status === 'fulfilled' ? (publishedProjects.value.count ?? 0) : 0,
    },
    content: {
      research: researchArchives.status === 'fulfilled' ? (researchArchives.value.count ?? 0) : 0,
      drafts: blogDrafts.status === 'fulfilled' ? (blogDrafts.value.count ?? 0) : 0,
      ideas: ideaArchives.status === 'fulfilled' ? (ideaArchives.value.count ?? 0) : 0,
    },
    system: {
      activeAI: activeAI.status === 'fulfilled' ? (activeAI.value.count ?? 0) : 0,
    },
    health: {
      api: apiHealth.status === 'fulfilled' ? (apiHealth.value as boolean) : false,
      supabase: totalUsers.status === 'fulfilled',
    },
  };
}

export default async function AdminDashboard() {
  const data = await fetchDashboardData();

  const stageEntries = Object.entries(data.pipeline.byStage);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'inherit', margin: 0 }}>Dashboard</h1>
        <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>Visão geral do BrightTale</p>
      </div>

      {/* Health strip */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <HealthBadge label="API" ok={data.health.api} />
        <HealthBadge label="Supabase" ok={data.health.supabase} />
      </div>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>

        {/* Crescimento */}
        <KpiSection title="Crescimento" color="green">
          <KpiCard label="Total usuários" value={data.users.total} subText={`${data.users.week} esta semana`} />
          <KpiCard label="Novos hoje" value={data.users.today} subText={`${data.users.week} nos últimos 7d`} />
        </KpiSection>

        {/* Pipeline */}
        <KpiSection title="Pipeline de Conteúdo" color="blue">
          <KpiCard label="Total projetos" value={data.pipeline.total} />
          <KpiCard label="Publicados" value={data.pipeline.published} subText="winner=true" />
          {stageEntries.map(([stage, count]) => (
            <KpiCard key={stage} label={STAGE_LABELS[stage] ?? stage} value={count} />
          ))}
        </KpiSection>

        {/* Conteúdo */}
        <KpiSection title="Conteúdo" color="purple">
          <KpiCard label="Research Archives" value={data.content.research} />
          <KpiCard label="Blog Drafts" value={data.content.drafts} />
          <KpiCard label="Idea Archives" value={data.content.ideas} />
        </KpiSection>

        {/* Sistema */}
        <KpiSection title="Sistema" color="amber">
          <KpiCard label="AI Providers ativos" value={data.system.activeAI} />
        </KpiSection>

      </div>

      {/* Cadastros recentes */}
      {data.users.recent.length > 0 && (
        <RecentUsers users={data.users.recent} />
      )}
    </div>
  );
}

function HealthBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
      border: `1px solid ${ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
      borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 500,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: ok ? '#10b981' : '#ef4444',
        display: 'inline-block',
      }} />
      {label}
    </div>
  );
}

function RecentUsers({ users }: { users: { id: string; first_name: string | null; last_name: string | null; created_at: string }[] }) {
  return (
    <div style={{ background: 'var(--dash-card, #1e293b)', borderRadius: 12, padding: 20, border: '1px solid var(--dash-border, #1e3a5f)' }}>
      <h3 style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Cadastros Recentes
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {users.map((u) => {
          const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || `…${u.id.slice(-6)}`;
          const date = new Date(u.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
          return (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <span>{name}</span>
              <span style={{ color: '#64748b', fontSize: 12 }}>{date}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
