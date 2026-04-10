/**
 * Shorts module mapper
 * Transforms a CanonicalCore into the input object for the shorts format agent.
 * Shorts derive their hooks primarily from the emotional arc's turning_point
 * and the thesis condensed to a single provocative claim.
 */

import type {
  CanonicalCore,
  CanonicalCoreArgumentStep,
  CanonicalCoreStat,
} from "@/types/agents";

export interface ShortsAgentInput {
  idea_id: string;
  thesis: string;
  /** The moment of insight — primary source for short hooks */
  turning_point: string;
  argument_chain: CanonicalCoreArgumentStep[];
  key_stats: CanonicalCoreStat[];
  cta_subscribe?: string;
  cta_comment_prompt?: string;
}

export function mapCanonicalCoreToShortsInput(core: CanonicalCore): ShortsAgentInput {
  return {
    idea_id: core.idea_id,
    thesis: core.thesis,
    turning_point: core.emotional_arc.turning_point,
    argument_chain: core.argument_chain,
    key_stats: core.key_stats,
    cta_subscribe: core.cta_subscribe,
    cta_comment_prompt: core.cta_comment_prompt,
  };
}
