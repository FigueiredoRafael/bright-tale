/**
 * M-007 — Auto-refund + anti-fraud.
 *
 * Status: scaffold — audit log table available (migration applied).
 * Full auto-refund execution requires Stripe (M-001).
 *
 * TODO when Stripe wired:
 *   1. stripe.refunds.create({ charge_id, amount })
 *   2. Revert credits on refund_audit
 *   3. Anti-fraud: IP/email/card fingerprint deduplication
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';
import { redirect } from 'next/navigation';
import { adminPath } from '@/lib/admin-path';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function RefundsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !await isAdminUser(supabase, user.id)) redirect(adminPath('/login'));

  const db = createAdminClient();

  // Read audit log (available even without Stripe)
  const { data: audits } = await db
    .from('refund_audit')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-v-primary tracking-tight">Refunds</h1>
          <p className="text-sm text-slate-500 dark:text-v-secondary mt-1">
            Auditoria de refunds. Auto-refund e anti-fraude requerem Stripe (M-001).
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-md px-2 py-1">
          <AlertTriangle className="w-3 h-3" />
          Execução requer Stripe
        </span>
      </div>

      {/* Audit log */}
      <div className="animate-fade-in-up-1 bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-dash-border">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-v-primary">Audit log de refunds</h2>
        </div>
        {(audits ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-400 dark:text-v-dim">
            <p className="text-sm">Nenhum refund registrado.</p>
            <p className="text-xs mt-1">Quando Stripe for configurado, refunds aparecerão aqui.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-dash-border">
                  {['ID', 'User', 'Valor', 'Motivo', 'Status', 'Data'].map((h) => (
                    <th key={h} className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(audits ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 dark:border-dash-border/50">
                    <td className="py-3 px-4 font-mono text-xs text-slate-400">{String(r.id).slice(0, 8)}…</td>
                    <td className="py-3 px-4 text-xs">{String(r.user_id ?? '—').slice(0, 8)}…</td>
                    <td className="py-3 px-4 text-xs font-mono">${((r.amount_usd_cents as number ?? 0) / 100).toFixed(2)}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{String(r.reason ?? '—')}</td>
                    <td className="py-3 px-4 text-xs">{String(r.status ?? '—')}</td>
                    <td className="py-3 px-4 text-xs text-slate-400">
                      {r.created_at ? new Date(String(r.created_at)).toLocaleDateString('pt-BR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Anti-fraud rules panel */}
      <div className="animate-fade-in-up-2 bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-v-primary mb-3">Regras anti-fraude (M-007)</h2>
        <ul className="space-y-2 text-xs text-slate-500 dark:text-v-secondary">
          {[
            '≤ 7 dias sem uso OU ≤ 24h com ≤ 10% gasto → auto-refund',
            'Cap: $50 por refund',
            'Mesmo email: 1 refund vitalício',
            'Mesmo IP: 2 em 30 dias',
            'Mesmo cartão fingerprint: 1 vitalício',
            'Conta < 24h: bloqueia auto-refund → ticket P1 fraud_risk',
            'Velocity > 10/h globais: alerta',
          ].map((rule) => (
            <li key={rule} className="flex items-start gap-2">
              <span className="text-amber-400 mt-0.5">▸</span>
              {rule}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-400 dark:text-v-dim italic">
          Implementação automática ativa após Stripe (M-001) + lógica de detecção no webhook handler.
        </p>
      </div>
    </div>
  );
}
