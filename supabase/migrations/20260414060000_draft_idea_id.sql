-- F6-009: Add idea_id to draft tables (channel → idea → draft model)
-- projects/stages are kept as legacy read-only; new flow links drafts directly to ideas.

ALTER TABLE blog_drafts ADD COLUMN idea_id uuid REFERENCES idea_archives(id) ON DELETE SET NULL;
ALTER TABLE video_drafts ADD COLUMN idea_id uuid REFERENCES idea_archives(id) ON DELETE SET NULL;
ALTER TABLE shorts_drafts ADD COLUMN idea_id uuid REFERENCES idea_archives(id) ON DELETE SET NULL;
ALTER TABLE podcast_drafts ADD COLUMN idea_id uuid REFERENCES idea_archives(id) ON DELETE SET NULL;

CREATE INDEX idx_blog_drafts_idea ON blog_drafts(idea_id) WHERE idea_id IS NOT NULL;
CREATE INDEX idx_video_drafts_idea ON video_drafts(idea_id) WHERE idea_id IS NOT NULL;
CREATE INDEX idx_shorts_drafts_idea ON shorts_drafts(idea_id) WHERE idea_id IS NOT NULL;
CREATE INDEX idx_podcast_drafts_idea ON podcast_drafts(idea_id) WHERE idea_id IS NOT NULL;

-- Backfill: link drafts to ideas via project → stages → idea_archive
-- Only populates where a clear 1:1 mapping exists.
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
