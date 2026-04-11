import { createAdminClient } from '@/lib/supabase/admin';
import { KpiCard, KpiSection } from '@tn-figueiredo/admin/client';
import { Users, FolderOpen, FileText, BookOpen } from 'lucide-react';

export const dynamic = 'force-dynamic';

async function fetchDashboardStats() {
  const supabase = createAdminClient();

  const [users, projects, drafts, archives] = await Promise.allSettled([
    supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
    supabase.from('projects').select('id', { count: 'exact', head: true }),
    supabase.from('blog_drafts').select('id', { count: 'exact', head: true }),
    supabase.from('research_archives').select('id', { count: 'exact', head: true }),
  ]);

  return {
    totalUsers: users.status === 'fulfilled' ? (users.value.count ?? 0) : 0,
    totalProjects: projects.status === 'fulfilled' ? (projects.value.count ?? 0) : 0,
    totalDrafts: drafts.status === 'fulfilled' ? (drafts.value.count ?? 0) : 0,
    totalArchives: archives.status === 'fulfilled' ? (archives.value.count ?? 0) : 0,
  };
}

export default async function AdminDashboard() {
  const stats = await fetchDashboardStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Visão geral do BrightTale
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <KpiSection title="Usuários" color="green">
          <KpiCard
            label="Total de usuários"
            value={stats.totalUsers}
            icon={<Users size={18} className="text-emerald-500" />}
            subText="contas registradas"
          />
        </KpiSection>

        <KpiSection title="Conteúdo" color="blue">
          <KpiCard
            label="Projetos"
            value={stats.totalProjects}
            icon={<FolderOpen size={18} className="text-blue-500" />}
          />
          <KpiCard
            label="Drafts"
            value={stats.totalDrafts}
            icon={<FileText size={18} className="text-blue-500" />}
          />
          <KpiCard
            label="Research Archives"
            value={stats.totalArchives}
            icon={<BookOpen size={18} className="text-blue-500" />}
          />
        </KpiSection>
      </div>
    </div>
  );
}
