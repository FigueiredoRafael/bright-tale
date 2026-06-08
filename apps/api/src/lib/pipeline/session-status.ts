import type { SupabaseClient } from '@supabase/supabase-js';

type Sb = SupabaseClient<any, any, any>;

export type SessionDtoStatus = 'pending' | 'running' | 'awaiting_manual' | 'completed' | 'failed';

export function mapStageRunToSessionStatus(status: string | null, awaitingReason: string | null): SessionDtoStatus {
  switch (status) {
    case 'queued': return 'pending';
    case 'running': return 'running';
    case 'awaiting_user': return awaitingReason === 'manual_paste' ? 'awaiting_manual' : 'running';
    case 'completed':
    case 'skipped': return 'completed';
    case 'failed':
    case 'aborted': return 'failed';
    default: return 'pending';
  }
}

/** Map a session-DTO status filter to the stage_runs statuses that could yield it. */
export function dtoStatusToStageRunStatuses(dtoStatus: string): string[] {
  switch (dtoStatus) {
    case 'pending': return ['queued'];
    case 'running': return ['running', 'awaiting_user'];
    case 'awaiting_manual': return ['awaiting_user'];
    case 'completed': return ['completed', 'skipped'];
    case 'failed': return ['failed', 'aborted'];
    default: return [dtoStatus];
  }
}

/** Derive session DTO status from the LATEST stage_run for a project+stage. 'pending' if none. */
export async function sessionStatusFromStageRun(sb: Sb, projectId: string, stage: 'brainstorm' | 'research'): Promise<SessionDtoStatus> {
  const { data } = await sb
    .from('stage_runs')
    .select('status, awaiting_reason')
    .eq('project_id', projectId)
    .eq('stage', stage)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return mapStageRunToSessionStatus((data?.status as string | undefined) ?? null, (data?.awaiting_reason as string | undefined) ?? null);
}

/** Batch: latest stage_run status per project_id, in ONE query. */
export async function batchSessionStatusFromStageRuns(sb: Sb, projectIds: string[], stage: 'brainstorm' | 'research'): Promise<Map<string, SessionDtoStatus>> {
  const out = new Map<string, SessionDtoStatus>();
  if (projectIds.length === 0) return out;
  const { data } = await sb
    .from('stage_runs')
    .select('project_id, status, awaiting_reason')
    .in('project_id', projectIds)
    .eq('stage', stage)
    .order('created_at', { ascending: false });
  for (const row of (data ?? []) as Array<{ project_id: string; status: string | null; awaiting_reason: string | null }>) {
    if (!out.has(row.project_id)) out.set(row.project_id, mapStageRunToSessionStatus(row.status, row.awaiting_reason));
  }
  for (const pid of projectIds) if (!out.has(pid)) out.set(pid, 'pending');
  return out;
}
