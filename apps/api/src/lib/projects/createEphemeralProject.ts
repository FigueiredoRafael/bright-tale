/**
 * BRI-159: Create an ephemeral project bound to a standalone session.
 *
 * When a brainstorm or research session is created without a projectId
 * (i.e. from a standalone channel page), we auto-create a project with
 * `is_standalone=true` so stage_runs (which require project_id NOT NULL)
 * can be created for those sessions too.
 *
 * The created project is hidden from all list endpoints by the
 * `is_standalone=false` filter added in BRI-159.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

interface CreateEphemeralProjectOptions {
  channelId: string;
  userId: string;
  orgId: string | null;
  title: string;
  stage: string;
}

/**
 * Insert an ephemeral project row and return its id.
 *
 * - `is_standalone: true` — hides it from project listings
 * - `mode: 'step-by-step'` — consistent with manual/standalone flow
 * - `status: 'active'` — matches the enum used by createProjectSchema
 * - `current_stage`: set to the stage being started (e.g. 'brainstorm')
 */
export async function createEphemeralProject(
  sb: SupabaseClient,
  opts: CreateEphemeralProjectOptions,
): Promise<string> {
  const { channelId, userId, orgId, title, stage } = opts;

  const { data, error } = await sb
    .from('projects')
    .insert({
      title,
      channel_id: channelId,
      user_id: userId,
      org_id: orgId,
      current_stage: stage,
      status: 'active',
      mode: 'step-by-step',
      is_standalone: true,
    })
    .select('id')
    .single();

  if (error) throw new Error(`createEphemeralProject: ${error.message}`);
  if (!data) throw new Error('createEphemeralProject: no row returned');

  return (data as { id: string }).id;
}
