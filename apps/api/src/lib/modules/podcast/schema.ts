/**
 * Podcast module schema
 * Zod schema for PodcastOutput — the podcast format agent's output contract.
 */

import { z } from "zod";

const talkingPointSchema = z.object({
  point: z.string().min(1),
  notes: z.string(),
});

export const podcastOutputSchema = z.object({
  episode_title: z.string().min(1),
  episode_description: z.string().min(1),
  intro_hook: z.string().min(1),
  talking_points: z.array(talkingPointSchema).min(1),
  host_talking_prompts: z.array(z.string()),
  guest_questions: z.array(z.string()).default([]),
  outro: z.string().min(1),
  duration_estimate: z.string().optional(),
  content_warning: z.string().optional(),
});

export type PodcastModuleOutput = z.infer<typeof podcastOutputSchema>;
