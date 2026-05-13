'use client';

/**
 * <DraftViewer /> — canonical read-and-edit renderer for a content_draft.
 *
 * Picks the right viewer based on draft type:
 *   - video → <VideoDraftViewer />  (rich structured editor)
 *   - everything else → <MarkdownPreview />  (markdown body)
 *
 * Before this component existed, the switch was inlined in DraftEngine and
 * the new v2 supervised view had no way to render the produced draft without
 * duplicating the logic. This is the single seam: legacy DraftEngine, the
 * legacy /channels/:id/drafts/:id page, and the v2 StageRunOutput sheet all
 * consume DraftViewer.
 */
import type { VideoOutput } from '@brighttale/shared/types/agents';
import { MarkdownPreview } from './MarkdownPreview';
import { VideoDraftViewer } from './VideoDraftViewer';

export interface DraftViewerProps {
  type: string | null | undefined;
  /** Markdown body (blog/shorts/podcast). Falls back to empty string. */
  bodyMarkdown?: string | null;
  /** Structured draft for video (full output JSON). */
  draftJson?: Record<string, unknown> | null;
  /** Optional draft id so the video viewer can persist inline edits. */
  draftId?: string;
  /**
   * Called when the video viewer persists an edit. Receives the full
   * draft_json (matches `VideoDraftViewer.onSave`). Omit to render in
   * read-only mode (the v2 StageRunOutputSheet uses this path).
   */
  onVideoSave?: (next: Record<string, unknown>) => void | Promise<void>;
  className?: string;
}

export function DraftViewer({
  type,
  bodyMarkdown,
  draftJson,
  draftId,
  onVideoSave,
  className = '',
}: DraftViewerProps) {
  if (type === 'video' && draftJson) {
    return (
      <VideoDraftViewer
        output={draftJson as unknown as VideoOutput}
        onSave={onVideoSave}
        draftId={draftId}
      />
    );
  }
  return <MarkdownPreview content={bodyMarkdown ?? ''} className={className} />;
}

// `VideoOutput` is reserved for callers that want a tighter type at the
// call site (e.g. legacy DraftEngine). It is not used by the runtime path.
export type { VideoOutput };
