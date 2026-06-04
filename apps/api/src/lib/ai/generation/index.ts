/**
 * Shared generation primitives — re-exported for convenience.
 *
 * Import from here or directly from the sub-modules.
 *
 * Consolidation topology (BRI-137). The production stage keeps TWO Inngest
 * triggers over this single shared core rather than collapsing into one
 * function — the worker path and the dispatcher path have distinct lifecycle
 * and outcome semantics (step-by-step vs auto-pilot):
 *   - canonical:  production/generate (worker) + pipeline canonical dispatch
 *   - produce:    production/produce  (worker) + pipeline production dispatch
 * Plus the manual content-drafts routes (canonical-core / produce / reproduce).
 * All of the above build prompts via buildStageUserMessage / buildStageSystemPrompt
 * and load context via STAGE_CHANNEL_SELECT (+ loadGenerationContext), so
 * persona, channel, idea, review-feedback normalization and the
 * video_style → channel_type derivation behave identically across every path.
 * The lone exception is jobs/content-generate.ts (legacy F2-014 full-pipeline
 * flow) — see its header for why it is intentionally left out.
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
