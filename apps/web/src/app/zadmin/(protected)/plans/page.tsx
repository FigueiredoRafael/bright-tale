/**
 * M-013 — Custom plans.
 *
 * Status: scaffold — custom_plans table available (migration applied).
 * Creating plans with custom Stripe Price IDs requires M-001.
 *
 * TODO when Stripe wired:
 *   1. Create price via stripe.prices.create()
 *   2. Link price_id to custom_plan row
 *   3. Owner: unlimited discount; Admin: ≤ 30%
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';
import { redirect } from 'next/navigation';
import { adminPath } from '@/lib/admin-path';
import { AlertTriangle, Package } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function PlansPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !await isAdminUser(supabase, user.id)) redirect(adminPath('/login'));

  const db = createAdminClient();

  const { data: plans } = await db
    .from('custom_plans')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-v-primary tracking-tight">Planos</h1>
          <p className="text-sm text-slate-500 dark:text-v-secondary mt-1">
            Planos padrão + planos customizados por org. Criação de planos Stripe requer M-001.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-md px-2 py-1">
          <AlertTriangle className="w-3 h-3" />
          Requer Stripe (M-001)
        </span>
      </div>

      {/* Standard plans — read-only display */}
      <div className="animate-fade-in-up-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { name: 'Starter', price: '$9/mo', tokens: '5.000' },
          { name: 'Creator', price: '$29/mo', tokens: '15.000' },
          { name: 'Pro', price: '$79/mo', tokens: 'TBD' },
        ].map((p) => (
          <div key={p.name} className="bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-slate-400 dark:text-v-dim" />
              <p className="text-sm font-semibold text-slate-800 dark:text-v-primary">{p.name}</p>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-v-primary">{p.price}</p>
            <p className="text-xs text-slate-400 dark:text-v-dim mt-1">{p.tokens} tokens / mês</p>
          </div>
        ))}
      </div>

      {/* Custom plans table */}
      <div className="animate-fade-in-up-2 bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-dash-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-v-primary">Planos customizados</h2>
          <span className="text-xs text-slate-400 dark:text-v-dim italic">Criação disponível após Stripe</span>
        </div>
        {(plans ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-v-dim">
            <Package className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">Nenhum plano customizado.</p>
            <p className="text-xs mt-1 text-center max-w-xs">
              Owner pode dar até 100% de desconto, admin até 30%.
              Disponível após M-001 (Stripe).
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-dash-border">
                  {['Nome', 'Org', 'Tokens/mês', 'Preço', 'Stripe Price ID', 'Status'].map((h) => (
                    <th key={h} className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(plans ?? []).map((p) => (
                  <tr key={p.id as string} className="border-b border-slate-50 dark:border-dash-border/50">
                    <td className="py-3 px-4 text-sm font-medium">{String(p.name ?? '—')}</td>
                    <td className="py-3 px-4 text-xs text-slate-400">{String(p.org_id ?? '—').slice(0, 8)}…</td>
                    <td className="py-3 px-4 font-mono text-xs">{String(p.credits_per_month ?? '—')}</td>
                    <td className="py-3 px-4 font-mono text-xs">${((Number(p.price_usd_cents) || 0) / 100).toFixed(2)}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-400">{String(p.stripe_price_id ?? 'pendente')}</td>
                    <td className="py-3 px-4 text-xs">{p.is_active ? 'Ativo' : 'Inativo'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
