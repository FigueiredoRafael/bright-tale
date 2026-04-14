/**
 * F2-049 — Model pricing in USD per 1M tokens (2025 retail prices).
 * Used to convert raw token counts into dollar cost for usage tracking.
 * Update this table as providers change prices.
 */

export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

const PRICING: Record<string, ModelPrice> = {
  // Anthropic
  'claude-opus-4-5-20250514': { inputPerMillion: 15, outputPerMillion: 75 },
  'claude-sonnet-4-5-20250514': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-haiku-4-5-20251001': { inputPerMillion: 0.8, outputPerMillion: 4 },
  'claude-3-5-sonnet-20241022': { inputPerMillion: 3, outputPerMillion: 15 },

  // OpenAI
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'o1-mini': { inputPerMillion: 3, outputPerMillion: 12 },

  // Gemini
  'gemini-2.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5 },
};

const DEFAULT: ModelPrice = { inputPerMillion: 0, outputPerMillion: 0 };

export function priceFor(model: string): ModelPrice {
  return PRICING[model] ?? DEFAULT;
}

export function estimateCostUsd(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  // Local models are free.
  if (provider === 'ollama') return 0;
  const p = priceFor(model);
  return (inputTokens / 1_000_000) * p.inputPerMillion + (outputTokens / 1_000_000) * p.outputPerMillion;
}
