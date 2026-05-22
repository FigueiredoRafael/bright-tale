'use client';

/**
 * CanonicalTrackPicker — step-by-step UX after canonical approval.
 *
 * Replaces the silent auto-jump to the first active track. Lists active tracks
 * with a "Go to production →" button per row, plus a "+ Add medium" affordance
 * that opens the same AddMediumDialog used by FocusSidebar so the experience
 * is unified across the canonical stage and the sidebar.
 *
 * Supervised / overview modes keep the auto-jump (orchestrator drives server-
 * side, the engine just routes the user for visibility) and never render this.
 */

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, FileText, Mic, Plus, Video, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddMediumDialog } from '@/components/pipeline/AddMediumDialog';
import { fetchTracks, type TrackMedium, type TrackSnapshot } from '@/lib/pipeline/advanceUrl';
import type { Medium } from '@brighttale/shared/pipeline/inputs';

const MEDIUM_LABEL: Record<TrackMedium, string> = {
  blog: 'Blog',
  video: 'Video',
  shorts: 'Shorts',
  podcast: 'Podcast',
};
const MEDIUM_ICON: Record<TrackMedium, typeof FileText> = {
  blog: FileText,
  video: Video,
  shorts: Zap,
  podcast: Mic,
};

interface Props {
  projectId: string;
  channelId: string;
  onPick: (track: TrackSnapshot) => void;
}

export function CanonicalTrackPicker({ projectId, channelId, onPick }: Props) {
  const [tracks, setTracks] = useState<TrackSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await fetchTracks(projectId);
      setTracks(fresh);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void reload(); }, [reload]);

  const activeTracks = tracks.filter((t) => t.status === 'active' && !t.paused);
  const existingMedia = tracks
    .filter((t) => t.status !== 'aborted')
    .map((t) => t.medium)
    .filter((m): m is TrackMedium => !!m);

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.04] p-3 space-y-2" data-testid="canonical-track-picker">
      <div className="text-xs font-medium text-foreground">Pick a medium to produce</div>
      {loading && activeTracks.length === 0 && (
        <div className="text-xs text-muted-foreground" data-testid="canonical-track-picker-loading">Loading tracks…</div>
      )}
      {!loading && activeTracks.length === 0 && (
        <div className="text-xs text-muted-foreground" data-testid="canonical-track-picker-empty">
          No active tracks. Add a medium to get started.
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {activeTracks.map((track) => {
          const medium = (track.medium ?? 'blog') as TrackMedium;
          const Icon = MEDIUM_ICON[medium];
          const label = MEDIUM_LABEL[medium];
          return (
            <div
              key={track.id}
              data-testid={`canonical-track-row-${medium}`}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2"
            >
              <div className="flex items-center gap-2 text-sm">
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </div>
              <Button
                size="sm"
                onClick={() => onPick(track)}
                data-testid={`canonical-track-go-${medium}`}
                className="gap-1.5"
              >
                Go to production <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
      <div className="pt-1">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => setAddOpen(true)}
          data-testid="canonical-track-add-medium"
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add medium
        </Button>
      </div>
      <AddMediumDialog
        open={addOpen}
        projectId={projectId}
        channelId={channelId}
        existingMedia={existingMedia as Medium[]}
        onClose={() => setAddOpen(false)}
        onTrackAdded={() => { void reload(); }}
      />
    </div>
  );
}
