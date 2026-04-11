/**
 * Blog module validator
 * Business-logic invariants that go beyond Zod structural validation.
 */

import type { BlogModuleOutput } from "./schema";

export interface BlogValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Max SEO-safe meta description length */
const META_DESC_MAX = 160;

/** If declared word_count differs from draft word count by more than this, warn */
const WORD_COUNT_TOLERANCE = 200;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function validateBlog(blog: BlogModuleOutput): BlogValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // full_draft must not be empty
  if (!blog.full_draft || blog.full_draft.trim().length === 0) {
    errors.push("full_draft is empty — blog has no content.");
  }

  // outline must have at least one section
  if (!blog.outline || blog.outline.length === 0) {
    errors.push("outline is empty — at least one H2 section is required.");
  }

  // slug must be lowercase, URL-safe (no uppercase, no spaces)
  if (/[A-Z\s]/.test(blog.slug)) {
    errors.push(`slug "${blog.slug}" contains uppercase or spaces — use lowercase-hyphenated format.`);
  }

  // meta_description length warning
  if (blog.meta_description && blog.meta_description.length > META_DESC_MAX) {
    warnings.push(
      `meta_description is ${blog.meta_description.length} chars (max ${META_DESC_MAX}). It may be truncated in search results.`,
    );
  }

  // word_count consistency check
  if (blog.full_draft && blog.word_count > 0) {
    const actualWordCount = countWords(blog.full_draft);
    const delta = Math.abs(blog.word_count - actualWordCount);
    if (delta > WORD_COUNT_TOLERANCE) {
      warnings.push(
        `word_count (${blog.word_count}) differs from actual draft word count (~${actualWordCount}) by ${delta} words. Consider recalculating.`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
