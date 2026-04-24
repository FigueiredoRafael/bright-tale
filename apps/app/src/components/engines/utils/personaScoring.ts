import type { Persona } from '@brighttale/shared/types/agents'

interface ScoringContext {
  ideaTitle?: string
  ideaCoreTension?: string
  researchPrimaryKeyword?: string
  researchSecondaryKeywords?: string[]
  researchSearchIntent?: string
}

interface IdeaSignals {
  affiliateAngle?: string
  productCategories?: string[]
}

export function scorePersonaForContent(
  persona: Persona,
  context: ScoringContext,
  idea: IdeaSignals | undefined
): number {
  const signals = [
    context.ideaTitle ?? '',
    context.ideaCoreTension ?? '',
    context.researchPrimaryKeyword ?? '',
    ...(context.researchSecondaryKeywords ?? []),
    context.researchSearchIntent ?? '',
    idea?.affiliateAngle ?? '',
    ...(idea?.productCategories ?? []),
  ]
    .join(' ')
    .toLowerCase()

  const personaTerms = [
    ...persona.approvedCategories,
    persona.primaryDomain,
    persona.domainLens,
  ]
    .join(' ')
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3)

  return personaTerms.filter((term) => signals.includes(term)).length
}

export interface RankedPersona {
  persona: Persona
  score: number
  isRecommended: boolean
}

export function rankPersonas(
  personas: Persona[],
  context: ScoringContext,
  idea: IdeaSignals | undefined
): RankedPersona[] {
  const scored = personas.map((persona) => ({
    persona,
    score: scorePersonaForContent(persona, context, idea),
  }))
  // Stable sort: equal scores preserve original order
  scored.sort((a, b) => b.score - a.score)
  const maxScore = scored[0]?.score ?? 0
  return scored.map((item, i) => ({
    ...item,
    isRecommended: maxScore > 0 && i === 0,
  }))
}
