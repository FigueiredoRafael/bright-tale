import type { AutopilotConfig } from '@brighttale/shared'

export interface BrainstormHydration {
  mode: 'topic_driven' | 'reference_guided'
  topic: string
  referenceUrl: string
  niche: string
  tone: string
  audience: string
  goal: string
  constraints: string
  provider: string | null
  model: string | null
}

export function hydrateBrainstormFromConfig(
  config: AutopilotConfig | null,
): Partial<BrainstormHydration> {
  if (!config?.brainstorm) return {}
  const b = config.brainstorm
  return {
    mode: b.mode,
    topic: b.topic ?? '',
    referenceUrl: b.referenceUrl ?? '',
    niche: b.niche ?? '',
    tone: b.tone ?? '',
    audience: b.audience ?? '',
    goal: b.goal ?? '',
    constraints: b.constraints ?? '',
    provider: b.providerOverride ?? null,
    model: b.modelOverride ?? null,
  }
}

export interface ResearchHydration {
  researchDepth: 'surface' | 'medium' | 'deep'
  provider: string | null
  model: string | null
}

export function hydrateResearchFromConfig(
  config: AutopilotConfig | null,
): Partial<ResearchHydration> {
  if (!config?.research) return {}
  return {
    researchDepth: config.research.depth,
    provider: config.research.providerOverride ?? null,
    model: config.research.modelOverride ?? null,
  }
}

export interface DraftHydration {
  format: 'blog' | 'video' | 'shorts' | 'podcast'
  wordCount: number | null
  selectedPersonaId: string | null
  provider: string | null
  model: string | null
  canonicalCoreProvider: string | null
  canonicalCoreModel: string | null
}

export function hydrateDraftFromConfig(
  config: AutopilotConfig | null,
): Partial<DraftHydration> {
  if (!config?.draft) return {}
  return {
    format: config.draft.format,
    wordCount: config.draft.wordCount ?? null,
    selectedPersonaId: config.canonicalCore?.personaId ?? null,
    provider: config.draft.providerOverride ?? null,
    model: config.draft.modelOverride ?? null,
    canonicalCoreProvider: config.canonicalCore?.providerOverride ?? null,
    canonicalCoreModel: config.canonicalCore?.modelOverride ?? null,
  }
}

export interface ReviewHydration {
  maxIterations: number
  autoApproveThreshold: number
  hardFailThreshold: number
  provider: string | null
  model: string | null
}

export function hydrateReviewFromConfig(
  config: AutopilotConfig | null,
): Partial<ReviewHydration> {
  if (!config?.review) return {}
  return {
    maxIterations: config.review.maxIterations,
    autoApproveThreshold: config.review.autoApproveThreshold,
    hardFailThreshold: config.review.hardFailThreshold,
    provider: config.review.providerOverride ?? null,
    model: config.review.modelOverride ?? null,
  }
}
