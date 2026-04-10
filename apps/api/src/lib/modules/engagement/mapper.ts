/**
 * Engagement module mapper
 * Transforms a CanonicalCore into the input object for the engagement format agent.
 * Engagement derives from the thesis (community post hook), cta_comment_prompt
 * (pinned comment seed), and key_stats (social proof in thread).
 */

import type { CanonicalCore, CanonicalCoreStat } from "@/types/agents";

export interface EngagementAgentInput {
  idea_id: string;
  thesis: string;
  /** Seed for the pinned comment — typically the cta_comment_prompt */
  comment_prompt_seed?: string;
  key_stats: CanonicalCoreStat[];
  /** Tone for community post closing */
  closing_emotion: string;
  cta_subscribe?: string;
}

export function mapCanonicalCoreToEngagementInput(core: CanonicalCore): EngagementAgentInput {
  return {
    idea_id: core.idea_id,
    thesis: core.thesis,
    comment_prompt_seed: core.cta_comment_prompt,
    key_stats: core.key_stats,
    closing_emotion: core.emotional_arc.closing_emotion,
    cta_subscribe: core.cta_subscribe,
  };
}
