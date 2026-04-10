/**
 * Podcast module mapper
 * Transforms a CanonicalCore into the input object for the podcast format agent.
 * Podcast talking points map directly from the argument chain steps.
 * Expert quotes are the primary citation vehicle for podcast format.
 */

import type {
  CanonicalCore,
  CanonicalCoreEmotionalArc,
  CanonicalCoreStat,
  CanonicalCoreQuote,
} from "@brighttale/shared/types/agents";

export interface TalkingPointSeed {
  step: number;
  claim: string;
  evidence: string;
}

export interface PodcastAgentInput {
  idea_id: string;
  thesis: string;
  /** Argument steps → seed talking points for the podcast */
  talking_point_seeds: TalkingPointSeed[];
  emotional_arc: CanonicalCoreEmotionalArc;
  key_stats: CanonicalCoreStat[];
  key_quotes?: CanonicalCoreQuote[];
  cta_subscribe?: string;
  cta_comment_prompt?: string;
}

export function mapCanonicalCoreToPodcastInput(core: CanonicalCore): PodcastAgentInput {
  return {
    idea_id: core.idea_id,
    thesis: core.thesis,
    talking_point_seeds: core.argument_chain.map((step) => ({
      step: step.step,
      claim: step.claim,
      evidence: step.evidence,
    })),
    emotional_arc: core.emotional_arc,
    key_stats: core.key_stats,
    key_quotes: core.key_quotes,
    cta_subscribe: core.cta_subscribe,
    cta_comment_prompt: core.cta_comment_prompt,
  };
}
