/**
 * F2-036 — Job progress event emitter.
 * Writes progress events to job_events; consumed via SSE by the frontend.
 */
import { createServiceClient } from '../lib/supabase/index.js';

export type SessionType = 'brainstorm' | 'research' | 'production';
export type JobStage =
  | 'queued'
  | 'loading_prompt'
  | 'calling_provider'
  | 'parsing_output'
  | 'saving'
  | 'completed'
  | 'failed'
  | 'aborted';

export async function emitJobEvent(
  sessionId: string,
  sessionType: SessionType,
  stage: JobStage,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const sb = createServiceClient();
  await (sb.from('job_events') as unknown as {
    insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
  }).insert({
    session_id: sessionId,
    session_type: sessionType,
    stage,
    message,
    metadata: metadata ?? null,
  });
}
