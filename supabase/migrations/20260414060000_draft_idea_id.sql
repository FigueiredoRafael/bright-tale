-- F6-009: Add idea_id to draft tables (channel → idea → draft model)
-- projects/stages are kept as legacy read-only; new flow links drafts directly to ideas.

ALTER TABLE blog_drafts ADD COLUMN IF NOT EXISTS idea_id uuid REFERENCES idea_archives(id) ON DELETE SET NULL;
ALTER TABLE video_drafts ADD COLUMN IF NOT EXISTS idea_id uuid REFERENCES idea_archives(id) ON DELETE SET NULL;
ALTER TABLE shorts_drafts ADD COLUMN IF NOT EXISTS idea_id uuid REFERENCES idea_archives(id) ON DELETE SET NULL;
ALTER TABLE podcast_drafts ADD COLUMN IF NOT EXISTS idea_id uuid REFERENCES idea_archives(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_blog_drafts_idea ON blog_drafts(idea_id) WHERE idea_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_video_drafts_idea ON video_drafts(idea_id) WHERE idea_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shorts_drafts_idea ON shorts_drafts(idea_id) WHERE idea_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_podcast_drafts_idea ON podcast_drafts(idea_id) WHERE idea_id IS NOT NULL;

-- Backfill: link drafts to ideas via project → stages → idea_archive
-- Only populates where a clear 1:1 mapping exists.
-- Guarded by stages.idea_archive_id existence — column was historically added by
-- an unversioned dev migration; on fresh local resets the column may not exist
-- and this backfill becomes a no-op (acceptable: stages is empty on fresh DB).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stages' AND column_name = 'idea_archive_id'
  ) THEN
    EXECUTE $sql$
      UPDATE blog_drafts d
      SET idea_id = s.idea_archive_id
      FROM stages s
      WHERE d.project_id = s.project_id
        AND s.idea_archive_id IS NOT NULL
        AND d.idea_id IS NULL;

      UPDATE video_drafts d
      SET idea_id = s.idea_archive_id
      FROM stages s
      WHERE d.project_id = s.project_id
        AND s.idea_archive_id IS NOT NULL
        AND d.idea_id IS NULL;

      UPDATE shorts_drafts d
      SET idea_id = s.idea_archive_id
      FROM stages s
      WHERE d.project_id = s.project_id
        AND s.idea_archive_id IS NOT NULL
        AND d.idea_id IS NULL;

      UPDATE podcast_drafts d
      SET idea_id = s.idea_archive_id
      FROM stages s
      WHERE d.project_id = s.project_id
        AND s.idea_archive_id IS NOT NULL
        AND d.idea_id IS NULL;
    $sql$;
  END IF;
END $$;
