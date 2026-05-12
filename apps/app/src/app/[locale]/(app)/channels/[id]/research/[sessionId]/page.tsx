'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  FileText,
  Hash,
  Lightbulb,
  Loader2,
  RefreshCw,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PipelineStages } from '@/components/pipeline/PipelineStages';
import { ResearchFindingsReport } from '@/components/engines/ResearchFindingsReport';
import { synthesizeFindingsFromLegacy } from '@/lib/research/synthesize-findings';

interface SessionRow {
  id: string;
  idea_id: string | null;
  level: 'surface' | 'medium' | 'deep' | string;
  focus_tags: string[] | null;
  status: string;
  cards_json: unknown;
  approved_cards_json: unknown;
  refined_angle_json: Record<string, unknown> | null;
  project_id: string | null;
  input_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface ProjectPipeline {
  project?: { id: string; title: string };
  brainstormSessions?: Array<{ id: string }>;
  contentDrafts?: Array<{ id: string }>;
  ideas?: Array<{ title?: string; verdict?: string }>;
}

const LEVEL_LABEL: Record<string, string> = {
  surface: 'Surface',
  medium: 'Medium',
  deep: 'Deep',
};

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30',
  reviewed: 'bg-primary/10 text-primary ring-primary/30',
  running: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/30',
  awaiting_manual: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/30',
  failed: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/30',
  pending: 'bg-muted text-muted-foreground ring-border',
};

export default function ResearchSessionPage() {
  const params = useParams();
  const channelId = params.id as string;
  const sessionId = params.sessionId as string;
  const router = useRouter();

  const [session, setSession] = useState<SessionRow | null>(null);
  const [pipeline, setPipeline] = useState<ProjectPipeline | null>(null);
  const [ideaTitle, setIdeaTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/research-sessions/${sessionId}`);
        const json = await res.json();
        const sess = (json.data?.session ?? json.data) as SessionRow | null;
        if (!sess) return;
        setSession(sess);

        if (sess.project_id) {
          try {
            const pRes = await fetch(`/api/projects/${sess.project_id}/pipeline`);
            const pJson = await pRes.json();
            if (pJson.data) {
              setPipeline(pJson.data as ProjectPipeline);
              const ideas = (pJson.data.ideas ?? []) as Array<Record<string, unknown>>;
              if (ideas.length > 0 && typeof ideas[0].title === 'string') {
                setIdeaTitle(ideas[0].title);
              }
            }
          } catch {
            /* pipeline optional */
          }
        } else if (sess.idea_id) {
          try {
            const ideaRes = await fetch(`/api/ideas/library?limit=100`);
            const ideaJson = await ideaRes.json();
            const idea = (ideaJson.data?.ideas ?? []).find(
              (i: Record<string, unknown>) =>
                i.id === sess.idea_id || i.idea_id === sess.idea_id,
            ) as Record<string, unknown> | undefined;
            if (idea && typeof idea.title === 'string') setIdeaTitle(idea.title);
          } catch {
            /* silent */
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  const findings = useMemo<Record<string, unknown> | null>(() => {
    if (!session) return null;
    const raw = session.cards_json;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    if (Array.isArray(raw) && raw.length > 0) {
      return synthesizeFindingsFromLegacy(raw as Array<Record<string, unknown>>);
    }
    return null;
  }, [session]);

  const topic = useMemo(() => {
    if (!session) return '';
    const input = session.input_json ?? {};
    return (input.topic as string) ?? ideaTitle ?? 'Untitled Research';
  }, [session, ideaTitle]);

  const createdDate = useMemo(() => {
    if (!session?.created_at) return null;
    try {
      return new Date(session.created_at).toLocaleDateString();
    } catch {
      return null;
    }
  }, [session]);

  async function handleContinue() {
    if (!session) return;
    setContinuing(true);
    try {
      const search = new URLSearchParams();
      search.set('researchSessionId', session.id);
      if (session.idea_id) search.set('ideaId', session.idea_id);
      if (session.project_id) search.set('projectId', session.project_id);
      router.push(`/channels/${channelId}/drafts/new?${search.toString()}`);
    } finally {
      setContinuing(false);
    }
  }

  async function handleRegenerate() {
    if (!session) return;
    const confirmed = window.confirm(
      'Regenerating will create a new research session with the same inputs. Continue?',
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/research-sessions/${session.id}/regenerate`, {
        method: 'POST',
      });
      const json = await res.json();
      const newId = json.data?.sessionId ?? json.data?.id;
      if (newId) {
        router.push(`/channels/${channelId}/research/${newId}`);
      } else if (json.error) {
        toast.error(json.error.message ?? 'Failed to regenerate');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading research...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-10 text-center">
        <p className="text-base text-rose-500 mb-2">Session not found.</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/channels/${channelId}/research`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to research list
        </Button>
      </div>
    );
  }

  const levelLabel = LEVEL_LABEL[session.level] ?? session.level;
  const statusLabel = session.status.replace('_', ' ');
  const statusClass = STATUS_STYLES[session.status] ?? STATUS_STYLES.pending;
  const hasPivot = session.refined_angle_json
    ? Boolean((session.refined_angle_json as Record<string, unknown>).should_pivot)
    : false;
  const projectTitle = pipeline?.project?.title;
  const brainstormSessionId = pipeline?.brainstormSessions?.[0]?.id;
  const draftId = pipeline?.contentDrafts?.[0]?.id;

  return (
    <div className="pb-24">
      {session.project_id ? (
        <div className="px-6 pt-4">
          <button
            type="button"
            onClick={() => router.push(`/projects/${session.project_id}?v=2`)}
            className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Back to pipeline view
          </button>
        </div>
      ) : null}
      <PipelineStages
        currentStep="research"
        channelId={channelId}
        researchSessionId={sessionId}
        brainstormSessionId={brainstormSessionId}
        draftId={draftId}
        projectId={session.project_id ?? undefined}
        projectTitle={projectTitle}
        ideaTitle={ideaTitle ?? undefined}
      />

      <div className="max-w-5xl mx-auto px-6 pt-6 space-y-6">
        {/* Back link */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/channels/${channelId}/research`)}
          className="text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Pesquisas
        </Button>

        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/[0.06] via-card to-card p-6">
          <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="relative space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                <BookOpen className="h-3.5 w-3.5" /> Research Session
              </span>
              <span className="text-muted-foreground text-xs">·</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${statusClass}`}
              >
                {statusLabel}
              </span>
              {hasPivot && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400"
                >
                  Pivot Suggested
                </Badge>
              )}
            </div>

            <h1 className="text-2xl md:text-3xl font-semibold leading-tight">
              {topic}
            </h1>

            <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" />
                <span className="text-foreground/90">{levelLabel}</span> depth
              </span>
              {session.focus_tags && session.focus_tags.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5" />
                  <div className="flex flex-wrap gap-1">
                    {session.focus_tags.map((t) => (
                      <Badge
                        key={t}
                        variant="outline"
                        className="text-[10px] bg-background/50 font-normal"
                      >
                        {t.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                </span>
              )}
              {createdDate && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {createdDate}
                </span>
              )}
              {ideaTitle && !projectTitle && (
                <span className="inline-flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Idea: <span className="text-foreground/90">{ideaTitle}</span>
                </span>
              )}
              {projectTitle && (
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Project: <span className="text-foreground/90">{projectTitle}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Findings report */}
        {findings ? (
          <ResearchFindingsReport findings={findings} />
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No findings available for this session yet.
            </p>
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-50">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={continuing}
          >
            <RefreshCw className="h-4 w-4 mr-1.5" /> Regenerate
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                router.push(`/channels/${channelId}/research/${sessionId}/edit`)
              }
            >
              Edit inputs
            </Button>
            <Button onClick={handleContinue} disabled={continuing || !findings}>
              {continuing ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4 mr-1.5" />
              )}
              Continue to Draft
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
