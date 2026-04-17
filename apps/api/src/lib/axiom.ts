/**
 * Axiom structured logging for the API.
 *
 * Provides a thin wrapper around @axiomhq/js for sending
 * structured log events (AI usage, request traces, business events).
 *
 * Usage:
 *   import { axiom, logAiUsage } from '@/lib/axiom';
 *   logAiUsage({ userId, model, inputTokens, outputTokens, ... });
 */
import { Axiom } from '@axiomhq/js';

const DATASET = process.env.AXIOM_DATASET ?? 'brighttale-api';

let _axiom: Axiom | null = null;

function getAxiom(): Axiom | null {
  if (!process.env.AXIOM_TOKEN) return null;
  if (!_axiom) {
    _axiom = new Axiom({ token: process.env.AXIOM_TOKEN });
  }
  return _axiom;
}

interface LogEvent {
  [key: string]: unknown;
}

/**
 * Ingest a structured event into Axiom.
 * No-ops silently when AXIOM_TOKEN is not set (local dev).
 */
export function ingest(event: LogEvent): void {
  const client = getAxiom();
  if (!client) return;
  client.ingest(DATASET, [{ ...event, _time: new Date().toISOString() }]);
}

/**
 * Flush pending events to Axiom. Call on shutdown or after critical events.
 */
export async function flushAxiom(): Promise<void> {
  const client = getAxiom();
  if (!client) return;
  await client.flush();
}

interface AiUsageEvent {
  userId: string;
  orgId?: string;
  action: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number;
  durationMs: number;
  status: 'success' | 'error';
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an AI provider call with token usage.
 */
export function logAiUsage(event: AiUsageEvent): void {
  ingest({ type: 'ai_usage', ...event });
}

interface RequestEvent {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userId?: string;
  orgId?: string;
  requestId?: string;
}

/**
 * Log an API request/response.
 */
export function logRequest(event: RequestEvent): void {
  ingest({ type: 'request', ...event });
}
