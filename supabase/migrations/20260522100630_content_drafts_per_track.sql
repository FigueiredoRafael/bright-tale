-- Issue #210 M1 — Per-track content drafts.
-- A content_drafts row is either:
--   * the canonical/shared row for a project (track_id IS NULL), or
--   * a derived per-track row (track_id references tracks.id).
-- The derive helper enforces idempotency per (project_id, track_id).

alter table public.content_drafts
  add column track_id uuid references public.tracks(id) on delete set null;

create index idx_content_drafts_track_id
  on public.content_drafts(track_id);

-- One derived draft per (project, track). Canonical row (track_id IS NULL) is excluded.
create unique index one_draft_per_project_track
  on public.content_drafts(project_id, track_id)
  where track_id is not null;

-- NOTE: a canonical-uniqueness index (one row with track_id IS NULL per project)
-- is intentionally deferred. Legacy projects can have multiple content_drafts
-- rows with track_id=null (the pre-#210 production dispatcher forked rows
-- without setting track_id), and creating the constraint here would fail mid-
-- migration. A follow-up migration will reinstate it after a backfill that
-- attaches orphan rows to their tracks.
