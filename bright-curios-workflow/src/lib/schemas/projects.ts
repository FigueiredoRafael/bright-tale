/**
 * Project API schemas for validation
 */

import { z } from "zod";

// Valid stage types (legacy and new names)
const validStageTypes = [
  "discovery",
  "brainstorm",
  "research",
  "content",
  "production",
  "review",
  "publication",
  "publish",
  "published", // legacy status
] as const;

// Create project schema
export const createProjectSchema = z.object({
  title: z.string().min(3).max(200),
  research_id: z.string().cuid().optional(),
  current_stage: z.enum(validStageTypes),
  auto_advance: z.boolean().default(true),
  status: z.enum(["active", "paused", "completed", "archived"]),
  winner: z.boolean().default(false),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

// Update project schema
export const updateProjectSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  research_id: z.string().cuid().nullable().optional(),
  current_stage: z.enum(validStageTypes).optional(),
  auto_advance: z.boolean().optional(),
  status: z.enum(["active", "paused", "completed", "archived"]).optional(),
  winner: z.boolean().optional(),
  completed_stages: z.array(z.string()).optional(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// List projects query parameters
export const listProjectsQuerySchema = z.object({
  status: z.enum(["active", "paused", "completed", "archived"]).optional(),
  current_stage: z.enum(validStageTypes).optional(),
  winner: z.coerce.boolean().optional(),
  research_id: z.string().cuid().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20).optional(),
  sort: z
    .enum(["created_at", "updated_at", "title", "current_stage", "status"])
    .default("created_at")
    .optional(),
  order: z.enum(["asc", "desc"]).default("desc").optional(),
});

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

// Bulk operations schema
export const bulkOperationSchema = z.object({
  operation: z.enum([
    "delete",
    "archive",
    "activate",
    "pause",
    "complete",
    "export",
    "change_status",
  ]),
  project_ids: z.array(z.string().cuid()).min(1).max(100),
  // optional export format
  format: z.enum(["json"]).optional(),
  new_status: z.string().optional(),
});

export type BulkOperationInput = z.infer<typeof bulkOperationSchema>;

// Mark as winner schema
export const markWinnerSchema = z.object({
  winner: z.boolean(),
});

export type MarkWinnerInput = z.infer<typeof markWinnerSchema>;
