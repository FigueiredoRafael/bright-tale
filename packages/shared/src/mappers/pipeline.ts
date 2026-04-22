/**
 * Pipeline-stage mappers for content workflow handoff.
 * Handles forward-compatibility during schema transitions.
 */

/**
 * Coerce secondary_keywords from either legacy string[] shape or new
 * { keyword, source_id }[] shape to string[] for downstream consumers.
 * Used during 30-day compat window for Research output schema change.
 */
export function legacyKeywordFallback(keywords: unknown): string[] {
  if (!Array.isArray(keywords)) return [];
  return keywords
    .map((k) => {
      if (typeof k === 'string') return k;
      if (k && typeof k === 'object' && 'keyword' in k && typeof (k as { keyword: unknown }).keyword === 'string') {
        return (k as { keyword: string }).keyword;
      }
      return null;
    })
    .filter((k): k is string => k !== null);
}
