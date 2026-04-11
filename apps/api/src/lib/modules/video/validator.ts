/**
 * Video module validator
 * Business-logic invariants beyond Zod structural validation.
 */

import type { VideoModuleOutput } from "./schema.js";

export interface VideoValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Recommended minimum number of title options for A/B testing */
const MIN_TITLE_OPTIONS = 3;

export function validateVideo(video: VideoModuleOutput): VideoValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // title_options must not be empty
  if (!video.title_options || video.title_options.length === 0) {
    errors.push("title_options is empty — at least one title is required.");
  } else if (video.title_options.length < MIN_TITLE_OPTIONS) {
    warnings.push(
      `Only ${video.title_options.length} title option(s) provided. ${MIN_TITLE_OPTIONS} are recommended for A/B testing.`,
    );
  }

  // script must have at least one chapter
  if (!video.script?.chapters || video.script.chapters.length === 0) {
    errors.push("script.chapters is empty — at least one chapter is required.");
  }

  // warn on chapters with no b_roll_suggestions
  if (video.script?.chapters) {
    video.script.chapters.forEach((ch) => {
      if (!ch.b_roll_suggestions || ch.b_roll_suggestions.length === 0) {
        warnings.push(
          `Chapter ${ch.chapter_number} ("${ch.title}") has no b_roll_suggestions — consider adding visual direction.`,
        );
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
