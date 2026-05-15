/**
 * Tracks API schemas (T2.10 — Add Medium flow).
 *
 * `POST /api/projects/:id/tracks` accepts a new Track for a project.
 * Each Track is a per-medium production lane (blog/video/shorts/podcast)
 * that fans out from the project's canonical core.
 */
import { z } from 'zod';
import { MEDIA } from '../pipeline/inputs';

export const addTrackSchema = z.object({
  medium: z.enum(MEDIA),
  autopilotConfigJson: z.record(z.unknown()).optional(),
  defaultMediaConfig: z.record(z.unknown()).optional(),
});

export type AddTrackInput = z.infer<typeof addTrackSchema>;
