/**
 * Zod schemas for WordPress API operations
 */
import { z } from "zod";

// Test connection schema
export const testWordPressConnectionSchema = z.object({
  site_url: z.string().url("Invalid WordPress site URL"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// Publish to WordPress schema
export const publishToWordPressSchema = z.object({
  project_id: z.string().cuid("Invalid project ID"),
  config_id: z.string().cuid("Invalid WordPress config ID").optional(),
  site_url: z.string().url("Invalid WordPress site URL").optional(),
  username: z.string().min(1, "Username is required").optional(),
  password: z.string().min(1, "Password is required").optional(),
  status: z.enum(["draft", "publish", "pending", "private"]).default("draft"),
  categories: z.array(z.string()).optional(), // Changed to string array (category names)
  tags: z.array(z.string()).optional(), // Changed to string array (tag names)
  featured_image_asset_id: z.string().cuid().optional(), // Asset ID for featured image
});

// Fetch categories query schema
export const fetchCategoriesQuerySchema = z.object({
  config_id: z.string().cuid("Invalid WordPress config ID").optional(),
  site_url: z.string().url("Invalid WordPress site URL").optional(),
  username: z.string().min(1, "Username is required").optional(),
  password: z.string().min(1, "Password is required").optional(),
});

// Fetch tags query schema
export const fetchTagsQuerySchema = z.object({
  config_id: z.string().cuid("Invalid WordPress config ID").optional(),
  site_url: z.string().url("Invalid WordPress site URL").optional(),
  username: z.string().min(1, "Username is required").optional(),
  password: z.string().min(1, "Password is required").optional(),
});

// Type exports
export type TestWordPressConnection = z.infer<
  typeof testWordPressConnectionSchema
>;
export type PublishToWordPress = z.infer<typeof publishToWordPressSchema>;
export type FetchCategoriesQuery = z.infer<typeof fetchCategoriesQuerySchema>;
export type FetchTagsQuery = z.infer<typeof fetchTagsQuerySchema>;

// Validation helpers
export const validateTestConnection = (data: unknown) =>
  testWordPressConnectionSchema.parse(data);

export const validatePublishToWordPress = (data: unknown) =>
  publishToWordPressSchema.parse(data);

export const validateFetchCategoriesQuery = (data: unknown) =>
  fetchCategoriesQuerySchema.parse(data);

export const validateFetchTagsQuery = (data: unknown) =>
  fetchTagsQuerySchema.parse(data);
