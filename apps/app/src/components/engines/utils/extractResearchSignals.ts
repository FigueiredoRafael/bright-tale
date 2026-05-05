export interface ResearchSignals {
  primaryKeyword?: string
  secondaryKeywords?: string[]
  searchIntent?: string
  confidenceScore?: number
  evidenceStrength?: string
  sourceCount?: number
  expertQuoteCount?: number
  researchSummary?: string
  pivotRecommendation?: string
}

export function extractResearchSignals(findings: unknown): ResearchSignals {
  if (!findings || typeof findings !== 'object') return {}
  const f = findings as Record<string, unknown>
  const seo = f.seo as Record<string, unknown> | undefined

  const secondaryKeywords =
    seo && Array.isArray(seo.secondary_keywords)
      ? (seo.secondary_keywords as Array<Record<string, unknown>>)
          .map((k) => k.keyword as string)
          .filter(Boolean)
      : undefined

  const validation = f.idea_validation as Record<string, unknown> | undefined
  const refinedAngle = f.refined_angle as Record<string, unknown> | undefined

  return {
    primaryKeyword: seo && typeof seo.primary_keyword === 'string' ? seo.primary_keyword : undefined,
    secondaryKeywords,
    searchIntent: seo && typeof seo.search_intent === 'string' ? seo.search_intent : undefined,
    confidenceScore: validation && typeof validation.confidence_score === 'number' ? validation.confidence_score : undefined,
    evidenceStrength: validation && typeof validation.evidence_strength === 'string' ? validation.evidence_strength : undefined,
    sourceCount: Array.isArray(f.sources) ? (f.sources as unknown[]).length : undefined,
    expertQuoteCount: Array.isArray(f.expert_quotes) ? (f.expert_quotes as unknown[]).length : undefined,
    researchSummary: typeof f.research_summary === 'string' ? f.research_summary : undefined,
    pivotRecommendation: refinedAngle && typeof refinedAngle.recommendation === 'string' ? refinedAngle.recommendation as string : undefined,
  }
}
