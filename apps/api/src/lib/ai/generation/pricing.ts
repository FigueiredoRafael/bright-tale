/**
 * Generation-layer pricing helpers.
 *
 * applyProviderDiscount: When the user runs everything locally via Ollama,
 * infrastructure cost is zero — charge nothing in internal credits either.
 * Any other provider hits a paid API and is billed at full rate.
 */
export function applyProviderDiscount(cost: number, provider?: string): number {
  if (provider === 'ollama') return 0;
  return cost;
}
