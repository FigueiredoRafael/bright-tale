/**
 * API-layer schemas for the /api/canonical-core endpoints
 * Separate from the domain schema (canonicalCore.ts) to isolate
 * HTTP-specific concerns (project_id, partial updates) from the core contract.
 */

import { z } from "zod";

// Shared sub-schemas (duplicated from canonicalCore.ts to avoid circular deps)
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

/** POST /api/canonical-core */
export const createCanonicalCoreSchema = z.object({
  idea_id: z.string().min(1),
  project_id: z.string().optional(),
  thesis: z.string().min(1),
  argument_chain: z.array(argumentStepSchema).min(1),
  emotional_arc: emotionalArcSchema,
  key_stats: z.array(keyStatSchema),
  key_quotes: z.array(keyQuoteSchema).optional(),
  affiliate_moment: affiliateMomentSchema.optional(),
  cta_subscribe: z.string().optional(),
  cta_comment_prompt: z.string().optional(),
});

/** PUT /api/canonical-core/:id — all fields optional except validated constraints */
export const updateCanonicalCoreSchema = createCanonicalCoreSchema
  .omit({ idea_id: true })
  .partial()
  .extend({
    // argument_chain, if provided, still must have ≥1 step
    argument_chain: z.array(argumentStepSchema).min(1).optional(),
  });

export type CreateCanonicalCoreInput = z.infer<typeof createCanonicalCoreSchema>;
export type UpdateCanonicalCoreInput = z.infer<typeof updateCanonicalCoreSchema>;
