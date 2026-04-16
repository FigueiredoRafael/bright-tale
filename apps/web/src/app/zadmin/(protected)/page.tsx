import { createAdminClient } from '@/lib/supabase/admin'
import { adminPath } from '@/lib/admin-path'
import {
  KpiCard,
  KpiSection,
  AlertsPanel,
  ActivityFeed,
  RefreshIndicator,
} from '@tn-figueiredo/admin/client'
import type { ActivityEntry, AlertEntry } from '@tn-figueiredo/admin'
import {
  User, UserPlus, Activity, CheckCircle, Search, FileEdit, Lightbulb, Cpu, HeartPulse,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

const STAGE_LABELS: Record<string, string> = {
  brainstorm: 'Brainstorm',
  research: 'Research',
  production: 'Production',
  review: 'Review',
  publish: 'Publish',
}

async function fetchDashboardData() {
  const db = createAdminClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

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
  ])

  const byStage: Record<string, number> = {}
  if (projectStages.status === 'fulfilled' && projectStages.value.data) {
    for (const p of projectStages.value.data) {
      const s = p.current_stage as string
      byStage[s] = (byStage[s] ?? 0) + 1
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
  }
}

type RecentUser = { id: string; first_name: string | null; last_name: string | null; created_at: string }

function toActivityEntry(u: RecentUser): ActivityEntry {
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || `Usuário ${u.id.slice(-6)}`
  return {
    id: u.id,
    label: `${name} se cadastrou`,
    timestamp: u.created_at,
    iconBg: 'bg-emerald-100',
  }
}

function buildHealthAlerts(health: { api: boolean; supabase: boolean }): AlertEntry[] {
  const alerts: AlertEntry[] = []
  if (!health.api) alerts.push({ type: 'api_down', message: 'API (apps/api) não respondeu ao health check', severity: 'high' })
  if (!health.supabase) alerts.push({ type: 'db_down', message: 'Supabase queries falharam', severity: 'high' })
  return alerts
}

export default async function AdminDashboard() {
  const data = await fetchDashboardData()
  const stageEntries = Object.entries(data.pipeline.byStage)
  const alerts = buildHealthAlerts(data.health)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Visão geral do BrightTale</p>
        </div>
        <RefreshIndicator />
      </div>

      <AlertsPanel alerts={alerts} title="Saúde do sistema" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <KpiSection title="Crescimento" color="green">
          <KpiCard label="Usuários" value={data.users.total} icon={<User className="w-4 h-4" />} subText={`${data.users.week} esta semana`} />
          <KpiCard label="Novos hoje" value={data.users.today} icon={<UserPlus className="w-4 h-4" />} subText={`${data.users.week} nos últimos 7d`} />
        </KpiSection>

        <KpiSection title="Pipeline de Conteúdo" color="blue">
          <KpiCard label="Total Projetos" value={data.pipeline.total} icon={<Activity className="w-4 h-4" />} subText="no pipeline" />
          <KpiCard label="Publicados" value={data.pipeline.published} icon={<CheckCircle className="w-4 h-4" />} subText="winner=true" />
          {stageEntries.map(([stage, count]) => (
            <KpiCard key={stage} label={STAGE_LABELS[stage] ?? stage} value={count} />
          ))}
        </KpiSection>

        <KpiSection title="Conteúdo" color="purple">
          <KpiCard label="Research Archives" value={data.content.research} icon={<Search className="w-4 h-4" />} />
          <KpiCard label="Blog Drafts" value={data.content.drafts} icon={<FileEdit className="w-4 h-4" />} />
          <KpiCard label="Idea Archives" value={data.content.ideas} icon={<Lightbulb className="w-4 h-4" />} />
        </KpiSection>

        <KpiSection title="Sistema" color="amber">
          <KpiCard label="AI Providers ativos" value={data.system.activeAI} icon={<Cpu className="w-4 h-4" />} />
          <KpiCard
            label="Health"
            value={data.health.api && data.health.supabase ? 'OK' : 'WARN'}
            icon={<HeartPulse className="w-4 h-4" />}
            subText={data.health.api && data.health.supabase ? 'todos os serviços' : 'ver alertas acima'}
          />
        </KpiSection>
      </div>

      {data.users.recent.length > 0 && (
        <div className="rounded-xl p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Cadastros Recentes
            </h2>
            <a
              href={adminPath('/users')}
              className="text-xs text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
            >
              Ver todos →
            </a>
          </div>
          <ActivityFeed entries={data.users.recent.map(toActivityEntry)} />
        </div>
      )}
    </div>
  )
}
