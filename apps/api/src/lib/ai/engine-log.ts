/**
 * Fire-and-forget logging of full LLM input/output payloads to engine_logs.
 * Must never block or break the generation pipeline.
 */
import { createServiceClient } from '../supabase/index.js';

export interface EngineLogEntry {
  userId: string;
  orgId?: string | null;
  projectId?: string | null;
  channelId?: string | null;
  sessionId?: string | null;
  sessionType: string;
  stage: string;
  provider: string;
  model: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

export function logEngineCall(entry: EngineLogEntry): void {
  const sb = createServiceClient();
  (sb.from('engine_logs') as unknown as {
    insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
  }).insert({
    user_id: entry.userId,
    org_id: entry.orgId ?? null,
    project_id: entry.projectId ?? null,
    channel_id: entry.channelId ?? null,
    session_id: entry.sessionId ?? null,
    session_type: entry.sessionType,
    stage: entry.stage,
    provider: entry.provider,
    model: entry.model,
    input_json: entry.input,
    output_json: entry.output ?? null,
    duration_ms: entry.durationMs,
    input_tokens: entry.inputTokens ?? null,
    output_tokens: entry.outputTokens ?? null,
    error: entry.error ?? null,
  }).catch((err: unknown) => {
    console.warn('[engine-log] failed to write engine log:', err);
  });
}
