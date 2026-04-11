/**
 * CanonicalCore schema and completeness scorer
 *
 * The CanonicalCore is the intermediate narrative contract that all format
 * agents (blog, video, shorts, podcast, engagement) derive from.
 * It formalizes: thesis, argument chain, emotional arc, shared assets, and CTAs.
 */

import { z } from "zod";

// ─── Sub-schemas ────────────────────────────────────────────────────────────

const argumentStepSchema = z.object({
  step: z.number().int().positive(),
  claim: z.string().min(1),
  evidence: z.string().min(1),
  source_ids: z.array(z.string()).optional(),
});

const emotionalArcSchema = z.object({
  opening_emotion: z.string().min(1),
  turning_point: z.string().min(1),
  closing_emotion: z.string().min(1),
});

const keyStatSchema = z.object({
  stat: z.string().min(1),
  figure: z.string().min(1),
  source_id: z.string().optional(),
});

const keyQuoteSchema = z.object({
  quote: z.string().min(1),
  author: z.string().min(1),
  credentials: z.string().optional(),
});

const affiliateMomentSchema = z.object({
  trigger_context: z.string().min(1),
  product_angle: z.string().min(1),
  cta_primary: z.string().min(1),
});

// ─── Root schema ─────────────────────────────────────────────────────────────

export const canonicalCoreSchema = z.object({
  idea_id: z.string().min(1),

  /** Central thesis — should be 1-2 sentences max */
  thesis: z.string().min(1),

  /** Ordered logical chain — must have at least 1 step */
  argument_chain: z.array(argumentStepSchema).min(1),

  /** Emotional arc shared by all formats */
  emotional_arc: emotionalArcSchema,

  /** Key statistics cited across all formats */
  key_stats: z.array(keyStatSchema),

  /** Expert quotes available to all formats (optional) */
  key_quotes: z.array(keyQuoteSchema).optional(),

  /** Affiliate placement moment (optional — not all content monetizes) */
  affiliate_moment: affiliateMomentSchema.optional(),

  /** Subscribe CTA text */
  cta_subscribe: z.string().optional(),

  /** Comment prompt — drives engagement */
  cta_comment_prompt: z.string().optional(),
});

export type CanonicalCore = z.infer<typeof canonicalCoreSchema>;
export type CanonicalCoreInput = z.input<typeof canonicalCoreSchema>;

// ─── Completeness scorer ─────────────────────────────────────────────────────

export interface CompletenessResult {
  score: number;       // 0–100
  warnings: string[];  // issues that reduce score
  missing: string[];   // fields absent but not schema-required
}

/** Counts sentences by splitting on `. ` / `! ` / `? ` */
function countSentences(text: string): number {
  return text.split(/[.!?]\s+/).filter(Boolean).length;
}

/**
 * Scores the completeness of a parsed CanonicalCore (0–100).
 * Does not throw — only returns warnings and a deducted score.
 */
export function scoreCanonicalCore(core: CanonicalCore): CompletenessResult {
  const warnings: string[] = [];
  const missing: string[] = [];
  let deductions = 0;

  // Thesis length (should be ≤ 2 sentences)
  if (countSentences(core.thesis) > 2) {
    warnings.push("thesis is longer than 2 sentences — condense for clarity.");
    deductions += 10;
  }

  // Argument chain depth (recommend ≥ 2 steps)
  if (core.argument_chain.length < 2) {
    warnings.push("argument_chain has only 1 step — add more to strengthen narrative.");
    deductions += 15;
  }

  // Key stats (should have at least 1)
  if (core.key_stats.length === 0) {
    warnings.push("key_stats is empty — add at least one statistic to anchor the argument.");
    deductions += 15;
  }

  // Affiliate moment (optional but recommended for monetization)
  if (!core.affiliate_moment) {
    warnings.push("affiliate_moment is missing — add if this content should monetize.");
    missing.push("affiliate_moment");
    deductions += 10;
  }

  // CTAs
  if (!core.cta_subscribe) {
    warnings.push("cta_subscribe is missing.");
    missing.push("cta_subscribe");
    deductions += 5;
  }
  if (!core.cta_comment_prompt) {
    warnings.push("cta_comment_prompt is missing.");
    missing.push("cta_comment_prompt");
    deductions += 5;
  }

  // Key quotes (optional, but worth noting if absent)
  if (!core.key_quotes || core.key_quotes.length === 0) {
    missing.push("key_quotes");
    // No deduction — quotes are optional
  }

  return {
    score: Math.max(0, 100 - deductions),
    warnings,
    missing,
  };
}
