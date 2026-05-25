/**
 * Tracks API schemas (T2.10 — Add Medium flow).
 *
 * `POST /api/projects/:id/tracks` accepts a new Track for a project.
 * Each Track is a per-medium production lane (blog/video/shorts/podcast)
 * that fans out from the project's canonical core.
 */
import { z } from 'zod';
import { MEDIA } from '../pipeline/inputs.js';

export const addTrackSchema = z.object({
  medium: z.enum(MEDIA),
  autopilotConfigJson: z.record(z.unknown()).optional(),
  defaultMediaConfig: z.record(z.unknown()).optional(),
});

export type AddTrackInput = z.infer<typeof addTrackSchema>;

/**
 * Tracks API schemas (T2.11 — pause/abort/override flow).
 *
 * `PATCH /api/projects/:id/tracks/:trackId` allows the user to:
 *   - pause/resume the Track (`paused`)
 *   - abort the Track (`status: 'aborted'`) — cascades to in-flight stage_runs
 *   - revive an aborted Track (`status: 'active'`) — no cascade; the user
 *     re-runs whatever downstream stages they want via Restart step
 *   - override autopilot config mid-flight (`autopilotConfigJson`)
 *
 * `status` accepts `'aborted'` and `'active'`. `'completed'` is derived by
 * the orchestrator. At least one field must be present.
 */
export const updateTrackSchema = z
  .object({
    paused: z.boolean().optional(),
    status: z.enum(['active', 'aborted']).optional(),
    autopilotConfigJson: z.record(z.unknown()).nullable().optional(),
  })
  .refine(
    (v) =>
      v.paused !== undefined ||
      v.status !== undefined ||
      v.autopilotConfigJson !== undefined,
    { message: 'At least one of paused, status, autopilotConfigJson is required' },
  );

export type UpdateTrackInput = z.infer<typeof updateTrackSchema>;
