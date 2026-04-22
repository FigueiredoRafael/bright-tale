import { z } from "zod";

/**
 * Idea Library Schemas
 * For managing the global idea library with filtering, similarity detection, and CRUD
 */

// Source types for ideas
export const ideaSourceTypes = ["brainstorm", "import", "manual"] as const;
export type IdeaSourceType = (typeof ideaSourceTypes)[number];

// Verdict types
export const ideaVerdicts = ["viable", "weak", "experimental"] as const;
export type IdeaVerdict = (typeof ideaVerdicts)[number];

// Query params for listing ideas
export const listIdeasQuerySchema = z.object({
  verdict: z.enum(ideaVerdicts).optional(),
  source_type: z.enum(ideaSourceTypes).optional(),
  tags: z.string().optional(), // comma-separated
  search: z.string().optional(),
  is_public: z.coerce.boolean().optional(),
  channel_id: z.string().uuid().optional(),
  include_orphaned: z.coerce.boolean().optional(), // also show ideas with no channel_id
  include_all_channels: z.coerce.boolean().optional(), // ignore channel_id filter entirely
  page: z.coerce.number().int().positive().default(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20).optional(),
});

export type ListIdeasQuery = z.infer<typeof listIdeasQuerySchema>;

// Schema for creating a new idea in the library
export const createIdeaSchema = z.object({
  idea_id: z
    .string()
    .regex(/^BC-IDEA-\d{3,}$/)
    .optional(), // Auto-generated if not provided
  title: z.string().min(5).max(200),
  core_tension: z.string().default(""),
  target_audience: z.string().default(""),
  verdict: z.enum(ideaVerdicts).default("experimental"),
  discovery_data: z.string().optional().default(""),
  source_type: z.enum(ideaSourceTypes).default("manual"),
  source_project_id: z.string().optional(),
  channel_id: z.string().uuid().optional(),
  tags: z.array(z.string()).optional().default([]),
  is_public: z.boolean().optional().default(true),
  markdown_content: z.string().optional(),
});

export type CreateIdeaInput = z.infer<typeof createIdeaSchema>;

// Schema for updating an existing idea
export const updateIdeaSchema = z.object({
  title: z.string().min(5).max(200).optional(),
  core_tension: z.string().optional(),
  target_audience: z.string().optional(),
  verdict: z.enum(ideaVerdicts).optional(),
  discovery_data: z.string().optional(),
  tags: z.array(z.string()).optional(),
  is_public: z.boolean().optional(),
  markdown_content: z.string().optional(),
  channel_id: z.string().uuid().nullable().optional(),
});

export type UpdateIdeaInput = z.infer<typeof updateIdeaSchema>;

// Schema for bulk importing ideas
export const importIdeasSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().min(5),
        core_tension: z.string().optional().default(""),
        target_audience: z.string().optional().default(""),
        verdict: z.enum(ideaVerdicts).optional().default("experimental"),
        tags: z.array(z.string()).optional().default([]),
        markdown_content: z.string().optional(),
      }),
    )
    .min(1),
});

export type ImportIdeasInput = z.infer<typeof importIdeasSchema>;

// Response types
export interface SimilarityWarning {
  type: "similar";
  existing_id: string;
  existing_title: string;
  similarity: number;
}

export interface CreateIdeaResponse {
  idea: {
    id: string;
    idea_id: string;
    title: string;
  };
  warnings?: SimilarityWarning[];
}

/**
 * Calculate similarity between two strings (Levenshtein-based percentage)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 100;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matrix: number[][] = [];

  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  const maxLen = Math.max(s1.length, s2.length);
  const distance = matrix[s1.length][s2.length];
  return Math.round(((maxLen - distance) / maxLen) * 100);
}
