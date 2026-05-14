/**
 * Per-provider concurrency caps for outbound LLM calls.
 *
 * Multi-track autopilot fans out N parallel stage_runs (one per Track). Without
 * a cap, free-tier Gemini 429s on the second concurrent request. The numbers
 * below target each provider's free / lowest-tier RPM so a single user pod
 * never self-DOSes; paid tiers can lift the floor via env var override.
 *
 * Override at deploy time: `AI_MAX_CONCURRENT_<PROVIDER>=8` (uppercased
 * provider name). Invalid / non-positive values fall back to defaults.
 */

const DEFAULTS: Record<string, number> = {
  // Free tier: 15 RPM. At ~7s/request → 2 concurrent stays under the cap.
  gemini: 2,
  // Tier 1 keys: 500 RPM. 4 concurrent is conservative; raise via env.
  openai: 4,
  anthropic: 4,
  // Local — single-process Ollama serializes anyway; keep 1 so we don't
  // queue requests at the HTTP layer.
  ollama: 1,
  // Mock provider (test path): no real network, no cap needed.
  mock: 32,
};

const FALLBACK_DEFAULT = 2;

export function getMaxConcurrent(provider: string, _model?: string): number {
  const envKey = `AI_MAX_CONCURRENT_${provider.toUpperCase()}`;
  const envRaw = process.env[envKey];
  if (envRaw !== undefined) {
    const parsed = Number(envRaw);
    if (Number.isFinite(parsed) && parsed >= 1) return Math.floor(parsed);
  }
  return DEFAULTS[provider] ?? FALLBACK_DEFAULT;
}
