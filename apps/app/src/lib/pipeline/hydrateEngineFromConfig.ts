import type { AutopilotConfig } from '@brighttale/shared'
import { MODELS_BY_PROVIDER, type ProviderId } from '@/components/ai/ModelPicker'

function resolveModel(provider: string | null, modelOverride: string | null): string | null {
  if (modelOverride) return modelOverride
  if (provider) return MODELS_BY_PROVIDER[provider as ProviderId]?.[0]?.id ?? null
  return null
}

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
  const provider = b.providerOverride ?? null
  const model = resolveModel(provider, b.modelOverride ?? null)
  return {
    mode: b.mode,
    topic: b.topic ?? '',
    referenceUrl: b.referenceUrl ?? '',
    niche: b.niche ?? '',
    tone: b.tone ?? '',
    audience: b.audience ?? '',
    goal: b.goal ?? '',
    constraints: b.constraints ?? '',
    provider,
    model,
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
  const provider = config.research.providerOverride ?? null
  const model = resolveModel(provider, config.research.modelOverride ?? null)
  return {
    researchDepth: config.research.depth,
    provider,
    model,
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
  const provider = config.draft.providerOverride ?? null
  const model = resolveModel(provider, config.draft.modelOverride ?? null)
  const canonicalCoreProvider = config.canonicalCore?.providerOverride ?? null
  const canonicalCoreModel = resolveModel(canonicalCoreProvider, config.canonicalCore?.modelOverride ?? null)
  return {
    format: config.draft.format,
    wordCount: config.draft.wordCount ?? null,
    selectedPersonaId: config.canonicalCore?.personaId ?? null,
    provider,
    model,
    canonicalCoreProvider,
    canonicalCoreModel,
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
  const provider = config.review.providerOverride ?? null
  const model = resolveModel(provider, config.review.modelOverride ?? null)
  return {
    maxIterations: config.review.maxIterations,
    autoApproveThreshold: config.review.autoApproveThreshold,
    hardFailThreshold: config.review.hardFailThreshold,
    provider,
    model,
  }
}
