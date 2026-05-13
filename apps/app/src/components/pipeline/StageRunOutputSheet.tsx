'use client';

/**
 * <StageRunOutputSheet /> — rich, on-demand viewer for a Stage Run's payload.
 *
 * The v2 supervised <StageView /> only shows a `PayloadSummary` card (status
 * + counts + section titles). That worked for status-tracking but the legacy
 * Engines used to render the actual draft content / research findings /
 * idea cards inline — losing that was a visible step backward.
 *
 * This sheet closes the gap: per Payload Ref kind, fetch the underlying row
 * on demand and render the same canonical viewer the legacy Engine and the
 * standalone /channels page use:
 *
 *   content_draft     → <DraftViewer />        (markdown body or video JSON)
 *   research_session  → <ResearchFindingsReport />
 *   brainstorm_draft  → minimal idea-card list (extraction TBD)
 *   publish_record    → outbound WordPress link
 *
 * No xstate, no Engine state — just read + render. The interactive Engine
 * pages remain the place to *edit*. This is the place to *see*.
 */
import { useEffect, useState } from 'react';
import { Loader2, ExternalLink } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { DraftViewer } from '@/components/preview/DraftViewer';
import { ResearchFindingsReport } from '@/components/engines/ResearchFindingsReport';
import type { StageRun } from '@brighttale/shared/pipeline/inputs';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  run: StageRun;
}

export function StageRunOutputSheet({ open, onOpenChange, run }: Props) {
  const kind = run.payloadRef?.kind ?? null;
  const id = run.payloadRef?.id ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-3xl overflow-y-auto"
        data-testid="stage-output-sheet"
      >
        <SheetHeader>
          <SheetTitle>Stage output</SheetTitle>
          <SheetDescription>
            {kind ? `Stage Run output (${kind})` : 'No payload to display.'}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          {!kind || !id ? (
            <p className="text-sm text-muted-foreground">
              This Stage Run did not produce a Payload Ref.
            </p>
          ) : kind === 'content_draft' ? (
            <DraftOutput draftId={id} />
          ) : kind === 'research_session' ? (
            <ResearchOutput sessionId={id} />
          ) : kind === 'brainstorm_draft' ? (
            <BrainstormOutput draftId={id} />
          ) : kind === 'publish_record' ? (
            <PublishOutput run={run} />
          ) : (
            <RawJsonFallback kind={kind} id={id} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── content_draft ──────────────────────────────────────────────────────────

function DraftOutput({ draftId }: { draftId: string }) {
  const { data, loading, error } = useFetchJson<{
    id: string;
    type: string | null;
    title: string | null;
    draft_json: Record<string, unknown> | null;
  }>(`/api/content-drafts/${draftId}`);

  if (loading) return <Spinner />;
  if (error || !data) return <FetchError what="draft" />;

  const dj = data.draft_json ?? null;
  // The blog/shorts/podcast agents land the full body either at the top
  // level (`draft_json.full_draft`) or scoped by type (`draft_json.blog.full_draft`).
  // Fall back across both shapes.
  const body =
    (dj?.full_draft as string | undefined) ??
    ((dj?.blog as Record<string, unknown> | undefined)?.full_draft as string | undefined) ??
    ((dj?.shorts as Record<string, unknown> | undefined)?.full_draft as string | undefined) ??
    ((dj?.podcast as Record<string, unknown> | undefined)?.full_draft as string | undefined) ??
    '';

  return (
    <div className="space-y-3" data-testid="stage-output-draft">
      {data.title ? <h3 className="text-base font-medium">{data.title}</h3> : null}
      <DraftViewer type={data.type} bodyMarkdown={body} draftJson={dj} draftId={draftId} />
    </div>
  );
}

// ─── research_session ───────────────────────────────────────────────────────

function ResearchOutput({ sessionId }: { sessionId: string }) {
  const { data, loading, error } = useFetchJson<{
    id: string;
    cards_json: Record<string, unknown> | null;
    approved_cards_json: Record<string, unknown> | null;
  }>(`/api/research-sessions/${sessionId}`);

  if (loading) return <Spinner />;
  if (error || !data) return <FetchError what="research session" />;

  const findings = (data.approved_cards_json ?? data.cards_json ?? null) as
    | Record<string, unknown>
    | null;
  if (!findings) {
    return <p className="text-sm text-muted-foreground">No findings recorded.</p>;
  }
  return (
    <div data-testid="stage-output-research">
      <ResearchFindingsReport findings={findings} />
    </div>
  );
}

// ─── brainstorm_draft ───────────────────────────────────────────────────────

function BrainstormOutput({ draftId }: { draftId: string }) {
  // Brainstorm idea-card extraction lives inside BrainstormEngine today
  // (1325 lines, xstate-coupled). For now we render the minimal fields the
  // session endpoint already exposes; a follow-up will extract <IdeaCard />
  // so this can render every sibling in the session like the legacy Engine.
  const { data, loading, error } = useFetchJson<{
    id: string;
    title: string | null;
    discovery_data: Record<string, unknown> | null;
    why_works: string | null;
    risks: string | null;
  }>(`/api/brainstorm/drafts/${draftId}`);

  if (loading) return <Spinner />;
  if (error || !data) return <FetchError what="idea" />;

  return (
    <div className="space-y-3 text-sm" data-testid="stage-output-brainstorm">
      {data.title ? <h3 className="text-base font-medium">{data.title}</h3> : null}
      {data.why_works ? (
        <section>
          <h4 className="font-medium text-foreground/80">Why it works</h4>
          <p className="text-muted-foreground">{data.why_works}</p>
        </section>
      ) : null}
      {data.risks ? (
        <section>
          <h4 className="font-medium text-foreground/80">Risks</h4>
          <p className="text-muted-foreground">{data.risks}</p>
        </section>
      ) : null}
    </div>
  );
}

// ─── publish_record ─────────────────────────────────────────────────────────

function PublishOutput({ run }: { run: StageRun }) {
  const url = (run.payloadRef as { published_url?: string } | null)?.published_url ?? null;
  if (!url) {
    return <p className="text-sm text-muted-foreground">Published — link unavailable.</p>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
      data-testid="stage-output-publish"
    >
      <ExternalLink className="h-4 w-4" />
      Open in WordPress
    </a>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function useFetchJson<T>(url: string): { data: T | null; loading: boolean; error: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const res = await fetch(url);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok || body?.error) {
          setError(true);
          setData(null);
        } else {
          setData((body?.data ?? body) as T);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { data, loading, error };
}

function Spinner() {
  return (
    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground" data-testid="stage-output-loading">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      Loading output…
    </div>
  );
}

function FetchError({ what }: { what: string }) {
  return (
    <p className="text-sm text-rose-600" data-testid="stage-output-error">
      Could not load {what}. Try again later.
    </p>
  );
}

function RawJsonFallback({ kind, id }: { kind: string; id: string }) {
  return (
    <p className="text-sm text-muted-foreground font-mono" data-testid="stage-output-raw">
      {kind}#{id}
    </p>
  );
}
