import { KpiCard, KpiSection } from '@tn-figueiredo/admin/client';
import { DollarSign, TrendingDown, Building2, Percent, CreditCard } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PlanBreakdownEntry {
  planId: string;
  count: number;
}

interface FinanceSummary {
  revenueCents: number;
  costCents: number;
  activeOrgs: number;
  avgMargin: number;
  planBreakdown: PlanBreakdownEntry[];
}

async function fetchFinanceSummary(): Promise<FinanceSummary> {
  const apiUrl = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
  const internalKey = process.env.INTERNAL_API_KEY ?? '';

  const res = await fetch(`${apiUrl}/admin/finance/summary`, {
    cache: 'no-store',
    headers: {
      'X-Internal-Key': internalKey,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    // Return zeros on error so the page doesn't crash
    return { revenueCents: 0, costCents: 0, activeOrgs: 0, avgMargin: 0, planBreakdown: [] };
  }

  const body = (await res.json()) as {
    data: FinanceSummary | null;
    error: { code: string; message: string } | null;
  };

  if (body.error || !body.data) {
    return { revenueCents: 0, costCents: 0, activeOrgs: 0, avgMargin: 0, planBreakdown: [] };
  }

  return body.data;
}

function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${dollars.toFixed(2)}`;
}

function formatMargin(margin: number): string {
  return `${margin.toFixed(1)}%`;
}

export default async function FinancePage() {
  const summary = await fetchFinanceSummary();
  const grossMarginCents = summary.revenueCents - summary.costCents;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Finance</h1>
        <p className="text-sm text-muted-foreground">Resumo financeiro dos últimos 30 dias</p>
      </div>

      <KpiSection title="Receita e Custo (30d)" color="green">
        <KpiCard
          label="Receita bruta"
          value={formatCurrency(summary.revenueCents)}
          icon={<DollarSign className="h-4 w-4" />}
          subText="via Stripe"
        />
        <KpiCard
          label="Custo AI"
          value={formatCurrency(summary.costCents)}
          icon={<TrendingDown className="h-4 w-4" />}
          subText="uso de providers"
        />
        <KpiCard
          label="Margem bruta"
          value={formatCurrency(grossMarginCents)}
          icon={<DollarSign className="h-4 w-4" />}
          subText="receita − custo AI"
        />
        <KpiCard
          label="Margem média"
          value={formatMargin(summary.avgMargin)}
          icon={<Percent className="h-4 w-4" />}
          subText="média por dia/org"
        />
      </KpiSection>

      <KpiSection title="Assinaturas ativas" color="blue">
        <KpiCard
          label="Orgs com plano pago"
          value={summary.planBreakdown.reduce((s, e) => s + e.count, 0)}
          icon={<Building2 className="h-4 w-4" />}
        />
        {summary.planBreakdown.map((entry) => (
          <KpiCard
            key={entry.planId}
            label={entry.planId.charAt(0).toUpperCase() + entry.planId.slice(1)}
            value={entry.count}
            icon={<CreditCard className="h-4 w-4" />}
          />
        ))}
      </KpiSection>

      {summary.planBreakdown.length === 0 && summary.revenueCents === 0 && (
        <div className="rounded-xl bg-muted/50 border border-border p-6 text-center text-sm text-muted-foreground">
          Sem dados financeiros para os últimos 30 dias.
          <br />
          Os dados aparecem aqui conforme as assinaturas forem ativadas e a view{' '}
          <code className="font-mono text-xs">mv_finance_daily</code> for populada.
        </div>
      )}
    </div>
  );
}
