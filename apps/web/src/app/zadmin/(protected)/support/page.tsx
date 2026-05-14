/**
 * M-008 — Support escalation queue (admin page)
 *
 * Fetches escalated + open threads from the API proxy and renders
 * a triage queue with thread status management.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { HeadphonesIcon, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { SupportThreadActions } from './components/support-thread-actions';

export const dynamic = 'force-dynamic';

type Priority = 'P0' | 'P1' | 'P2' | 'P3' | null;
type ThreadStatus = 'open' | 'escalated' | 'resolved' | 'closed';

interface SupportThread {
  id: string;
  user_id: string;
  status: ThreadStatus;
  priority: Priority;
  escalation_summary: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  last_message: string | null;
  message_count: number;
}

async function fetchSupportThreads(): Promise<SupportThread[]> {
  const db = createAdminClient();

  const { data: threads, error } = await db
    .from('support_threads')
    .select('*')
    .in('status', ['escalated', 'open'])
    .order('created_at', { ascending: true });

  if (error) {
    return [];
  }

  if (!threads || threads.length === 0) return [];

  // Fetch last message + message count per thread
  const threadIds = threads.map((t) => t.id as string);

  const { data: messages } = await db
    .from('support_messages')
    .select('thread_id, content, created_at')
    .in('thread_id', threadIds)
    .order('created_at', { ascending: false });

  const lastMsgMap = new Map<string, string>();
  const msgCountMap = new Map<string, number>();

  for (const msg of messages ?? []) {
    const tid = msg.thread_id as string;
    if (!lastMsgMap.has(tid)) {
      lastMsgMap.set(tid, msg.content as string);
    }
    msgCountMap.set(tid, (msgCountMap.get(tid) ?? 0) + 1);
  }

  return threads.map((t) => ({
    id: t.id as string,
    user_id: t.user_id as string,
    status: t.status as ThreadStatus,
    priority: (t.priority as Priority) ?? null,
    escalation_summary: (t.escalation_summary as string | null) ?? null,
    assigned_to: (t.assigned_to as string | null) ?? null,
    created_at: t.created_at as string,
    updated_at: t.updated_at as string,
    last_message: lastMsgMap.get(t.id as string) ?? null,
    message_count: msgCountMap.get(t.id as string) ?? 0,
  }));
}

const PRIORITY_COLORS: Record<NonNullable<Priority>, string> = {
  P0: 'bg-red-500/15 text-red-400 border-red-500/30',
  P1: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  P2: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  P3: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const STATUS_COLORS: Record<ThreadStatus, string> = {
  open: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  escalated: 'bg-red-500/15 text-red-400 border-red-500/30',
  resolved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  closed: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min atrás`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h atrás`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d atrás`;
}

function PriorityBadge({ priority }: { priority: Priority }) {
  if (!priority) return <span className="text-xs text-[var(--muted-foreground,#8b98b0)]">—</span>;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${PRIORITY_COLORS[priority]}`}
    >
      {priority}
    </span>
  );
}

function StatusBadge({ status }: { status: ThreadStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[status]}`}
    >
      {status}
    </span>
  );
}

export default async function SupportPage() {
  const threads = await fetchSupportThreads();

  const escalatedCount = threads.filter((t) => t.status === 'escalated').length;
  const openCount = threads.filter((t) => t.status === 'open').length;
  const p0p1Count = threads.filter(
    (t) => t.priority === 'P0' || t.priority === 'P1',
  ).length;

  const sortedThreads = [...threads].sort((a, b) => {
    const pOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    const pa = a.priority ? (pOrder[a.priority] ?? 99) : 99;
    const pb = b.priority ? (pOrder[b.priority] ?? 99) : 99;
    if (pa !== pb) return pa - pb;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground,#e6edf7)]">
          Fila de Suporte
        </h1>
        <p className="text-[var(--muted-foreground,#8b98b0)] text-sm">
          Threads escaladas e abertas aguardando atendimento humano.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)] p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
            <AlertTriangle className="h-3.5 w-3.5" />
            Escaladas
          </div>
          <div className="mt-1 text-2xl font-bold text-red-400">{escalatedCount}</div>
        </div>
        <div className="rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)] p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
            <Clock className="h-3.5 w-3.5" />
            Abertas
          </div>
          <div className="mt-1 text-2xl font-bold text-blue-400">{openCount}</div>
        </div>
        <div className="rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)] p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
            <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
            P0/P1 críticas
          </div>
          <div className="mt-1 text-2xl font-bold text-orange-400">{p0p1Count}</div>
        </div>
      </div>

      {/* Thread list */}
      {sortedThreads.length === 0 ? (
        <div className="rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)] p-12 text-center">
          <CheckCircle className="mx-auto mb-3 h-8 w-8 text-emerald-400 opacity-50" />
          <p className="text-sm text-[var(--muted-foreground,#8b98b0)]">
            Nenhuma thread na fila. Todos os tickets estão resolvidos!
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)]/50 text-left text-xs uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
                <th className="px-4 py-3 font-semibold">Thread</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Prioridade</th>
                <th className="px-4 py-3 font-semibold">Msgs</th>
                <th className="px-4 py-3 font-semibold">Resumo / Última msg</th>
                <th className="px-4 py-3 font-semibold">Criado</th>
                <th className="px-4 py-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sortedThreads.map((thread) => (
                <tr
                  key={thread.id}
                  className="border-b border-[var(--border,#263146)] last:border-0 hover:bg-[var(--background,#0a0e1a)]/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <HeadphonesIcon className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground,#8b98b0)]" />
                      <span className="font-mono text-xs text-[var(--foreground,#e6edf7)]">
                        {thread.id.slice(-8)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--muted-foreground,#8b98b0)]">
                      uid: {thread.user_id.slice(-8)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={thread.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={thread.priority} />
                  </td>
                  <td className="px-4 py-3 text-center text-[var(--muted-foreground,#8b98b0)]">
                    {thread.message_count}
                  </td>
                  <td className="max-w-xs px-4 py-3">
                    {thread.escalation_summary ? (
                      <p className="truncate text-xs text-[var(--foreground,#e6edf7)]">
                        {thread.escalation_summary}
                      </p>
                    ) : thread.last_message ? (
                      <p className="truncate text-xs text-[var(--muted-foreground,#8b98b0)]">
                        {thread.last_message}
                      </p>
                    ) : (
                      <span className="text-xs text-[var(--muted-foreground,#8b98b0)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted-foreground,#8b98b0)]">
                    {formatDate(thread.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <SupportThreadActions threadId={thread.id} currentStatus={thread.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
