/**
 * Templates API schemas for validation
 */

import { z } from "zod";

// Create template schema
export const createTemplateSchema = z.object({
  name: z.string().min(3).max(200),
  type: z.enum(["discovery", "production", "review"]),
  config_json: z.string().min(2), // JSON string
  parent_template_id: z.string().uuid().optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

// Update template schema
export const updateTemplateSchema = z.object({
  name: z.string().min(3).max(200).optional(),
  type: z.enum(["discovery", "production", "review"]).optional(),
  config_json: z.string().min(2).optional(),
  parent_template_id: z.string().uuid().nullable().optional(),
});

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

// List templates query parameters
export const listTemplatesQuerySchema = z.object({
  type: z.enum(["discovery", "production", "review"]).optional(),
  parent_template_id: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20).optional(),
  sort: z
    .enum(["created_at", "updated_at", "name", "type"])
    .default("created_at")
    .optional(),
  order: z.enum(["asc", "desc"]).default("desc").optional(),
});

export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;
