import { createAdminClient } from '@/lib/supabase/admin';
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

const STAGE_COLORS: Record<string, string> = {
  brainstorm: 'blue',
  research: 'blue',
  production: 'amber',
  review: 'purple',
  publish: 'green',
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
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-50 tracking-tight font-[family-name:var(--font-display)]">
            Dashboard
          </h1>
          <p className="text-[13px] text-slate-500 mt-1">Visão geral do BrightTale</p>
          <div className="flex gap-3.5 mt-2.5 items-center">
            <HealthDot label="API" ok={data.health.api} />
            <HealthDot label="Supabase" ok={data.health.supabase} />
          </div>
        </div>
        <div className="flex gap-2.5">
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 border border-slate-700/50 rounded-lg text-xs text-slate-400 bg-slate-900/40">
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizado Agora
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-slate-700/40 to-transparent" />

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">

        {/* Crescimento */}
        <SectionCard color="green" title="Crescimento">
          <div className="grid grid-cols-2 gap-3">
            <KpiInnerCard color="green" icon={<User className="w-3.5 h-3.5 text-emerald-400" />} label="Usuários">
              <div className="flex items-baseline">
                <span className="text-[30px] font-extrabold text-slate-50 tracking-tight leading-none [text-shadow:0_0_20px_rgba(74,222,128,0.15)]">
                  {data.users.total}
                </span>
                {data.users.week > 0 && (
                  <span className="ml-2 text-[11px] font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-[10px]">
                    ↑ {data.users.week} sem
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">{data.users.week} esta semana</p>
              <Sparkline color="#4ade80" />
            </KpiInnerCard>
            <KpiInnerCard color="green" icon={<UserPlus className="w-3.5 h-3.5 text-emerald-400" />} label="Novos hoje">
              <span className="text-[30px] font-extrabold text-slate-50 tracking-tight leading-none">
                {data.users.today}
              </span>
              <p className="text-[11px] text-slate-500 mt-1.5">{data.users.week} nos últimos 7d</p>
            </KpiInnerCard>
          </div>
        </SectionCard>

        {/* Pipeline de Conteúdo */}
        <SectionCard color="blue" title="Pipeline de Conteúdo">
          <div className="grid grid-cols-2 gap-3">
            <KpiInnerCard color="blue" icon={<Activity className="w-3.5 h-3.5 text-blue-400" />} label="Total Projetos">
              <span className="text-[30px] font-extrabold text-slate-50 tracking-tight leading-none [text-shadow:0_0_20px_rgba(96,165,250,0.15)]">
                {data.pipeline.total}
              </span>
              <p className="text-[11px] text-slate-500 mt-1.5">no pipeline</p>
              <Sparkline color="#60a5fa" />
            </KpiInnerCard>
            <KpiInnerCard color="blue" icon={<CheckCircle className="w-3.5 h-3.5 text-blue-400" />} label="Publicados">
              <span className="text-[30px] font-extrabold text-slate-50 tracking-tight leading-none">
                {data.pipeline.published}
              </span>
              <p className="text-[11px] text-slate-500 mt-1.5">winner=true</p>
            </KpiInnerCard>
          </div>
          {stageEntries.length > 0 && (
            <div className="flex gap-1.5 mt-3.5 flex-wrap">
              {stageEntries.map(([stage, count]) => (
                <StagePill key={stage} stage={stage} count={count} />
              ))}
            </div>
          )}
        </SectionCard>

        {/* Conteúdo */}
        <SectionCard color="purple" title="Conteúdo">
          <div className="grid grid-cols-3 gap-3">
            <KpiInnerCard color="purple" icon={<Search className="w-3.5 h-3.5 text-violet-400" />} label="Research">
              <span className="text-[28px] font-extrabold text-slate-50 tracking-tight leading-none">
                {data.content.research}
              </span>
              <p className="text-[11px] text-slate-500 mt-1.5">archives</p>
            </KpiInnerCard>
            <KpiInnerCard color="purple" icon={<FileEdit className="w-3.5 h-3.5 text-violet-400" />} label="Drafts">
              <span className="text-[28px] font-extrabold text-slate-50 tracking-tight leading-none">
                {data.content.drafts}
              </span>
              <p className="text-[11px] text-slate-500 mt-1.5">blog drafts</p>
            </KpiInnerCard>
            <KpiInnerCard color="purple" icon={<Lightbulb className="w-3.5 h-3.5 text-violet-400" />} label="Ideas">
              <span className="text-[28px] font-extrabold text-slate-50 tracking-tight leading-none">
                {data.content.ideas}
              </span>
              <p className="text-[11px] text-slate-500 mt-1.5">idea archives</p>
            </KpiInnerCard>
          </div>
        </SectionCard>

        {/* Sistema */}
        <SectionCard color="amber" title="Sistema">
          <div className="grid grid-cols-2 gap-3">
            <KpiInnerCard color="amber" icon={<Cpu className="w-3.5 h-3.5 text-amber-400" />} label="AI Providers">
              <span className="text-[30px] font-extrabold text-slate-50 tracking-tight leading-none">
                {data.system.activeAI}
              </span>
              <p className="text-[11px] text-slate-500 mt-1.5">ativos</p>
            </KpiInnerCard>
            <KpiInnerCard color="amber" icon={<HeartPulse className="w-3.5 h-3.5 text-amber-400" />} label="Health">
              <span className={`text-[30px] font-extrabold tracking-tight leading-none ${allHealthy ? 'text-emerald-400 [text-shadow:0_0_20px_rgba(74,222,128,0.2)]' : 'text-red-400 [text-shadow:0_0_20px_rgba(239,68,68,0.2)]'}`}>
                {allHealthy ? 'OK' : 'WARN'}
              </span>
              <p className="text-[11px] text-slate-500 mt-1.5">
                {allHealthy ? 'todos os serviços' : [!data.health.api && 'API', !data.health.supabase && 'DB'].filter(Boolean).join(' + ') + ' down'}
              </p>
            </KpiInnerCard>
          </div>
        </SectionCard>
      </div>

      {/* ── Cadastros Recentes ── */}
      {data.users.recent.length > 0 && <RecentUsers users={data.users.recent} />}
    </div>
  );
}

/* ═══════════ Style maps ═══════════ */

const SECTION_STYLES = {
  green: {
    card: 'bg-gradient-to-br from-slate-800/45 to-green-900/[0.08] border-l-emerald-400',
    title: 'text-emerald-400',
  },
  blue: {
    card: 'bg-gradient-to-br from-slate-800/45 to-blue-900/[0.08] border-l-blue-400',
    title: 'text-blue-400',
  },
  purple: {
    card: 'bg-gradient-to-br from-slate-800/45 to-violet-900/[0.08] border-l-violet-400',
    title: 'text-violet-400',
  },
  amber: {
    card: 'bg-gradient-to-br from-slate-800/45 to-amber-900/[0.08] border-l-amber-400',
    title: 'text-amber-400',
  },
} as const;

type SectionColor = keyof typeof SECTION_STYLES;

const INNER_CARD_STYLES = {
  green: { border: 'border-t-emerald-400/30', icon: 'bg-emerald-400/10 border-emerald-400/15' },
  blue: { border: 'border-t-blue-400/30', icon: 'bg-blue-400/10 border-blue-400/15' },
  purple: { border: 'border-t-violet-400/30', icon: 'bg-violet-400/10 border-violet-400/15' },
  amber: { border: 'border-t-amber-400/30', icon: 'bg-amber-400/10 border-amber-400/15' },
} as const;

/* ═══════════ Sub-components ═══════════ */

function SectionCard({ color, title, children }: { color: SectionColor; title: string; children: React.ReactNode }) {
  const s = SECTION_STYLES[color];
  return (
    <div className={`rounded-[14px] p-5 border border-slate-700/35 border-l-[3px] shadow-[0_4px_16px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.08)] ${s.card}`}>
      <h2 className={`text-xs font-bold uppercase tracking-[0.06em] mb-4 ${s.title}`}>{title}</h2>
      {children}
    </div>
  );
}

function KpiInnerCard({ color, icon, label, children }: { color: SectionColor; icon: React.ReactNode; label: string; children: React.ReactNode }) {
  const s = INNER_CARD_STYLES[color];
  return (
    <div className={`relative overflow-hidden bg-slate-950/50 border border-slate-700/25 border-t-2 ${s.border} rounded-[10px] p-4 transition-all duration-200 hover:bg-slate-900/60 hover:border-slate-700/40 hover:-translate-y-px`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-[30px] h-[30px] rounded-lg flex items-center justify-center border ${s.icon}`}>
          {icon}
        </div>
        <span className="text-xs text-slate-400 font-medium">{label}</span>
      </div>
      {children}
    </div>
  );
}

function HealthDot({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full inline-block ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}
        style={{
          animation: 'health-glow 2s ease infinite',
          boxShadow: ok
            ? '0 0 6px rgba(16,185,129,0.4)'
            : '0 0 6px rgba(239,68,68,0.4)',
        }}
      />
      {label}
    </span>
  );
}

function Sparkline({ color }: { color: string }) {
  const id = `sp-${color.replace('#', '')}-${Math.random().toString(36).slice(2, 6)}`;
  return (
    <svg className="absolute bottom-[-2px] right-[-2px] opacity-[0.18]" width="90" height="44" viewBox="0 0 90 44">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${id})`} points="0,38 14,34 26,28 38,32 50,20 62,24 74,14 90,10 90,44 0,44" />
      <polyline fill="none" stroke={color} strokeWidth="2" points="0,38 14,34 26,28 38,32 50,20 62,24 74,14 90,10" />
    </svg>
  );
}

function StagePill({ stage, count }: { stage: string; count: number }) {
  const colorKey = STAGE_COLORS[stage] ?? 'blue';
  const styles: Record<string, string> = {
    blue: 'text-blue-400 bg-blue-400/10 border-blue-400/15',
    purple: 'text-violet-400 bg-violet-400/10 border-violet-400/15',
    green: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/15',
    amber: 'text-amber-400 bg-amber-400/10 border-amber-400/15',
  };
  return (
    <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-[20px] border ${styles[colorKey]}`}>
      {STAGE_LABELS[stage] ?? stage} {count}
    </span>
  );
}

function RecentUsers({ users }: { users: { id: string; first_name: string | null; last_name: string | null; created_at: string }[] }) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  return (
    <div className="rounded-[14px] p-5 bg-slate-800/40 border border-slate-700/35 shadow-[0_4px_16px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.08)]">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-slate-400">Cadastros Recentes</h2>
        <a href="/admin/users" className="text-xs text-teal-400 font-medium hover:text-teal-300 transition-colors">
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
              className={`flex justify-between items-center px-1 py-2.5 transition-colors hover:bg-slate-800/30 hover:rounded-lg ${i < users.length - 1 ? 'border-b border-slate-700/20' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-[34px] h-[34px] rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-xs font-semibold text-white`}>
                  {initials}
                </div>
                <div>
                  <div className="text-[13px] text-slate-200 font-medium">
                    {name}
                    {isNew && (
                      <span className="ml-2 text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-[10px]">
                        novo
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">{date}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
