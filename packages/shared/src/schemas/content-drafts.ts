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
