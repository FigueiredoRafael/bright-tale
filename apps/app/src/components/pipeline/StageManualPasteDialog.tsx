'use client';

import { useState } from 'react';
import { ManualOutputDialog } from '@/components/engines/ManualOutputDialog';
import { toast } from 'sonner';

interface Props {
  projectId: string;
  stageRunId: string;
  stage: string;
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => Promise<void> | void;
}

const STAGE_TITLES: Record<string, string> = {
  brainstorm: 'Paste brainstorm output',
  research: 'Paste research output',
  canonical: 'Paste canonical core output',
  production: 'Paste production output',
  review: 'Paste review output',
};

const STAGE_PLACEHOLDERS: Record<string, string> = {
  brainstorm: 'BC_BRAINSTORM_OUTPUT JSON',
  research: 'BC_RESEARCH_OUTPUT JSON',
  canonical: 'BC_CANONICAL_CORE JSON',
  production: 'BC_PRODUCE_OUTPUT JSON',
  review: 'BC_REVIEW_OUTPUT JSON',
};

export function StageManualPasteDialog({
  projectId,
  stageRunId,
  stage,
  open,
  onClose,
  onSubmitted,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(parsed: unknown) {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/stage-runs/${stageRunId}/manual-output`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ output: JSON.stringify(parsed) }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!res.ok || json?.error) {
        toast.error(json?.error?.message ?? 'Failed to submit manual output');
        return;
      }
      toast.success(`${stage} output saved`);
      await onSubmitted?.();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <ManualOutputDialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      onSubmit={handleSubmit}
      title={STAGE_TITLES[stage] ?? 'Paste manual output'}
      description={`Retrieve the prompt from Axiom, run it externally, then paste the ${STAGE_PLACEHOLDERS[stage] ?? 'JSON output'} below.`}
      submitLabel="Submit"
      loading={loading}
    />
  );
}
