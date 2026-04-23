/**
 * Shared types for all draft validators (universal + persona-specific).
 *
 * Validators are pure functions that inspect a generated draft and return
 * findings split by severity. Critical findings should block publish; important
 * findings should reduce review score; minor findings are advisory.
 */

export interface ValidationFindings {
  critical: string[];
  important: string[];
  minor: string[];
}

export interface CanonicalCoreLike {
  argument_chain?: Array<{ source_ids?: string[] }>;
  key_stats?: Array<{ source_id?: string }>;
}

export interface OutlineEntry {
  h2: string;
}

export interface DraftValidatorInput {
  fullDraft: string;
  outline: OutlineEntry[];
  canonicalCore: CanonicalCoreLike;
  signaturePhrases: string[];
}

export const EMPTY_FINDINGS: ValidationFindings = {
  critical: [],
  important: [],
  minor: [],
};

export function mergeFindings(...findings: ValidationFindings[]): ValidationFindings {
  return {
    critical: findings.flatMap((f) => f.critical),
    important: findings.flatMap((f) => f.important),
    minor: findings.flatMap((f) => f.minor),
  };
}

export function hasFindings(f: ValidationFindings): boolean {
  return f.critical.length > 0 || f.important.length > 0 || f.minor.length > 0;
}
