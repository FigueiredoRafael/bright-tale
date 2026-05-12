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
 *     aborted | skipped     → payload summary + primary CTA (continue/autopilot)
 *                              + secondary Re-run link
 */
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  FileText,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  XCircle,
  Eye,
} from 'lucide-react';
import {
  STAGES,
  type Stage,
  type StageRun,
  type StageRunStatus,
} from '@brighttale/shared/pipeline/inputs';
import { useProjectStream } from '@/hooks/useProjectStream';
import { BrainstormForm } from './BrainstormForm';
import { cn } from '@/lib/utils';

interface StageViewProps {
  projectId: string;
  stage: Stage;
}

const STAGE_LABELS: Record<Stage, string> = {
  brainstorm: 'Brainstorm',
  research: 'Research',
  draft: 'Draft',
  review: 'Review',
  assets: 'Assets',
  preview: 'Preview',
  publish: 'Publish',
};

interface StageMeta {
  Icon: typeof Lightbulb;
  action: string;
  description: string;
}

const STAGE_META: Record<Stage, StageMeta> = {
  brainstorm: {
    Icon: Lightbulb,
    action: 'Run Brainstorm',
    description: 'Generate content ideas with AI from a topic or a reference URL.',
  },
  research: {
    Icon: Search,
    action: 'Run Research',
    description: 'Gather sources, statistics, and expert quotes about the selected idea.',
  },
  draft: {
    Icon: FileText,
    action: 'Produce Draft',
    description: 'Write a blog post, video script, podcast, or short from the research + idea.',
  },
  review: {
    Icon: FileCheck2,
    action: 'Run Review',
    description: 'Score the draft against the agent-4 quality bar; approve or request revisions.',
  },
  assets: {
    Icon: ImageIcon,
    action: 'Generate Assets',
    description: 'Produce visual prompt briefs (one per section) for downstream image generation.',
  },
  preview: {
    Icon: Eye,
    action: 'Preview',
    description: 'Sanity-check the draft has body content before publishing.',
  },
  publish: {
    Icon: Send,
    action: 'Publish',
    description: 'Push the draft to the connected WordPress site.',
  },
};

const TERMINAL_STATUS_META: Record<
  Exclude<StageRunStatus, 'queued' | 'running' | 'awaiting_user'>,
  { Icon: typeof CheckCircle2; iconClass: string; label: string }
> = {
  completed: { Icon: CheckCircle2, iconClass: 'text-emerald-500', label: 'Completed' },
  failed: { Icon: XCircle, iconClass: 'text-rose-500', label: 'Failed' },
  aborted: { Icon: Ban, iconClass: 'text-zinc-500', label: 'Aborted' },
  skipped: { Icon: Ban, iconClass: 'text-slate-400', label: 'Skipped' },
};

function successorOf(stage: Stage): Stage | null {
  const idx = STAGES.indexOf(stage);
  if (idx < 0 || idx >= STAGES.length - 1) return null;
  return STAGES[idx + 1];
}

/** Sensible default input the orchestrator + dispatcher can consume for each
 *  Stage when the user just clicks "Continue to <next>" in manual mode. */
function defaultInputForStage(stage: Stage): Record<string, unknown> {
  switch (stage) {
    case 'research':
      return { level: 'medium' };
    case 'draft':
      return { type: 'blog' };
    case 'assets':
      return { mode: 'briefs_only' };
    case 'review':
    case 'preview':
    case 'publish':
    default:
      return {};
  }
}

export function StageView({ projectId, stage }: StageViewProps) {
  const { stageRuns, liveEvent, isConnected, project, refresh } = useProjectStream(projectId);
  const run = stageRuns[stage];
  const nextStage = successorOf(stage);
  const nextRun = nextStage ? stageRuns[nextStage] : null;

  return (
    <section className="space-y-3" data-testid={`stage-view-${stage}`} data-status={run?.status ?? 'idle'}>
      <header className="flex items-center gap-2 text-xs" data-testid="stage-breadcrumb">
        <span
          className={cn(
            'inline-block h-2 w-2 rounded-full',
            isConnected ? 'bg-emerald-500' : 'bg-slate-300',
          )}
          aria-label={isConnected ? 'Live' : 'Disconnected'}
        />
        <span className="text-muted-foreground">Pipeline</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden />
        <span className="font-medium">{STAGE_LABELS[stage]}</span>
        {run && run.attemptNo > 1 ? (
          <span
            className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
            data-testid="attempt-badge"
          >
            Attempt {run.attemptNo}
          </span>
        ) : null}
      </header>

      {!run ? <FormForStage projectId={projectId} stage={stage} onSubmitted={refresh} /> : null}

      {run && (run.status === 'queued' || run.status === 'running') ? (
        <ActivityPanel
          run={run}
          projectId={projectId}
          liveMessage={liveEvent?.message ?? null}
          onMutated={refresh}
        />
      ) : null}

      {run && run.status === 'awaiting_user' ? (
        <AwaitingUserPanel run={run} projectId={projectId} onMutated={refresh} />
      ) : null}

      {run && (run.status === 'completed' || run.status === 'failed' || run.status === 'aborted' || run.status === 'skipped') ? (
        <TerminalPanel
          run={run}
          projectId={projectId}
          nextStage={nextStage}
          nextRunExists={Boolean(nextRun)}
          projectMode={project.mode}
          onMutated={refresh}
        />
      ) : null}
    </section>
  );
}

function StageFormHeader({ stage }: { stage: Stage }) {
  const meta = STAGE_META[stage];
  const Icon = meta.Icon;
  return (
    <div className="space-y-1" data-testid="stage-form-header">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-blue-500" aria-hidden />
        <h2 className="text-base font-semibold">{meta.action}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{meta.description}</p>
    </div>
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
  return (
    <div className="space-y-3">
      <StageFormHeader stage={stage} />
      {stage === 'brainstorm' ? (
        <BrainstormForm projectId={projectId} onSubmitted={() => onSubmitted()} />
      ) : (
        <div className="rounded-md border p-4 text-sm text-muted-foreground" data-testid="stage-form-placeholder">
          No form yet for this stage. The Continue button on the previous stage (or autopilot) starts it for you; this Slice 5 page only ships the Brainstorm form.
        </div>
      )}
    </div>
  );
}

function ActivityPanel({
  run,
  projectId,
  liveMessage,
  onMutated,
}: {
  run: StageRun;
  projectId: string;
  liveMessage: string | null;
  onMutated: () => Promise<void>;
}) {
  const [aborting, setAborting] = useState(false);

  async function abort(): Promise<void> {
    setAborting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/stage-runs/${run.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'abort' }),
      });
      if (res.ok) await onMutated();
    } finally {
      setAborting(false);
    }
  }

  return (
    <div className="rounded-md border p-3" data-testid="activity-panel">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" aria-hidden />
        <span>{run.status === 'queued' ? 'Queued — dispatcher will pick this up' : 'Running…'}</span>
      </div>
      {run.status === 'queued' ? (
        <div className="mt-1 pl-6 text-xs text-muted-foreground">
          Usually starts within a few seconds. If it stays queued for &gt; 30s, the Inngest dev
          server may need a restart.
        </div>
      ) : null}
      {liveMessage ? <div className="mt-1 pl-6 text-sm text-muted-foreground">{liveMessage}</div> : null}
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

function AwaitingUserPanel({
  run,
  projectId,
  onMutated,
}: {
  run: StageRun;
  projectId: string;
  onMutated: () => Promise<void>;
}) {
  const reason = run.awaitingReason;
  if (reason === 'manual_advance') {
    return <ManualAdvancePanel run={run} projectId={projectId} onMutated={onMutated} />;
  }
  if (reason === 'manual_paste') {
    return <ManualPastePanel run={run} projectId={projectId} onMutated={onMutated} />;
  }
  return (
    <div className="rounded-md border p-3 text-sm" data-testid="awaiting-unknown">
      Awaiting user — reason: {reason ?? 'unspecified'}
    </div>
  );
}

function ManualAdvancePanel({
  run,
  projectId,
  onMutated,
}: {
  run: StageRun;
  projectId: string;
  onMutated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function cont(): Promise<void> {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/stage-runs/${run.id}/continue`, {
        method: 'POST',
      });
      if (res.ok) await onMutated();
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
        className="mt-3 inline-flex items-center gap-2 rounded-md border bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        data-testid="stage-continue"
      >
        <ArrowRight className="h-4 w-4" aria-hidden />
        {busy ? 'Continuing…' : 'Continue'}
      </button>
    </div>
  );
}

function ManualPastePanel({
  run,
  projectId,
  onMutated,
}: {
  run: StageRun;
  projectId: string;
  onMutated: () => Promise<void>;
}) {
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
      } else {
        await onMutated();
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

// ─── TerminalPanel ────────────────────────────────────────────────────────────

interface TerminalPanelProps {
  run: StageRun;
  projectId: string;
  nextStage: Stage | null;
  nextRunExists: boolean;
  projectMode: 'autopilot' | 'manual';
  onMutated: () => Promise<void>;
}

function TerminalPanel({
  run,
  projectId,
  nextStage,
  nextRunExists,
  projectMode,
  onMutated,
}: TerminalPanelProps) {
  const statusMeta =
    TERMINAL_STATUS_META[run.status as keyof typeof TERMINAL_STATUS_META] ??
    TERMINAL_STATUS_META.completed;
  const Icon = statusMeta.Icon;

  return (
    <div className="rounded-md border p-3" data-testid="terminal-panel">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className={cn('h-4 w-4', statusMeta.iconClass)} aria-hidden />
        <span>{statusMeta.label}</span>
      </div>
      {run.errorMessage ? (
        <div className="mt-2 rounded bg-rose-50 px-2 py-1 text-sm text-rose-800">
          {run.errorMessage}
        </div>
      ) : null}
      <PayloadSummary projectId={projectId} stageRunId={run.id} run={run} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <PrimaryCta
          run={run}
          projectId={projectId}
          nextStage={nextStage}
          nextRunExists={nextRunExists}
          projectMode={projectMode}
          onMutated={onMutated}
        />
        <a
          href={`/projects/${projectId}?stage=${run.stage}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
          data-testid="stage-open-engine"
        >
          <Eye className="h-3 w-3" aria-hidden /> Open in engine
        </a>
        <ReRunLink projectId={projectId} run={run} onMutated={onMutated} />
      </div>
    </div>
  );
}

// ─── PayloadSummary ──────────────────────────────────────────────────────────

interface PayloadResponse {
  payload:
    | {
        kind: 'brainstorm_draft';
        ideas: Array<{ id: string; title: string; isWinner: boolean }>;
      }
    | {
        kind: 'research_session';
        cardCount: number;
        counts?: Record<string, number>;
        level: string | null;
        sources?: Array<{ title: string; url: string | null }>;
      }
    | {
        kind: 'content_draft';
        title: string;
        type: string | null;
        status: string | null;
        publishedUrl: string | null;
        sectionCount?: number;
        sections?: Array<{ title: string; wordCountTarget: number | null }>;
        reviewVerdict?: string | null;
        reviewScore?: number | null;
        iterationCount?: number | null;
        assetSlots?: number;
      }
    | { kind: 'publish_record'; publishedUrl: string | null; wpPostId: string }
    | { kind: string; raw?: Record<string, unknown> }
    | null;
}

function PayloadSummary({
  projectId,
  stageRunId,
  run,
}: {
  projectId: string;
  stageRunId: string;
  run: StageRun;
}) {
  const [payload, setPayload] = useState<PayloadResponse['payload'] | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(run.payloadRef));

  useEffect(() => {
    if (!run.payloadRef) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/stage-runs/${stageRunId}/payload`);
        const body = await res.json();
        if (cancelled) return;
        setPayload(body?.data?.payload ?? null);
      } catch {
        if (!cancelled) setPayload(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, stageRunId, run.payloadRef]);

  if (!run.payloadRef) return null;
  if (loading) {
    return <div className="mt-2 text-xs text-muted-foreground">Loading output…</div>;
  }
  if (!payload) {
    return (
      <div className="mt-2 text-xs text-muted-foreground" data-testid="payload-summary">
        Output: <span className="font-mono">{run.payloadRef.kind}#{run.payloadRef.id}</span>
      </div>
    );
  }

  if (payload.kind === 'brainstorm_draft') {
    const ideas = (payload as { ideas: Array<{ id: string; title: string; isWinner: boolean }> }).ideas ?? [];
    const winner = ideas.find((i) => i.isWinner);
    return (
      <div className="mt-2" data-testid="payload-summary">
        <div className="text-sm">
          <span className="font-medium">{ideas.length} ideas</span> generated
          {winner ? (
            <>
              {' '}
              · selected: <span className="font-medium">{winner.title}</span>
            </>
          ) : null}
        </div>
        {ideas.length > 1 ? (
          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
            {ideas.slice(0, 5).map((i) => (
              <li key={i.id} className={i.isWinner ? 'text-foreground' : ''}>
                {i.title}
              </li>
            ))}
            {ideas.length > 5 ? <li>+{ideas.length - 5} more</li> : null}
          </ul>
        ) : null}
      </div>
    );
  }

  if (payload.kind === 'research_session') {
    const p = payload as {
      cardCount: number;
      counts?: Record<string, number>;
      level: string | null;
      sources?: Array<{ title: string; url: string | null }>;
    };
    const breakdown = p.counts
      ? (['sources', 'statistics', 'expert_quotes', 'counterarguments'] as const)
          .filter((k) => (p.counts?.[k] ?? 0) > 0)
          .map((k) => `${p.counts?.[k]} ${k.replace('_', ' ')}`)
          .join(' · ')
      : null;
    return (
      <div className="mt-2 text-sm space-y-1" data-testid="payload-summary">
        <div>
          <span className="font-medium">{p.cardCount} research cards</span>
          {p.level ? <span className="text-muted-foreground"> · {p.level} depth</span> : null}
        </div>
        {breakdown ? <div className="text-xs text-muted-foreground">{breakdown}</div> : null}
        {p.sources && p.sources.length > 0 ? (
          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
            {p.sources.map((s, i) => (
              <li key={i}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                    {s.title}
                  </a>
                ) : (
                  s.title
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (payload.kind === 'content_draft') {
    const p = payload as {
      title: string;
      type: string | null;
      status: string | null;
      publishedUrl: string | null;
      sectionCount?: number;
      sections?: Array<{ title: string; wordCountTarget: number | null }>;
      reviewVerdict?: string | null;
      reviewScore?: number | null;
      iterationCount?: number | null;
      assetSlots?: number;
    };
    return (
      <div className="mt-2 text-sm space-y-1" data-testid="payload-summary">
        <div>
          <span className="font-medium">{p.title}</span>
          {p.type ? <span className="ml-2 text-xs text-muted-foreground">({p.type})</span> : null}
        </div>
        {p.sectionCount ? (
          <div className="text-xs text-muted-foreground">
            {p.sectionCount} {p.sectionCount === 1 ? 'section' : 'sections'}
            {p.assetSlots ? <> · {p.assetSlots} asset {p.assetSlots === 1 ? 'brief' : 'briefs'}</> : null}
          </div>
        ) : null}
        {p.sections && p.sections.length > 0 ? (
          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
            {p.sections.slice(0, 5).map((s, i) => (
              <li key={i}>
                {s.title || `Section ${i + 1}`}
                {s.wordCountTarget ? (
                  <span className="text-muted-foreground/70"> ({s.wordCountTarget}w)</span>
                ) : null}
              </li>
            ))}
            {(p.sections.length > 5 || (p.sectionCount ?? 0) > 5) ? (
              <li>+{(p.sectionCount ?? p.sections.length) - 5} more</li>
            ) : null}
          </ul>
        ) : null}
        {p.reviewVerdict ? (
          <div className="text-xs">
            Review: <span className="font-medium">{p.reviewVerdict}</span>
            {p.reviewScore != null ? <> · score {p.reviewScore}</> : null}
            {p.iterationCount ? <> · iteration {p.iterationCount}</> : null}
          </div>
        ) : null}
        {p.publishedUrl ? (
          <a
            href={p.publishedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 underline"
          >
            {p.publishedUrl}
          </a>
        ) : null}
      </div>
    );
  }

  if (payload.kind === 'publish_record') {
    const p = payload as { publishedUrl: string | null; wpPostId: string };
    return (
      <div className="mt-2 text-sm" data-testid="payload-summary">
        Published
        {p.publishedUrl ? (
          <>
            {' '}
            ·{' '}
            <a
              href={p.publishedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline"
            >
              {p.publishedUrl}
            </a>
          </>
        ) : (
          <> · WP post #{p.wpPostId}</>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 text-xs text-muted-foreground" data-testid="payload-summary">
      Output: <span className="font-mono">{payload.kind}</span>
    </div>
  );
}

// ─── PrimaryCta ───────────────────────────────────────────────────────────────

function PrimaryCta({
  run,
  projectId,
  nextStage,
  nextRunExists,
  projectMode,
  onMutated,
}: {
  run: StageRun;
  projectId: string;
  nextStage: Stage | null;
  nextRunExists: boolean;
  projectMode: 'autopilot' | 'manual';
  onMutated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  // No CTA when:
  //   - this stage didn't complete cleanly (failed/aborted — user re-runs)
  //   - there is no successor stage (publish is the last)
  //   - the next stage already has a run in flight or done
  if (run.status !== 'completed' && run.status !== 'skipped') return null;
  if (!nextStage) {
    return (
      <div className="mt-3 inline-flex items-center gap-1 text-sm text-emerald-700" data-testid="pipeline-complete">
        <CheckCircle2 className="h-4 w-4" aria-hidden /> Pipeline complete.
      </div>
    );
  }
  if (nextRunExists) return null;

  if (projectMode === 'autopilot') {
    return (
      <div
        className="mt-3 inline-flex items-center gap-2 rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-800"
        data-testid="autopilot-cta"
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        Autopilot will continue to <span className="font-medium">{STAGE_LABELS[nextStage]}</span> automatically.
      </div>
    );
  }

  async function advance(): Promise<void> {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/stage-runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage: nextStage, input: defaultInputForStage(nextStage!) }),
      });
      if (res.ok) await onMutated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={advance}
      disabled={busy}
      className="mt-3 inline-flex items-center gap-2 rounded-md border bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
      data-testid="continue-to-next"
      data-next={nextStage}
    >
      <ArrowRight className="h-4 w-4" aria-hidden />
      {busy ? 'Starting…' : `Continue to ${STAGE_LABELS[nextStage]}`}
    </button>
  );
}

// ─── ReRunLink ────────────────────────────────────────────────────────────────

function ReRunLink({
  projectId,
  run,
  onMutated,
}: {
  projectId: string;
  run: StageRun;
  onMutated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function rerun(): Promise<void> {
    if (!confirm(`Re-run ${run.stage}? A new Stage Run with attempt #${run.attemptNo + 1} will be created.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/stage-runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage: run.stage, input: run.inputJson ?? {} }),
      });
      if (res.ok) await onMutated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={rerun}
        disabled={busy}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
        data-testid="stage-rerun"
      >
        <RotateCcw className="h-3 w-3" aria-hidden />
        {busy ? 'Re-running…' : `Re-run ${run.stage}`}
      </button>
    </div>
  );
}
