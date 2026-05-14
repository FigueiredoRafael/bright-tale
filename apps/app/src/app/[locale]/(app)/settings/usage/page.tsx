'use client';

import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, Zap, Gift, Calendar, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@/i18n/navigation';

interface CreditBalance {
  creditsTotal: number;
  creditsUsed: number;
  creditsAddon: number;
  creditsResetAt: string | null;
  available: number;
  signupBonusCredits?: number;
  signupBonusExpiresAt?: string | null;
}

interface UsageItem {
  id: string;
  action: string;
  category: string;
  cost: number;
  source: string;
  created_at: string;
}

interface UsageSummary {
  windowDays: number;
  totals: { inputTokens: number; outputTokens: number; costUsd: number; calls: number };
  byProvider: { name: string; calls: number; costUsd: number }[];
  byStage: { name: string; calls: number; costUsd: number }[];
}

function ProgressBar({ value, max, color = 'bg-primary' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 bg-secondary rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

const CATEGORY_COLORS: Record<string, string> = {
  text: 'bg-blue-500',
  voice: 'bg-purple-500',
  image: 'bg-amber-500',
  video: 'bg-red-500',
  research: 'bg-emerald-500',
  brainstorm: 'bg-cyan-500',
};

const SOURCE_LABELS: Record<string, string> = {
  plan: 'Plano',
  addon: 'Addon',
  bonus: 'Bônus',
  mixed: 'Misto',
  extra: 'Extra',
};

export default function UsagePage() {
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [history, setHistory] = useState<UsageItem[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [balRes, histRes, sumRes] = await Promise.all([
        fetch('/api/credits/balance'),
        fetch('/api/credits/usage?limit=20'),
        fetch('/api/usage/summary?days=30'),
      ]);
      const [balJson, histJson, sumJson] = await Promise.all([
        balRes.json(), histRes.json(), sumRes.json(),
      ]);

      if (balJson.data) setBalance(balJson.data);
      if (histJson.data?.items) setHistory(histJson.data.items);
      if (sumJson.data) setSummary(sumJson.data);
    } catch {
      toast.error('Erro ao carregar dados de uso');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const planPct = balance && balance.creditsTotal > 0
    ? Math.min((balance.creditsUsed / balance.creditsTotal) * 100, 100)
    : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-8 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <TrendingUp className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Uso &amp; créditos</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Consumo do ciclo atual e histórico das últimas operações.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-secondary/40 animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* Credit overview cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: 'Disponível',
                value: balance?.available?.toLocaleString('pt-BR') ?? '—',
                icon: <Zap className="w-4 h-4 text-emerald-500" />,
                sub: 'tokens',
              },
              {
                label: 'Plano',
                value: balance ? `${balance.creditsUsed.toLocaleString('pt-BR')} / ${balance.creditsTotal.toLocaleString('pt-BR')}` : '—',
                icon: <Calendar className="w-4 h-4 text-blue-500" />,
                sub: 'tokens usados',
              },
              {
                label: 'Addon',
                value: balance?.creditsAddon?.toLocaleString('pt-BR') ?? '—',
                icon: <Gift className="w-4 h-4 text-violet-500" />,
                sub: 'tokens doados/bônus',
              },
              {
                label: 'Reset',
                value: balance?.creditsResetAt
                  ? new Date(balance.creditsResetAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                  : '—',
                icon: <Clock className="w-4 h-4 text-muted-foreground" />,
                sub: 'próximo reset',
              },
            ].map((c) => (
              <div key={c.label} className="border border-border rounded-xl p-4 bg-card">
                <div className="flex items-center gap-2 mb-1">
                  {c.icon}
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                </div>
                <p className="text-lg font-bold">{c.value}</p>
                <p className="text-xs text-muted-foreground">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Plan usage bar */}
          {balance && (
            <div className="border border-border rounded-xl p-5 bg-card space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Uso do plano neste ciclo</p>
                <span className={`text-sm font-semibold ${planPct >= 95 ? 'text-red-500' : planPct >= 80 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                  {Math.round(planPct)}%
                </span>
              </div>
              <ProgressBar
                value={balance.creditsUsed}
                max={balance.creditsTotal}
                color={planPct >= 95 ? 'bg-red-500' : planPct >= 80 ? 'bg-amber-500' : 'bg-primary'}
              />
              {planPct >= 80 && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>
                    {planPct >= 95 ? 'Créditos quase esgotados.' : 'Mais de 80% usado.'}{' '}
                    <Link href="/upgrade" className="underline">Fazer upgrade →</Link>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Signup bonus banner (M-003) */}
          {balance && (balance.signupBonusCredits ?? 0) > 0 && (
            <div className="border border-violet-200 dark:border-violet-800/40 rounded-xl p-4 bg-violet-50 dark:bg-violet-900/10 flex items-start gap-3">
              <Gift className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-violet-700 dark:text-violet-400">
                  Bônus de boas-vindas: {(balance.signupBonusCredits ?? 0).toLocaleString('pt-BR')} tokens
                </p>
                {balance.signupBonusExpiresAt && (
                  <p className="text-xs text-violet-600 dark:text-violet-500 mt-0.5">
                    Válido até {new Date(balance.signupBonusExpiresAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}.
                    Use para explorar o produto sem custo!
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 30-day summary by provider */}
          {summary && summary.byProvider.length > 0 && (
            <div className="border border-border rounded-xl p-5 bg-card space-y-3">
              <p className="text-sm font-medium">Uso nos últimos 30 dias — por provider</p>
              <p className="text-xs text-muted-foreground">
                {summary.totals.calls.toLocaleString('pt-BR')} chamadas · {(summary.totals.inputTokens + summary.totals.outputTokens).toLocaleString('pt-BR')} tokens
              </p>
              <div className="space-y-2">
                {summary.byProvider
                  .sort((a, b) => b.costUsd - a.costUsd)
                  .map((p) => {
                    const totalCost = summary.byProvider.reduce((s, x) => s + x.costUsd, 0);
                    const pct = totalCost > 0 ? (p.costUsd / totalCost) * 100 : 0;
                    return (
                      <div key={p.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="capitalize font-medium">{p.name}</span>
                          <span className="text-muted-foreground">{p.calls} calls</span>
                        </div>
                        <ProgressBar value={pct} max={100} color="bg-primary/70" />
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Recent usage history */}
          <div className="border border-border rounded-xl bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <p className="text-sm font-medium">Histórico recente</p>
            </div>
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <TrendingUp className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">Nenhum uso registrado ainda.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {history.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_COLORS[item.category] ?? 'bg-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.action}</p>
                      <p className="text-xs text-muted-foreground capitalize">{item.category}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{item.cost.toLocaleString('pt-BR')} tkn</p>
                      <p className="text-xs text-muted-foreground">{SOURCE_LABELS[item.source] ?? item.source} · {timeAgo(item.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
