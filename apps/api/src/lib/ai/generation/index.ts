/**
 * Shared generation primitives — re-exported for convenience.
 *
 * Import from here or directly from the sub-modules.
 */
export { formatConstraintsBlock } from './constraints.js';
export { applyProviderDiscount } from './pricing.js';
export { STAGE_CHANNEL_SELECT } from './channel-select.js';
export {
  normalizeReviewFeedback,
  type NormalizedReviewFeedback,
  type NormalizeReviewFeedbackParams,
} from './review-feedback.js';
export {
  loadGenerationContext,
  type GenerationContext,
} from './context.js';
export {
  buildStageSystemPrompt,
  buildStageUserMessage,
  deriveEffectiveProductionParams,
  type StageUserMessageParams,
} from './assembly.js';
