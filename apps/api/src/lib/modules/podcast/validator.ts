/**
 * Podcast module validator
 * Business-logic invariants beyond Zod structural validation.
 */

import type { PodcastModuleOutput } from "./schema.js";

export interface PodcastValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Recommended minimum number of talking points for a full episode */
const MIN_TALKING_POINTS = 3;

export function validatePodcast(podcast: PodcastModuleOutput): PodcastValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // intro_hook must not be empty
  if (!podcast.intro_hook || podcast.intro_hook.trim().length === 0) {
    errors.push("intro_hook is empty — podcast has no opening hook.");
  }

  // talking_points must not be empty
  if (!podcast.talking_points || podcast.talking_points.length === 0) {
    errors.push("talking_points is empty — podcast has no content structure.");
  } else if (podcast.talking_points.length < MIN_TALKING_POINTS) {
    warnings.push(
      `Only ${podcast.talking_points.length} talking point(s) provided. ${MIN_TALKING_POINTS} are recommended for a full episode.`,
    );
  }

  // duration_estimate is a useful guide — warn if missing
  if (!podcast.duration_estimate) {
    warnings.push("duration_estimate is missing — consider adding an estimated episode length.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
