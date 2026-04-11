/**
 * Engagement module validator
 * Business-logic invariants beyond Zod structural validation.
 */

import type { EngagementModuleOutput } from "./schema";

export interface EngagementValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** YouTube pinned comment character limit */
const PINNED_COMMENT_MAX = 500;

/** Recommended minimum thread depth (hook + at least this many continuation tweets) */
const MIN_THREAD_CONTINUATION_TWEETS = 3;

export function validateEngagement(engagement: EngagementModuleOutput): EngagementValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // pinned_comment must not be empty
  if (!engagement.pinned_comment || engagement.pinned_comment.trim().length === 0) {
    errors.push("pinned_comment is empty.");
  } else if (engagement.pinned_comment.length > PINNED_COMMENT_MAX) {
    warnings.push(
      `pinned_comment is ${engagement.pinned_comment.length} chars (recommended max: ${PINNED_COMMENT_MAX} for readability).`,
    );
  }

  // community_post must not be empty
  if (!engagement.community_post || engagement.community_post.trim().length === 0) {
    errors.push("community_post is empty.");
  }

  // twitter thread continuation depth
  const threadDepth = engagement.twitter_thread?.thread_outline?.length ?? 0;
  if (threadDepth < MIN_THREAD_CONTINUATION_TWEETS) {
    warnings.push(
      `Twitter thread has only ${threadDepth} continuation tweet(s). ${MIN_THREAD_CONTINUATION_TWEETS}+ are recommended for reach.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
