import { createAdminClient } from '@/lib/supabase/admin';
import { KpiCard, KpiSection } from '@tn-figueiredo/admin/client';
import {
  DollarSign,
  Users,
  TrendingUp,
  Zap,
  CreditCard,
  Activity,
  Layers,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function val(result: PromiseSettledResult<any>): any {
  return result.status === 'fulfilled' ? result.value : { data: [], count: 0 };
}

async function fetchAnalytics() {
  const db = createAdminClient();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalOrgs,
    activeOrgs30d,
    totalCreditsUsed,
    credits7d,
    totalTokens,
    tokens7d,
    usageByProvider,
    usageByStage,
    topOrgs,
    recentUsage,
    paidOrgs,
  ] = await Promise.allSettled([
    db.from('organizations').select('id', { count: 'exact', head: true }),
    db.from('usage_events').select('org_id', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo.toISOString()),
    db.from('credit_usage').select('cost').order('created_at', { ascending: false }).limit(10000),
    db.from('credit_usage').select('cost').gte('created_at', sevenDaysAgo.toISOString()).limit(10000),
    db.from('usage_events').select('input_tokens, output_tokens').limit(10000),
    db.from('usage_events').select('input_tokens, output_tokens').gte('created_at', sevenDaysAgo.toISOString()).limit(10000),
    db.from('usage_events').select('provider, cost_usd').limit(10000),
    db.from('usage_events').select('stage, cost_usd').limit(10000),
    db.from('credit_usage').select('org_id, cost').limit(10000),
    db.from('usage_events').select('provider, model, stage, input_tokens, output_tokens, cost_usd, created_at').order('created_at', { ascending: false }).limit(20),
    db.from('organizations').select('id, plan').neq('plan', 'free'),
  ]);

  const totalOrgsCount = (val(totalOrgs).count ?? 0) as number;
  const activeOrgs30dCount = (val(activeOrgs30d).count ?? 0) as number;

  const totalCreditsData = (val(totalCreditsUsed).data ?? []) as Array<{ cost: number }>;
  const totalCreditsSum = totalCreditsData.reduce((sum: number, r) => sum + (r.cost ?? 0), 0);

  const credits7dData = (val(credits7d).data ?? []) as Array<{ cost: number }>;
  const credits7dSum = credits7dData.reduce((sum: number, r) => sum + (r.cost ?? 0), 0);

  const tokensData = (val(totalTokens).data ?? []) as Array<{ input_tokens: number; output_tokens: number }>;
  const totalTokensSum = tokensData.reduce((sum: number, r) => sum + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0);

  const tokens7dData = (val(tokens7d).data ?? []) as Array<{ input_tokens: number; output_tokens: number }>;
  const tokens7dSum = tokens7dData.reduce((sum: number, r) => sum + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0);

  const providerData = (val(usageByProvider).data ?? []) as Array<{ provider: string; cost_usd: number }>;
  const byProvider = new Map<string, number>();
  for (const r of providerData) {
    byProvider.set(r.provider, (byProvider.get(r.provider) ?? 0) + (r.cost_usd ?? 0));
  }

  const stageData = (val(usageByStage).data ?? []) as Array<{ stage: string; cost_usd: number }>;
  const byStage = new Map<string, number>();
  for (const r of stageData) {
    byStage.set(r.stage, (byStage.get(r.stage) ?? 0) + (r.cost_usd ?? 0));
  }

  const topOrgsData = (val(topOrgs).data ?? []) as Array<{ org_id: string; cost: number }>;
  const orgCredits = new Map<string, number>();
  for (const r of topOrgsData) {
    orgCredits.set(r.org_id, (orgCredits.get(r.org_id) ?? 0) + (r.cost ?? 0));
  }
  const topOrgsList = [...orgCredits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const recentRows = (val(recentUsage).data ?? []) as Array<{ provider: string; model: string; stage: string; input_tokens: number; output_tokens: number; cost_usd: number; created_at: string }>;

  const paidOrgsData = (val(paidOrgs).data ?? []) as Array<{ id: string; plan: string }>;
  const planCounts = new Map<string, number>();
  for (const o of paidOrgsData) {
    planCounts.set(o.plan, (planCounts.get(o.plan) ?? 0) + 1);
  }

  return {
    totalOrgsCount,
    activeOrgs30dCount,
    totalCreditsSum,
    credits7dSum,
    totalTokensSum,
    tokens7dSum,
    byProvider: [...byProvider.entries()].sort((a, b) => b[1] - a[1]),
    byStage: [...byStage.entries()].sort((a, b) => b[1] - a[1]),
    topOrgsList,
    recentRows,
    planCounts: [...planCounts.entries()].sort((a, b) => b[1] - a[1]),
  };
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

export default async function AnalyticsPage() {
  const data = await fetchAnalytics();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Métricas de negócio e uso da plataforma</p>
      </div>

      <KpiSection title="Visão Geral" color="blue">
        <KpiCard label="Total Orgs" value={data.totalOrgsCount} icon={<Users className="h-4 w-4" />} />
        <KpiCard label="Orgs ativas (30d)" value={data.activeOrgs30dCount} icon={<Activity className="h-4 w-4" />} />
        <KpiCard label="Planos pagos" value={data.planCounts.reduce((s, [, c]) => s + c, 0)} icon={<CreditCard className="h-4 w-4" />} />
      </KpiSection>

      {data.planCounts.length > 0 && (
        <KpiSection title="Distribuição de Planos" color="green">
          {data.planCounts.map(([plan, count]) => (
            <KpiCard key={plan} label={plan.charAt(0).toUpperCase() + plan.slice(1)} value={count} icon={<Users className="h-4 w-4" />} />
          ))}
        </KpiSection>
      )}

      <KpiSection title="Créditos" color="amber">
        <KpiCard label="Total consumido" value={formatNum(data.totalCreditsSum)} icon={<Zap className="h-4 w-4" />} />
        <KpiCard label="Últimos 7 dias" value={formatNum(data.credits7dSum)} icon={<TrendingUp className="h-4 w-4" />} />
      </KpiSection>

      <KpiSection title="Tokens" color="purple">
        <KpiCard label="Total tokens" value={formatNum(data.totalTokensSum)} icon={<Activity className="h-4 w-4" />} />
        <KpiCard label="Últimos 7 dias" value={formatNum(data.tokens7dSum)} icon={<TrendingUp className="h-4 w-4" />} />
      </KpiSection>

      <KpiSection title="Custo por Provider" color="green">
        {data.byProvider.map(([provider, cost]) => (
          <KpiCard key={provider} label={provider} value={`$${cost.toFixed(2)}`} icon={<DollarSign className="h-4 w-4" />} />
        ))}
      </KpiSection>

      <KpiSection title="Custo por Stage" color="blue">
        {data.byStage.map(([stage, cost]) => (
          <KpiCard key={stage} label={stage} value={`$${cost.toFixed(2)}`} icon={<Layers className="h-4 w-4" />} />
        ))}
      </KpiSection>

      {data.topOrgsList.length > 0 && (
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="font-semibold text-sm">Top 5 Orgs por créditos</h3>
          <div className="space-y-2">
            {data.topOrgsList.map(([orgId, credits], i) => (
              <div key={orgId} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-mono text-xs">{i + 1}. {orgId.slice(0, 8)}...</span>
                <span className="font-medium">{formatNum(credits)} créditos</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.recentRows.length > 0 && (
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="font-semibold text-sm">Uso recente (últimas 20 chamadas)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-1.5 pr-3">Provider</th>
                  <th className="text-left py-1.5 pr-3">Model</th>
                  <th className="text-left py-1.5 pr-3">Stage</th>
                  <th className="text-right py-1.5 pr-3">Tokens</th>
                  <th className="text-right py-1.5 pr-3">Custo</th>
                  <th className="text-right py-1.5">Quando</th>
                </tr>
              </thead>
              <tbody>
                {data.recentRows.map((row, i) => (
                  <tr key={i} className="border-b border-muted/50">
                    <td className="py-1.5 pr-3">{row.provider}</td>
                    <td className="py-1.5 pr-3 font-mono">{row.model}</td>
                    <td className="py-1.5 pr-3">{row.stage}</td>
                    <td className="py-1.5 pr-3 text-right">{formatNum((row.input_tokens ?? 0) + (row.output_tokens ?? 0))}</td>
                    <td className="py-1.5 pr-3 text-right">${(row.cost_usd ?? 0).toFixed(4)}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{new Date(row.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
