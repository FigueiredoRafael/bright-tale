/**
 * F2-049 — Persist per-call AI usage to usage_events.
 */
import { createServiceClient } from '../supabase/index.js';
import { estimateCostUsd } from './pricing.js';
import type { TokenUsage } from './provider.js';

export interface UsageLogInput {
  orgId: string;
  userId?: string | null;
  channelId?: string | null;
  stage: string;
  subStage?: string;
  sessionId?: string | null;
  sessionType?: 'brainstorm' | 'research' | 'production';
  provider: string;
  model: string;
  usage?: TokenUsage;
}

export async function logUsage(input: UsageLogInput): Promise<void> {
  // Skip if the provider didn't report usage (Ollama when offline, older SDK).
  const inputTokens = input.usage?.inputTokens ?? 0;
  const outputTokens = input.usage?.outputTokens ?? 0;
  if (inputTokens === 0 && outputTokens === 0 && input.provider !== 'ollama') return;

  const sb = createServiceClient();
  const cost = estimateCostUsd(input.provider, input.model, inputTokens, outputTokens);

  await (sb.from('usage_events') as unknown as {
    insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
  }).insert({
    org_id: input.orgId,
    user_id: input.userId ?? null,
    channel_id: input.channelId ?? null,
    stage: input.stage,
    sub_stage: input.subStage ?? null,
    session_id: input.sessionId ?? null,
    session_type: input.sessionType ?? null,
    provider: input.provider,
    model: input.model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: cost,
  });
}
