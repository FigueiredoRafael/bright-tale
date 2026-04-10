/**
 * Blog module schema
 * Zod schema for BlogOutput — the blog format agent's output contract.
 */

import { z } from "zod";

const outlineItemSchema = z.object({
  h2: z.string().min(1),
  key_points: z.array(z.string()),
  word_count_target: z.number().int().min(0),
});

const internalLinkSchema = z.object({
  topic: z.string(),
  anchor_text: z.string(),
});

const affiliateIntegrationSchema = z.object({
  placement: z
    .string()
    .transform((v) => v.toLowerCase())
    .pipe(z.enum(["intro", "middle", "conclusion"])),
  copy: z.string(),
  product_link_placeholder: z.string(),
  rationale: z.string(),
});

const imageSectionPromptSchema = z.object({
  heading: z.string(),
  prompt: z.string(),
});

const blogImagePromptsSchema = z.object({
  featured: z.string(),
  sections: z.array(imageSectionPromptSchema).default([]),
});

export const blogOutputSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  meta_description: z.string().min(1),
  primary_keyword: z.string().min(1),
  secondary_keywords: z.array(z.string()).default([]),
  outline: z.array(outlineItemSchema),
  full_draft: z.string().min(1),
  affiliate_integration: affiliateIntegrationSchema,
  internal_links_suggested: z.array(internalLinkSchema).default([]),
  word_count: z.number().int().min(0),
  image_prompts: blogImagePromptsSchema.optional(),
});

export type BlogModuleOutput = z.infer<typeof blogOutputSchema>;
