import { createAdminClient } from '@/lib/supabase/admin';
import { adminPath } from '@/lib/admin-path';
import { KpiCard, KpiSection } from '@tn-figueiredo/admin/client';
import {
  User,
  UserPlus,
  Activity,
  CheckCircle,
  Search,
  FileEdit,
  Lightbulb,
  Cpu,
  HeartPulse,
  RefreshCw,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const STAGE_LABELS: Record<string, string> = {
  brainstorm: 'Brainstorm',
  research: 'Research',
  production: 'Production',
  review: 'Review',
  publish: 'Publish',
};

const AVATAR_GRADIENTS = [
  'from-purple-500 to-violet-700',
  'from-blue-400 to-blue-700',
  'from-emerald-400 to-green-700',
  'from-amber-400 to-orange-600',
  'from-rose-400 to-pink-700',
];

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
  const allHealthy = data.health.api && data.health.supabase;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ── */}
      <div className="flex justify-between items-start animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-v-primary tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-v-secondary mt-1">
            Visão geral do BrightTale
          </p>
          {/* Health strip */}
          <div className="flex gap-4 mt-3 items-center text-xs">
            <HealthDot label="API" ok={data.health.api} />
            <HealthDot label="Supabase" ok={data.health.supabase} />
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 dark:border-dash-border rounded-lg text-xs text-slate-500 dark:text-v-secondary bg-white dark:bg-dash-card shadow-sm">
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizado Agora
          </div>
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Crescimento */}
        <div className="animate-fade-in-up-1">
          <KpiSection title="Crescimento" color="green">
            <KpiCard
              label="Usuários"
              value={data.users.total}
              icon={<User className="w-4 h-4" />}
              subText={`${data.users.week} esta semana`}
              change={data.users.week > 0 ? data.users.week : undefined}
              changeLabel="sem"
            />
            <KpiCard
              label="Novos hoje"
              value={data.users.today}
              icon={<UserPlus className="w-4 h-4" />}
              subText={`${data.users.week} nos últimos 7d`}
            />
          </KpiSection>
        </div>

        {/* Pipeline */}
        <div className="animate-fade-in-up-1">
          <KpiSection title="Pipeline de Conteúdo" color="blue">
            <KpiCard
              label="Total Projetos"
              value={data.pipeline.total}
              icon={<Activity className="w-4 h-4" />}
              subText="no pipeline"
            />
            <KpiCard
              label="Publicados"
              value={data.pipeline.published}
              icon={<CheckCircle className="w-4 h-4" />}
              subText="winner=true"
            />
            {stageEntries.map(([stage, count]) => (
              <KpiCard
                key={stage}
                label={STAGE_LABELS[stage] ?? stage}
                value={count}
              />
            ))}
          </KpiSection>
        </div>

        {/* Conteúdo */}
        <div className="animate-fade-in-up-2">
          <KpiSection title="Conteúdo" color="purple">
            <KpiCard
              label="Research Archives"
              value={data.content.research}
              icon={<Search className="w-4 h-4" />}
            />
            <KpiCard
              label="Blog Drafts"
              value={data.content.drafts}
              icon={<FileEdit className="w-4 h-4" />}
            />
            <KpiCard
              label="Idea Archives"
              value={data.content.ideas}
              icon={<Lightbulb className="w-4 h-4" />}
            />
          </KpiSection>
        </div>

        {/* Sistema */}
        <div className="animate-fade-in-up-2">
          <KpiSection title="Sistema" color="amber">
            <KpiCard
              label="AI Providers ativos"
              value={data.system.activeAI}
              icon={<Cpu className="w-4 h-4" />}
            />
            <KpiCard
              label="Health"
              value={allHealthy ? 'OK' : 'WARN'}
              icon={<HeartPulse className="w-4 h-4" />}
              subText={allHealthy ? 'todos os serviços' : [!data.health.api && 'API', !data.health.supabase && 'DB'].filter(Boolean).join(' + ') + ' down'}
            />
          </KpiSection>
        </div>
      </div>

      {/* ── Cadastros Recentes ── */}
      {data.users.recent.length > 0 && (
        <div className="animate-fade-in-up-3">
          <RecentUsers users={data.users.recent} />
        </div>
      )}
    </div>
  );
}

/* ═══════════ Sub-components ═══════════ */

function HealthDot({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${ok ? 'text-emerald-600 dark:text-v-green' : 'text-red-600 dark:text-v-red'}`}>
      <span
        className={`w-2 h-2 rounded-full inline-block ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}
        style={{
          animation: ok ? 'health-glow-green 2s ease infinite' : 'health-glow-red 2s ease infinite',
          boxShadow: ok ? '0 0 6px rgba(16,185,129,0.4)' : '0 0 6px rgba(239,68,68,0.4)',
        }}
      />
      {label}
    </span>
  );
}

function RecentUsers({ users }: { users: { id: string; first_name: string | null; last_name: string | null; created_at: string }[] }) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  return (
    <div className="rounded-xl p-5 bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-v-secondary">
          Cadastros Recentes
        </h2>
        <a href={adminPath('/users')} className="text-xs text-blue-600 dark:text-v-blue font-medium hover:underline transition-colors">
          Ver todos →
        </a>
      </div>
      <div className="flex flex-col">
        {users.map((u, i) => {
          const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || `…${u.id.slice(-6)}`;
          const initials = name.startsWith('…')
            ? '??'
            : name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
          const date = new Date(u.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
          const isNew = new Date(u.created_at) >= weekAgo;
          const gradient = AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length];

          return (
            <div
              key={u.id}
              className={`flex justify-between items-center px-1 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-dash-surface rounded-lg ${i < users.length - 1 ? 'border-b border-slate-100 dark:border-dash-border' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-xs font-semibold text-white`}>
                  {initials}
                </div>
                <div>
                  <div className="text-sm text-slate-800 dark:text-v-primary font-medium">
                    {name}
                    {isNew && (
                      <span className="ml-2 text-[10px] font-semibold text-emerald-700 dark:text-v-green bg-emerald-50 dark:bg-v-green/10 px-2 py-0.5 rounded-full">
                        novo
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <span className="text-xs text-slate-400 dark:text-v-dim font-medium">{date}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
