/**
 * Tracks intake endpoint (T2.10 — Add Medium flow).
 *
 *   POST /projects/:projectId/tracks — create a new per-medium Track under
 *     a project. In autopilot mode, replays canonical fan-out so the new
 *     Track picks up Production immediately if Canonical has already
 *     completed.
 *
 * Thin HTTP adapter — fan-out logic lives in
 * `lib/pipeline/orchestrator.enqueueProductionForNewTrack`.
 */
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { assertProjectOwner } from '../lib/projects/ownership.js';
import { enqueueProductionForNewTrack } from '../lib/pipeline/orchestrator.js';
import { addTrackSchema } from '@brighttale/shared/schemas/tracks';
import type { Medium } from '@brighttale/shared/pipeline/inputs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

interface TrackRow {
  id: string;
  project_id: string;
  medium: Medium;
  status: 'active' | 'aborted' | 'completed';
  paused: boolean;
  autopilot_config_json: unknown;
  created_at: string;
  updated_at: string;
}

function rowToTrack(row: TrackRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    medium: row.medium,
    status: row.status,
    paused: Boolean(row.paused),
    autopilotConfigJson: row.autopilot_config_json ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function tracksRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { projectId: string } }>(
    '/:projectId/tracks',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const { projectId } = request.params;
        const userId = (request as unknown as { userId?: string }).userId;
        if (!userId) throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');

        const parsed = addTrackSchema.safeParse(request.body);
        if (!parsed.success) {
          throw new ApiError(400, parsed.error.message, 'VALIDATION_ERROR');
        }

        const sb: Sb = createServiceClient();
        await assertProjectOwner(projectId, userId, sb);

        const { data: project, error: projectErr } = await sb
          .from('projects')
          .select('id, mode, autopilot_config_json')
          .eq('id', projectId)
          .maybeSingle();
        if (projectErr) {
          throw new ApiError(500, 'Failed to load project', 'PROJECT_LOAD_FAILED');
        }
        if (!project) {
          throw new ApiError(404, 'Project not found', 'NOT_FOUND');
        }

        const { data: inserted, error: insertErr } = await sb
          .from('tracks')
          .insert({
            project_id: projectId,
            medium: parsed.data.medium,
            autopilot_config_json: parsed.data.autopilotConfigJson ?? null,
          })
          .select('*')
          .single();
        if (insertErr || !inserted) {
          throw new ApiError(500, 'Failed to create track', 'TRACK_INSERT_FAILED');
        }

        const track = rowToTrack(inserted as TrackRow);

        if ((project as { mode?: string | null }).mode === 'autopilot') {
          await enqueueProductionForNewTrack(projectId, track.id);
        }

        return reply.status(201).send({ data: { track }, error: null });
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );
}
