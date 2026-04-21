/**
 * Podcast Draft API schemas for validation
 */

import { z } from "zod";

export const talkingPointSchema = z.object({
  point: z.string(),
  notes: z.string(),
});
export type TalkingPoint = z.infer<typeof talkingPointSchema>;

export const createPodcastSchema = z.object({
  episode_title: z.string().min(3).max(300),
  episode_description: z.string().min(10),
  intro_hook: z.string(),
  talking_points: z.array(talkingPointSchema).min(1),
  host_talking_prompts: z.array(z.string()),
  guest_questions: z.array(z.string()).default([]),
  outro: z.string(),
  duration_estimate: z.string().optional(),
  word_count: z.number().int().min(0).optional(),
  status: z.enum(["draft", "review", "approved", "published"]).default("draft"),
  project_id: z.string().uuid().optional(),
  idea_id: z.string().optional(),
});

export type CreatePodcastInput = z.infer<typeof createPodcastSchema>;

export const updatePodcastSchema = z.object({
  episode_title: z.string().min(3).max(300).optional(),
  episode_description: z.string().min(10).optional(),
  intro_hook: z.string().optional(),
  talking_points: z.array(talkingPointSchema).min(1).optional(),
  host_talking_prompts: z.array(z.string()).optional(),
  guest_questions: z.array(z.string()).optional(),
  outro: z.string().optional(),
  duration_estimate: z.string().optional(),
  word_count: z.number().int().min(0).optional(),
  status: z.enum(["draft", "review", "approved", "published"]).optional(),
  project_id: z.string().uuid().optional(),
  idea_id: z.string().optional(),
});

export type UpdatePodcastInput = z.infer<typeof updatePodcastSchema>;

export const podcastQuerySchema = z.object({
  status: z.enum(["draft", "review", "approved", "published"]).optional(),
  project_id: z.string().optional(),
  idea_id: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20).optional(),
});

export type PodcastQuery = z.infer<typeof podcastQuerySchema>;
