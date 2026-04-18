'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (parsed: unknown) => Promise<void>;
  title?: string;
  description?: string;
  submitLabel?: string;
  loading?: boolean;
}

export function ManualOutputDialog({
  open,
  onOpenChange,
  onSubmit,
  title = 'Paste manual output',
  description = 'Retrieve the prompt from Axiom, run it in your AI tool of choice, then paste the JSON output below.',
  submitLabel = 'Submit',
  loading = false,
}: Props) {
  const [raw, setRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      toast.error('Invalid JSON. Paste the full output object.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(parsed);
      setRaw('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder='{"ideas": [ ... ]}'
          rows={14}
          className="font-mono text-xs resize-none flex-1 min-h-[200px] overflow-auto"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting || loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!raw.trim() || submitting || loading}>
            {submitting || loading ? 'Submitting…' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
