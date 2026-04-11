/**
 * Research API schemas for validation
 */

import { z } from "zod";

// Create research schema
export const createResearchSchema = z.object({
  title: z.string().min(3).max(200),
  theme: z.string().min(2).max(100),
  research_content: z.string().min(10),
  idea_id: z.string().optional(), // Optional link to an idea
});

export type CreateResearchInput = z.infer<typeof createResearchSchema>;

// Update research schema
export const updateResearchSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  theme: z.string().min(2).max(100).optional(),
  research_content: z.string().min(10).optional(),
  idea_id: z.string().optional(), // Optional link to an idea
});

export type UpdateResearchInput = z.infer<typeof updateResearchSchema>;

// List research query parameters
export const listResearchQuerySchema = z.object({
  theme: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20).optional(),
  sort: z
    .enum([
      "created_at",
      "updated_at",
      "title",
      "projects_count",
      "winners_count",
    ])
    .default("created_at")
    .optional(),
  order: z.enum(["asc", "desc"]).default("desc").optional(),
});

export type ListResearchQuery = z.infer<typeof listResearchQuerySchema>;

// Add source schema
export const addSourceSchema = z.object({
  url: z.string().url(),
  title: z.string().min(2).max(300),
  author: z.string().max(200).optional(),
  date: z.string().datetime().optional(),
});

export type AddSourceInput = z.infer<typeof addSourceSchema>;
