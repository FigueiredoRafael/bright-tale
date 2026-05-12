/**
 * Brainstorm-draft → idea-archive resolution shared by every dispatcher
 * downstream of brainstorm (research, draft, etc).
 *
 * The orchestrator's brainstorm payload_ref points to a `brainstorm_drafts.id`.
 * But every downstream session/draft table has a FK to `idea_archives.id`
 * (via `content_drafts.idea_id`, `research_sessions.idea_id`, etc). The
 * legacy "save selected drafts" flow used to do this promotion explicitly;
 * the new orchestrator path is autopilot, so the dispatcher does it on
 * demand. Idempotent: looks for an existing archive by
 * `brainstorm_session_id + title` before inserting.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export interface ResolvedIdea {
  ideaArchiveId: string | null;
  topic: string | null;
}

/**
 * Given a Project, find the prior brainstorm Stage Run's winning draft,
 * promote it to `idea_archives` if needed, and return the archive id +
 * topic title. Returns nulls if no brainstorm run/draft is reachable.
 */
export async function resolveIdeaArchiveFromBrainstorm(
  sb: Sb,
  projectId: string,
): Promise<ResolvedIdea> {
  const { data: priorBrainstorm } = await sb
    .from('stage_runs')
    .select('id, stage, status, payload_ref')
    .eq('project_id', projectId)
    .eq('stage', 'brainstorm')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const ref = priorBrainstorm?.payload_ref as { kind?: string; id?: string } | null | undefined;
  if (ref?.kind !== 'brainstorm_draft' || !ref.id) {
    return { ideaArchiveId: null, topic: null };
  }

  const { data: draft } = await sb
    .from('brainstorm_drafts')
    .select('*')
    .eq('id', ref.id)
    .maybeSingle();
  if (!draft) return { ideaArchiveId: null, topic: null };

  const topic = (draft.title as string | null) ?? null;

  // Already promoted?
  const { data: existing } = await sb
    .from('idea_archives')
    .select('id')
    .eq('brainstorm_session_id', draft.session_id as string)
    .eq('title', draft.title as string)
    .maybeSingle();
  if (existing?.id) {
    return { ideaArchiveId: existing.id as string, topic };
  }

  // Promote — same shape as POST /brainstorm/sessions/:id/drafts/save.
  const { count } = await sb
    .from('idea_archives')
    .select('*', { count: 'exact', head: true });
  const newIdeaId = `BC-IDEA-${String((count ?? 0) + 1).padStart(3, '0')}`;
  const { data: archive, error } = await sb
    .from('idea_archives')
    .insert({
      idea_id: newIdeaId,
      title: draft.title ?? '',
      core_tension: draft.core_tension ?? '',
      target_audience: draft.target_audience ?? '',
      verdict: draft.verdict ?? 'experimental',
      discovery_data: draft.discovery_data ?? '',
      source_type: 'brainstorm',
      channel_id: draft.channel_id,
      brainstorm_session_id: draft.session_id,
      user_id: draft.user_id,
      org_id: draft.org_id,
    })
    .select('id')
    .single();
  if (error || !archive?.id) return { ideaArchiveId: null, topic };
  return { ideaArchiveId: archive.id as string, topic };
}
