/**
 * Shorts module validator
 * Business-logic invariants beyond Zod structural validation.
 */

import type { ShortsModuleOutput } from "./schema";

export interface ShortsValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Standard number of shorts per batch */
const STANDARD_SHORTS_COUNT = 3;

export function validateShorts(shorts: ShortsModuleOutput): ShortsValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must not be empty
  if (!shorts || shorts.length === 0) {
    errors.push("Shorts array is empty — at least one short is required.");
    return { valid: false, errors, warnings };
  }

  // Warn if not the standard 3
  if (shorts.length < STANDARD_SHORTS_COUNT) {
    warnings.push(
      `Only ${shorts.length} short(s) provided. ${STANDARD_SHORTS_COUNT} are standard per batch.`,
    );
  }

  // short_numbers must be sequential starting at 1
  const numbers = shorts.map((s) => s.short_number).sort((a, b) => a - b);
  const expectedSequence = numbers.map((_, i) => i + 1);
  const isSequential = numbers.every((n, i) => n === expectedSequence[i]);
  if (!isSequential) {
    errors.push(
      `short_number values ${JSON.stringify(numbers)} are not sequential starting at 1. Expected ${JSON.stringify(expectedSequence)}.`,
    );
  }

  // Warn on missing CTAs
  shorts.forEach((s) => {
    if (!s.cta || s.cta.trim().length === 0) {
      warnings.push(`Short #${s.short_number} ("${s.title}") has no CTA.`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
