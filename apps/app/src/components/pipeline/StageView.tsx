"use client";

/**
 * <StageView> — single-Stage detail view rendered by the supervised
 * variant of <PipelineView>. Picks one of four UI states from the
 * current Stage Run Status:
 *
 *   - no Stage Run yet      → the per-stage form (BrainstormForm today)
 *   - queued | running      → activity panel + Abort button
 *   - awaiting_user         → manual_paste textarea OR manual_advance Continue
 *   - completed | failed |
 *     aborted | skipped     → payload summary + Re-run button
 *
 * The Re-run button posts a fresh /stage-runs (orchestrator increments
 * attempt_no automatically).
 */
import { useState } from 'react';
import { type Stage, type StageRun } from '@brighttale/shared/pipeline/inputs';
import { useProjectStream } from '@/hooks/useProjectStream';
import { BrainstormForm } from './BrainstormForm';

interface StageViewProps {
  projectId: string;
  stage: Stage;
}

export function StageView({ projectId, stage }: StageViewProps) {
  const { stageRuns, liveEvent, isConnected, refresh } = useProjectStream(projectId);
  const run = stageRuns[stage];

  return (
    <section className="space-y-3" data-testid={`stage-view-${stage}`} data-status={run?.status ?? 'idle'}>
      <header className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`inline-block h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-slate-300'}`}
          aria-label={isConnected ? 'Live' : 'Disconnected'}
        />
        <span>Stage: {stage}</span>
        {run ? <span>· attempt {run.attemptNo}</span> : null}
      </header>

      {!run ? <FormForStage projectId={projectId} stage={stage} onSubmitted={refresh} /> : null}

      {run && (run.status === 'queued' || run.status === 'running') ? (
        <ActivityPanel run={run} projectId={projectId} liveMessage={liveEvent?.message ?? null} />
      ) : null}

      {run && run.status === 'awaiting_user' ? (
        <AwaitingUserPanel run={run} projectId={projectId} />
      ) : null}

      {run && (run.status === 'completed' || run.status === 'failed' || run.status === 'aborted' || run.status === 'skipped') ? (
        <TerminalPanel run={run} projectId={projectId} />
      ) : null}
    </section>
  );
}

function FormForStage({
  projectId,
  stage,
  onSubmitted,
}: {
  projectId: string;
  stage: Stage;
  onSubmitted: () => void;
}) {
  if (stage === 'brainstorm') {
    return <BrainstormForm projectId={projectId} onSubmitted={() => onSubmitted()} />;
  }
  return (
    <div className="rounded-md border p-4 text-sm text-muted-foreground" data-testid="stage-form-placeholder">
      No form yet for <span className="font-mono">{stage}</span>. Migrate it the same way Brainstorm was migrated in Slice 5.
    </div>
  );
}

function ActivityPanel({
  run,
  projectId,
  liveMessage,
}: {
  run: StageRun;
  projectId: string;
  liveMessage: string | null;
}) {
  const [aborting, setAborting] = useState(false);

  async function abort(): Promise<void> {
    setAborting(true);
    try {
      await fetch(`/api/projects/${projectId}/stage-runs/${run.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'abort' }),
      });
    } finally {
      setAborting(false);
    }
  }

  return (
    <div className="rounded-md border p-3" data-testid="activity-panel">
      <div className="text-sm font-medium">
        {run.status === 'queued' ? 'Queued — waiting to start' : 'Running…'}
      </div>
      {liveMessage ? <div className="mt-1 text-sm text-muted-foreground">{liveMessage}</div> : null}
      <button
        type="button"
        onClick={abort}
        disabled={aborting}
        className="mt-3 rounded-md border px-3 py-1.5 text-sm"
        data-testid="stage-abort"
      >
        {aborting ? 'Aborting…' : 'Abort'}
      </button>
    </div>
  );
}

function AwaitingUserPanel({ run, projectId }: { run: StageRun; projectId: string }) {
  const reason = run.awaitingReason;
  if (reason === 'manual_advance') {
    return <ManualAdvancePanel run={run} projectId={projectId} />;
  }
  if (reason === 'manual_paste') {
    return <ManualPastePanel run={run} projectId={projectId} />;
  }
  return (
    <div className="rounded-md border p-3 text-sm" data-testid="awaiting-unknown">
      Awaiting user — reason: {reason ?? 'unspecified'}
    </div>
  );
}

function ManualAdvancePanel({ run, projectId }: { run: StageRun; projectId: string }) {
  const [busy, setBusy] = useState(false);

  async function cont(): Promise<void> {
    setBusy(true);
    try {
      await fetch(`/api/projects/${projectId}/stage-runs/${run.id}/continue`, {
        method: 'POST',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border p-3" data-testid="manual-advance-panel">
      <div className="text-sm">Pipeline paused for confirmation.</div>
      <button
        type="button"
        onClick={cont}
        disabled={busy}
        className="mt-3 rounded-md border bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        data-testid="stage-continue"
      >
        {busy ? 'Continuing…' : 'Continue'}
      </button>
    </div>
  );
}

function ManualPastePanel({ run, projectId }: { run: StageRun; projectId: string }) {
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!output.trim()) {
      setError('Paste the AI output before submitting.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/stage-runs/${run.id}/manual-output`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ output: output.trim() }),
      });
      const body = await res.json();
      if (!res.ok || body?.error) {
        setError(body?.error?.message ?? 'Failed to submit manual output');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border p-3" data-testid="manual-paste-panel">
      <div className="text-sm">Paste the AI output produced externally:</div>
      <textarea
        value={output}
        onChange={(e) => setOutput(e.target.value)}
        rows={8}
        className="mt-2 w-full rounded border p-2 font-mono text-sm"
        data-testid="stage-manual-output"
      />
      {error ? (
        <div className="mt-2 text-sm text-rose-600" role="alert">
          {error}
        </div>
      ) : null}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-3 rounded-md border bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        data-testid="stage-manual-submit"
      >
        {busy ? 'Submitting…' : 'Submit output'}
      </button>
    </div>
  );
}

function TerminalPanel({ run, projectId }: { run: StageRun; projectId: string }) {
  const [busy, setBusy] = useState(false);

  async function rerun(): Promise<void> {
    setBusy(true);
    try {
      // Re-running is just POSTing a fresh Stage Run with the same input.
      // For Brainstorm the user will hit the form again; this button covers
      // failed/aborted/skipped cases where the user wants another attempt.
      await fetch(`/api/projects/${projectId}/stage-runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage: run.stage, input: run.inputJson ?? {} }),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border p-3" data-testid="terminal-panel">
      <div className="text-sm font-medium capitalize">Status: {run.status}</div>
      {run.errorMessage ? (
        <div className="mt-1 text-sm text-rose-700">{run.errorMessage}</div>
      ) : null}
      {run.payloadRef ? (
        <div className="mt-1 text-xs text-muted-foreground">
          Output: <span className="font-mono">{run.payloadRef.kind}#{run.payloadRef.id}</span>
        </div>
      ) : null}
      <button
        type="button"
        onClick={rerun}
        disabled={busy}
        className="mt-3 rounded-md border px-3 py-1.5 text-sm"
        data-testid="stage-rerun"
      >
        {busy ? 'Starting…' : 'Re-run'}
      </button>
    </div>
  );
}
