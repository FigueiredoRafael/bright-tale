import { z } from "zod";

export const mediumSchema = z.enum(["blog", "video", "shorts", "podcast"]);

export const deriveDraftRequestSchema = z.object({
  trackId: z.string().uuid(),
  medium: mediumSchema,
});

export const deriveDraftResponseSchema = z.object({
  id: z.string().uuid(),
  created: z.boolean(),
});

export type Medium = z.infer<typeof mediumSchema>;
export type DeriveDraftRequest = z.infer<typeof deriveDraftRequestSchema>;
export type DeriveDraftResponse = z.infer<typeof deriveDraftResponseSchema>;

/**
 * S6 — Image-mode persistence.
 *
 * Validates the `assetSettings` sub-object that is patched into
 * `draft_json.assetSettings`. `.strict()` rejects any unknown keys.
 */
export const imageModeSchema = z.enum(["generate", "prompts-only"]);

export const assetSettingsSchema = z
  .object({
    imageMode: imageModeSchema,
  })
  .strict();

/**
 * Partial PATCH body shape used to persist assetSettings onto a content draft.
 * Other PATCH fields (title, status, etc.) are handled by the route's own
 * updateSchema; this schema is exported so routes can compose it in.
 */
export const patchDraftAssetSettingsSchema = z.object({
  assetSettings: assetSettingsSchema.optional(),
});

export type ImageMode = z.infer<typeof imageModeSchema>;
export type AssetSettings = z.infer<typeof assetSettingsSchema>;
export type PatchDraftAssetSettings = z.infer<typeof patchDraftAssetSettingsSchema>;
