/**
 * M-008 — Support escalation queue.
 * Shows escalated threads from support_threads table (schema applied).
 * Chatbot (M-006) scaffolding deferred — needs M-007 (Stripe) to auto-refund.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';
import { redirect } from 'next/navigation';
import { adminPath } from '@/lib/admin-path';
import { MessageSquare, AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

const PRIORITY_CLASSES: Record<string, string> = {
  P0: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/30',
  P1: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800/30',
  P2: 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/30',
  P3: 'bg-slate-100 dark:bg-dash-surface text-slate-500 dark:text-v-dim border-slate-200 dark:border-dash-border',
};

export default async function SupportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !await isAdminUser(supabase, user.id)) redirect(adminPath('/login'));

  const db = createAdminClient();

  const { data: threads } = await db
    .from('support_threads')
    .select('id, user_id, status, priority, tags, subject, created_at, last_message_at, sla_due_at, breach_at, escalated_at, assignee_id')
    .not('escalated_at', 'is', null)
    .not('status', 'in', '("resolved","closed")')
    .order('priority', { ascending: true })
    .order('last_message_at', { ascending: false })
    .limit(100);

  const pendingCount = (threads ?? []).length;
  const breachedCount = (threads ?? []).filter((t) => t.breach_at).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-v-primary tracking-tight">Suporte</h1>
          <p className="text-sm text-slate-500 dark:text-v-secondary mt-1">
            Fila de tickets escalados. SLAs: P0=15min / P1=2h / P2=8h / P3=24h.
          </p>
        </div>
        <div className="flex gap-2">
          {breachedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs bg-red-500/10 text-red-400 border border-red-500/30 rounded-md px-2 py-1 font-semibold">
              <AlertTriangle className="w-3 h-3" />
              {breachedCount} SLA breach{breachedCount !== 1 ? 'es' : ''}
            </span>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up-1">
        {[
          { label: 'Abertos', value: pendingCount },
          { label: 'SLA breach', value: breachedCount },
          { label: 'P0 / P1', value: (threads ?? []).filter((t) => t.priority === 'P0' || t.priority === 'P1').length },
          { label: 'Não atribuídos', value: (threads ?? []).filter((t) => !t.assignee_id).length },
        ].map((k) => (
          <div key={k.label} className="bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl p-4 flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-slate-400 dark:text-v-dim" />
            <div>
              <p className="text-xs text-slate-500 dark:text-v-dim">{k.label}</p>
              <p className="text-xl font-bold text-slate-800 dark:text-v-primary">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Ticket table */}
      <div className="animate-fade-in-up-2 bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl shadow-sm overflow-hidden">
        {(threads ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-v-dim">
            <MessageSquare className="w-8 h-8 mb-3 opacity-30" />
            <p className="text-sm">Nenhum ticket escalado pendente.</p>
            <p className="text-xs mt-1 text-center max-w-xs">
              Quando o chatbot (M-006) escalar tickets, eles aparecerão aqui ordenados por prioridade + SLA restante.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-dash-border">
                  {['Prior.', 'Assunto', 'User', 'SLA', 'Tags', 'Aberto'].map((h) => (
                    <th key={h} className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(threads ?? []).map((t) => {
                  const slaDue = t.sla_due_at ? new Date(t.sla_due_at as string) : null;
                  const isBreached = !!t.breach_at;
                  const slaMins = slaDue ? Math.round((slaDue.getTime() - Date.now()) / 60_000) : null;

                  return (
                    <tr key={t.id as string} className={`border-b border-slate-50 dark:border-dash-border/50 hover:bg-slate-50 dark:hover:bg-dash-surface/50 ${isBreached ? 'bg-red-50/40 dark:bg-red-900/10' : ''}`}>
                      <td className="py-3 px-4">
                        {t.priority ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${PRIORITY_CLASSES[t.priority as string] ?? PRIORITY_CLASSES.P3}`}>
                            {String(t.priority)}
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-xs font-medium text-slate-700 dark:text-v-primary truncate max-w-[200px]">
                          {String(t.subject ?? 'Sem assunto')}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-400">{String(t.user_id as string).slice(0, 8)}…</td>
                      <td className="py-3 px-4">
                        {isBreached ? (
                          <span className="text-xs text-red-500 font-semibold">BREACH</span>
                        ) : slaMins !== null ? (
                          <span className={`text-xs ${slaMins < 30 ? 'text-amber-500 font-semibold' : 'text-slate-400 dark:text-v-dim'}`}>
                            {slaMins > 0 ? `${slaMins}min` : 'expirado'}
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {((t.tags as string[]) ?? []).map((tag) => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-dash-surface text-slate-500 dark:text-v-dim">{tag}</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-400">
                        {new Date(t.created_at as string).toLocaleDateString('pt-BR')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
