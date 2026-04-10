/**
 * Zod schemas for Assets API operations
 */
import { z } from "zod";

// Search Unsplash schema
export const searchUnsplashQuerySchema = z.object({
  query: z.string().min(1, "Search query is required"),
  page: z.string().regex(/^\d+$/).default("1").transform(Number),
  per_page: z.string().regex(/^\d+$/).default("20").transform(Number),
  orientation: z.enum(["landscape", "portrait", "squarish"]).optional(),
});

// Save asset schema
export const saveAssetSchema = z.object({
  project_id: z.string().cuid("Invalid project ID"),
  asset_type: z.enum(["image", "video", "audio", "document"]),
  source: z.string().min(1, "Source is required"),
  source_url: z.string().url("Invalid source URL"),
  alt_text: z.string().optional(),
  wordpress_id: z.number().optional(),
  wordpress_url: z.string().url().optional(),
});

// Type exports
export type SearchUnsplashQuery = z.infer<typeof searchUnsplashQuerySchema>;
export type SaveAsset = z.infer<typeof saveAssetSchema>;

// Validation helpers
export const validateSearchUnsplashQuery = (data: unknown) =>
  searchUnsplashQuerySchema.parse(data);

export const validateSaveAsset = (data: unknown) => saveAssetSchema.parse(data);
