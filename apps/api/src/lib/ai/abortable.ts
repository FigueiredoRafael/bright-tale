import { NonRetriableError } from 'inngest'
import type { SupabaseClient } from '@supabase/supabase-js'

export class JobAborted extends NonRetriableError {
  noRetry = true

  constructor(projectId: string, draftId?: string) {
    super(`Job aborted for project ${projectId}${draftId ? `, draft ${draftId}` : ''}`)
    this.name = 'JobAborted'
  }
}

export async function assertNotAborted(
  projectId: string | undefined,
  draftId: string | undefined,
  sb: SupabaseClient,
): Promise<void> {
  if (!projectId) return
  const { data } = await sb.from('projects')
    .select('abort_requested_at')
    .eq('id', projectId)
    .maybeSingle()
  if (data?.abort_requested_at) throw new JobAborted(projectId, draftId)
}

export function sleepCancellable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const t = setTimeout(() => resolve(), ms)
    const onAbort = () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
