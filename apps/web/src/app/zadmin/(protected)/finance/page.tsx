/**
 * M-015 — Finance dashboard.
 *
 * Status: scaffold ready — charts and revenue data require Stripe (M-001).
 * Cost data (AI usage) can be shown from existing `credit_usage` table.
 *
 * TODO when Stripe is wired:
 *   1. Populate mv_finance_daily materialised view
 *   2. Replace stub KPIs with real Stripe + DB data
 *   3. Plug Recharts/Tremor series charts
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';
import { redirect } from 'next/navigation';
import { adminPath } from '@/lib/admin-path';
import { TrendingUp, DollarSign, Activity, AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function FinancePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !await isAdminUser(supabase, user.id)) redirect(adminPath('/login'));

  const db = createAdminClient();

  // Cost data — AI usage (available without Stripe)
  const { data: usageSummary } = await db
    .from('credit_usage')
    .select('credits_used, created_at')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  const totalCreditsUsed = (usageSummary ?? []).reduce((s, r) => s + (r.credits_used ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-v-primary tracking-tight">Finance</h1>
          <p className="text-sm text-slate-500 dark:text-v-secondary mt-1">
            Receita × custo de operação × margem (USD).
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-md px-2 py-1">
          <AlertTriangle className="w-3 h-3" />
          Requer Stripe (M-001)
        </span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up-1">
        {[
          { label: 'MRR', value: '— (Stripe)', icon: <DollarSign className="w-5 h-5" />, note: 'Aguardando M-001' },
          { label: 'Margem', value: '—', icon: <TrendingUp className="w-5 h-5" />, note: 'Receita − custo' },
          { label: 'Custo AI (30d)', value: `${totalCreditsUsed.toLocaleString()} créditos`, icon: <Activity className="w-5 h-5" />, note: 'credit_usage' },
          { label: 'Churn rate', value: '— (Stripe)', icon: <TrendingUp className="w-5 h-5" />, note: 'Aguardando M-001' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-dash-surface flex items-center justify-center text-slate-500 dark:text-v-dim">
                {kpi.icon}
              </div>
              <p className="text-xs text-slate-500 dark:text-v-dim">{kpi.label}</p>
            </div>
            <p className="text-xl font-bold text-slate-800 dark:text-v-primary">{kpi.value}</p>
            <p className="text-xs text-slate-400 dark:text-v-dim mt-0.5">{kpi.note}</p>
          </div>
        ))}
      </div>

      {/* Charts placeholder */}
      <div className="animate-fade-in-up-2 grid grid-cols-1 md:grid-cols-2 gap-4">
        {['Receita × Custo (30d)', 'Margem ao longo do tempo', 'Top 10 users mais caros', 'Custo por provider AI'].map((chart) => (
          <div
            key={chart}
            className="bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl p-6 flex flex-col items-center justify-center min-h-[200px] gap-3"
          >
            <Activity className="w-8 h-8 text-slate-300 dark:text-v-dim opacity-40" />
            <p className="text-sm font-medium text-slate-500 dark:text-v-secondary">{chart}</p>
            <p className="text-xs text-slate-400 dark:text-v-dim text-center max-w-xs">
              Disponível após integração Stripe (M-001).<br />
              Adicione STRIPE_SECRET_KEY nas variáveis de ambiente.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
