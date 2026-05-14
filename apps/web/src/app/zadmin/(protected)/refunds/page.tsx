import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';
import { redirect } from 'next/navigation';
import { adminPath } from '@/lib/admin-path';

export const dynamic = 'force-dynamic';

interface RefundAuditRow {
  id: string;
  user_id: string;
  payment_id: string | null;
  amount_usd_cents: number;
  decision: string;
  rule_matched: string | null;
  used_pct: number | null;
  fraud_score: number;
  fraud_signals: Record<string, unknown> | null;
  decided_at: string;
  decided_by: string | null;
}

interface RefundListResponse {
  data: {
    items: RefundAuditRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } | null;
  error: { code: string; message: string } | null;
}

async function fetchRefunds(page = 1): Promise<RefundListResponse['data']> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const apiBase = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
  const res = await fetch(
    `${apiBase}/admin/refunds?page=${page}&limit=20`,
    {
      method: 'GET',
      headers: {
        'X-Internal-Key': process.env.INTERNAL_API_KEY ?? '',
        'x-user-id': user.id,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    },
  );

  const body = (await res.json()) as RefundListResponse;
  if (body.error || !body.data) return null;
  return body.data;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCents(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

const DECISION_COLORS: Record<string, string> = {
  approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  denied: 'bg-red-500/15 text-red-400 border-red-500/30',
  pending_review: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

function DecisionBadge({ decision }: { decision: string }) {
  const color = DECISION_COLORS[decision] ?? 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${color}`}
    >
      {decision}
    </span>
  );
}

export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(adminPath('/login'));
  if (!(await isAdminUser(supabase, user.id))) redirect(adminPath('/'));

  const sp = await searchParams;
  const rawPage = typeof sp.page === 'string' ? parseInt(sp.page, 10) : 1;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const result = await fetchRefunds(page);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground,#e6edf7)]">Reembolsos</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground,#8b98b0)]">
          Histórico de reembolsos automáticos (M-007). Cada usuário tem direito a 1 reembolso
          vitalício se dentro de 7 dias e com menos de 10% dos créditos utilizados.
        </p>
      </header>

      {result && (
        <div className="mb-4 flex items-center justify-between text-sm text-[var(--muted-foreground,#8b98b0)]">
          <span>
            {result.total} registro{result.total !== 1 ? 's' : ''} •{' '}
            Página {result.page} de {result.totalPages}
          </span>
          {result.totalPages > 1 && (
            <div className="flex gap-2">
              {page > 1 && (
                <a
                  href={`?page=${page - 1}`}
                  className="rounded border border-[var(--border,#263146)] px-3 py-1 text-xs hover:bg-[var(--card,#121826)]"
                >
                  Anterior
                </a>
              )}
              {page < result.totalPages && (
                <a
                  href={`?page=${page + 1}`}
                  className="rounded border border-[var(--border,#263146)] px-3 py-1 text-xs hover:bg-[var(--card,#121826)]"
                >
                  Próxima
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {!result || result.items.length === 0 ? (
        <div className="rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)] p-12 text-center text-sm text-[var(--muted-foreground,#8b98b0)]">
          Nenhum reembolso registrado ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)]/50 text-left text-xs uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
                <th className="px-4 py-3 font-semibold">Usuário</th>
                <th className="px-4 py-3 font-semibold">Decisão</th>
                <th className="px-4 py-3 font-semibold">Valor</th>
                <th className="px-4 py-3 font-semibold">Uso (%)</th>
                <th className="px-4 py-3 font-semibold">Fraud Score</th>
                <th className="px-4 py-3 font-semibold">Regra</th>
                <th className="px-4 py-3 font-semibold">Data</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--border,#263146)] last:border-0 hover:bg-[var(--background,#0a0e1a)]/30"
                >
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-[var(--foreground,#e6edf7)]">
                      {row.user_id.slice(0, 8)}…
                    </div>
                    {row.payment_id && (
                      <div className="text-xs text-[var(--muted-foreground,#8b98b0)]">
                        {row.payment_id.slice(0, 20)}…
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <DecisionBadge decision={row.decision} />
                  </td>
                  <td className="px-4 py-3 font-medium text-[var(--foreground,#e6edf7)]">
                    {formatCents(row.amount_usd_cents)}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground,#8b98b0)]">
                    {row.used_pct !== null ? `${Number(row.used_pct).toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-medium ${
                        row.fraud_score >= 50
                          ? 'text-red-400'
                          : row.fraud_score >= 20
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {row.fraud_score}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted-foreground,#8b98b0)]">
                    {row.rule_matched ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted-foreground,#8b98b0)]">
                    {formatDate(row.decided_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
