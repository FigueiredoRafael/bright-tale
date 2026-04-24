export interface ResearchSignals {
  primaryKeyword?: string
  secondaryKeywords?: string[]
  searchIntent?: string
}

export function extractResearchSignals(findings: unknown): ResearchSignals {
  if (!findings || typeof findings !== 'object') return {}
  const f = findings as Record<string, unknown>
  const seo = f.seo as Record<string, unknown> | undefined
  if (!seo) return {}

  const secondaryKeywords = Array.isArray(seo.secondary_keywords)
    ? (seo.secondary_keywords as Array<Record<string, unknown>>)
        .map((k) => k.keyword as string)
        .filter(Boolean)
    : undefined

  return {
    primaryKeyword: typeof seo.primary_keyword === 'string' ? seo.primary_keyword : undefined,
    secondaryKeywords,
    searchIntent: typeof seo.search_intent === 'string' ? seo.search_intent : undefined,
  }
}
