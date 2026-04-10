/**
 * Video module mapper
 * Transforms CanonicalCore (+ optional VideoStyleConfig) into the input
 * object for the video format agent.
 */

import type {
  CanonicalCore,
  CanonicalCoreArgumentStep,
  CanonicalCoreStat,
  CanonicalCoreEmotionalArc,
} from "@brighttale/shared/types/agents";
import type { VideoStyleConfigInput } from "@brighttale/shared/schemas/videoStyle";

export interface VideoAgentInput {
  idea_id: string;
  thesis: string;
  argument_chain: CanonicalCoreArgumentStep[];
  emotional_arc: CanonicalCoreEmotionalArc;
  key_stats: CanonicalCoreStat[];
  key_quotes?: CanonicalCore["key_quotes"];
  affiliate_context?: {
    trigger_context: string;
    product_angle: string;
    cta_primary: string;
  };
  cta_subscribe?: string;
  cta_comment_prompt?: string;
  video_style_config?: VideoStyleConfigInput;
}

export function mapCanonicalCoreToVideoInput(
  core: CanonicalCore,
  videoStyleConfig?: VideoStyleConfigInput,
): VideoAgentInput {
  return {
    idea_id: core.idea_id,
    thesis: core.thesis,
    argument_chain: core.argument_chain,
    emotional_arc: core.emotional_arc,
    key_stats: core.key_stats,
    key_quotes: core.key_quotes,
    affiliate_context: core.affiliate_moment
      ? {
          trigger_context: core.affiliate_moment.trigger_context,
          product_angle: core.affiliate_moment.product_angle,
          cta_primary: core.affiliate_moment.cta_primary,
        }
      : undefined,
    cta_subscribe: core.cta_subscribe,
    cta_comment_prompt: core.cta_comment_prompt,
    video_style_config: videoStyleConfig,
  };
}
