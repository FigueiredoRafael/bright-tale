'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MEDIA } from '@brighttale/shared/pipeline/inputs';
import type { Medium } from '@brighttale/shared/pipeline/inputs';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  projectId: string;
  channelId: string;
  existingMedia: Medium[];
  onClose: () => void;
  onTrackAdded: () => void;
}

interface ChannelData {
  id: string;
  name: string;
  defaultMediaConfigJson: Record<string, unknown>;
}

// ─── AddMediumDialog ──────────────────────────────────────────────────────────

export function AddMediumDialog({
  open,
  projectId,
  channelId,
  existingMedia,
  onClose,
  onTrackAdded,
}: Props) {
  const availableMedia = MEDIA.filter((m) => !existingMedia.includes(m));

  const [selectedMedium, setSelectedMedium] = useState<Medium | ''>('');
  const [channelData, setChannelData] = useState<ChannelData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch channel defaults on open
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSelectedMedium('');

    fetch(`/api/channels/${channelId}`)
      .then((res) => res.json())
      .then(({ data, error: apiError }: { data: ChannelData | null; error: { message: string } | null }) => {
        if (apiError) {
          setError(apiError.message);
        } else if (data) {
          setChannelData(data);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load channel data');
      });
  }, [open, channelId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMedium) return;

    setSubmitting(true);
    setError(null);

    const defaultMediaConfig =
      channelData?.defaultMediaConfigJson?.[selectedMedium] ?? {};

    try {
      const res = await fetch(`/api/projects/${projectId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medium: selectedMedium,
          defaultMediaConfig,
        }),
      });

      const { data, error: apiError } = await res.json() as {
        data: { track: { id: string; medium: string; status: string; paused: boolean } } | null;
        error: { code: string; message: string } | null;
      };

      if (apiError || !data) {
        setError(apiError?.message ?? 'Failed to create track');
      } else {
        onClose();
        onTrackAdded();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create track');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }} data-testid="add-medium-dialog">
      <DialogContent data-testid="add-medium-dialog">
        <DialogHeader>
          <DialogTitle>Add a medium</DialogTitle>
        </DialogHeader>

        {availableMedia.length === 0 ? (
          <p data-testid="add-medium-all-tracked" className="text-sm text-muted-foreground py-2">
            All media are already tracked for this project.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="add-medium-select" className="text-sm font-medium">
                Medium
              </label>
              <select
                id="add-medium-select"
                data-testid="add-medium-select"
                value={selectedMedium}
                onChange={(e) => setSelectedMedium(e.target.value as Medium | '')}
                className="border rounded px-2 py-1.5 text-sm bg-background"
              >
                <option value="">Select a medium…</option>
                {availableMedia.map((m) => (
                  <option key={m} value={m}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {submitting && (
              <p data-testid="add-medium-loading" aria-live="polite" className="text-sm text-muted-foreground">
                Adding medium…
              </p>
            )}

            {error !== null && (
              <p data-testid="add-medium-error" aria-live="polite" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="add-medium-submit"
                disabled={!selectedMedium || submitting}
              >
                Add medium
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
