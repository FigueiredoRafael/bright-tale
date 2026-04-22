/**
 * Engagement module schema
 * Zod schema for EngagementOutput — the engagement format agent's output contract.
 * This format was previously generated but never persisted. This module formalizes it.
 */

import { z } from "zod";

const twitterThreadSchema = z.object({
  hook_tweet: z.string().min(1),
  thread_outline: z.array(z.string()).min(1),
});

export const engagementOutputSchema = z.object({
  pinned_comment: z.string().min(1),
  community_post: z.string().min(1),
  twitter_thread: twitterThreadSchema,
  content_warning: z.string().optional(),
});

export type EngagementModuleOutput = z.infer<typeof engagementOutputSchema>;
