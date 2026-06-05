/**
 * Shared prompt assembly layer.
 *
 * buildStageSystemPrompt: combine agent instructions with persona constraints.
 * buildStageUserMessage:  route to the correct production.ts builder based on
 *   stage (canonical | produce | reproduce), enriching with persona voice,
 *   review feedback, iteration count, and prior review attempts.
 *
 * Also handles the video_style → video_style_config.channel_type derivation
 * that was previously only done in production-produce.ts. Moving it here
 * ensures both the async worker path AND the pipeline dispatcher path apply it
 * uniformly (fixing a latent bug in pipeline-production-dispatch which loaded
 * video_style from the channel but never derived channel_type from it).
 */
import {
  buildCanonicalCoreMessage,
  buildProduceMessage,
  buildReproduceMessage,
} from '../prompts/production.js';
import { formatConstraintsBlock } from './constraints.js';
import type { GenerationContext } from './context.js';
import type { NormalizedReviewFeedback } from './review-feedback.js';
import type { PriorReviewAttempt } from '../prompts/review.js';

export interface StageUserMessageParams {
  stage: 'canonical' | 'produce' | 'reproduce';
  ctx: GenerationContext;
  /** For produce/reproduce: extra params (video_style_config, etc.) */
  productionParams?: Record<string, unknown> | null;
  /** For reproduce: normalized review feedback */
  reviewFeedback?: NormalizedReviewFeedback;
  /** For reproduce: current iteration number (1-based) */
  iterationCount?: number;
  /** For reproduce: prior review attempt objects */
  priorAttempts?: PriorReviewAttempt[];
}

/**
 * Derive video_style_config.channel_type from channels.video_style when the
 * caller didn't set it explicitly.
 *
 * channel.video_style enum: face | dark | hybrid
 * → videoStyleConfig.channel_type: presenter | dark
 *
 * This derivation was previously ONLY in production-produce.ts (async worker).
 * By moving it here, pipeline-production-dispatch (which already loaded
 * video_style via STAGE_CHANNEL_SELECT) also benefits — fixing a latent bug
 * where auto-pilot produce never set channel_type.
 */
export function deriveEffectiveProductionParams(
  type: string,
  channel: Record<string, unknown> | null,
  productionParams: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (type !== 'video' || !channel) return productionParams ?? null;
  const channelStyle = channel.video_style;
  const derivedChannelType =
    channelStyle === 'dark'
      ? 'dark'
      : channelStyle === 'face' || channelStyle === 'hybrid'
        ? 'presenter'
        : null;
  if (!derivedChannelType) return productionParams ?? null;
  const params = { ...(productionParams ?? {}) } as Record<string, unknown>;
  const styleConfig = { ...((params.video_style_config as Record<string, unknown> | undefined) ?? {}) };
  if (!styleConfig.channel_type) styleConfig.channel_type = derivedChannelType;
  params.video_style_config = styleConfig;
  return params;
}

/**
 * Build the system prompt: prepend constraints block (if any) to agent instructions.
 */
export function buildStageSystemPrompt(
  agentInstructions: string | null | undefined,
  constraints: string[],
): string {
  const base = agentInstructions ?? '';
  return constraints.length > 0 ? `${formatConstraintsBlock(constraints)}${base}` : base;
}

/**
 * Build the user message for a given stage, routing to the correct builder.
 */
export function buildStageUserMessage(params: StageUserMessageParams): string {
  const { stage, ctx, productionParams, reviewFeedback, iterationCount, priorAttempts } = params;
  const { draft, layeredPersona, channel, idea, researchCards } = ctx;

  const channelShape = channel as
    | { name?: string; niche?: string; language?: string; tone?: string }
    | undefined
    | null;

  if (stage === 'canonical') {
    return buildCanonicalCoreMessage({
      type: draft.type as string,
      title: draft.title as string,
      ideaId: draft.idea_id as string | undefined,
      idea,
      researchCards: researchCards ?? undefined,
      productionParams,
      personaContext: layeredPersona?.context ?? null,
      channel: channelShape ?? undefined,
    });
  }

  const draftTitle =
    (draft.title as string) ??
    ((draft.draft_json as Record<string, unknown> | null)?.title as string | undefined) ??
    '';

  if (stage === 'reproduce' && reviewFeedback) {
    return buildReproduceMessage({
      type: draft.type as string,
      title: draftTitle,
      canonicalCore: draft.canonical_core_json,
      previousDraft: draft.draft_json,
      idea,
      reviewFeedback,
      iterationCount,
      priorAttempts,
      persona: layeredPersona?.voice ?? null,
      channel: channelShape ?? undefined,
    });
  }

  // produce (or reproduce without feedback → fall through to fresh produce)
  const effectiveParams = deriveEffectiveProductionParams(
    draft.type as string,
    channel,
    productionParams,
  );

  const approvedCardsObj =
    researchCards && typeof researchCards === 'object' && !Array.isArray(researchCards)
      ? (researchCards as Record<string, unknown>)
      : null;
  const researchSources =
    (draft.type as string) === 'blog' && approvedCardsObj?.sources
      ? (approvedCardsObj.sources as unknown[])
      : undefined;

  return buildProduceMessage({
    type: draft.type as string,
    title: draftTitle,
    canonicalCore: draft.canonical_core_json,
    idea,
    productionParams: effectiveParams ?? undefined,
    sources: researchSources,
    persona: layeredPersona?.voice ?? null,
    channel: channelShape ?? undefined,
  });
}
