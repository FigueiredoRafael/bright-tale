'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownPreview } from '@/components/preview/MarkdownPreview';
import { ManualModePanel } from '@/components/ai/ManualModePanel';
import { useManualMode } from '@/hooks/use-manual-mode';
import { Sparkles, ClipboardPaste, Loader2 } from 'lucide-react';
import { PipelineStages, type PipelineStep } from '@/components/pipeline/PipelineStages';
import { ReviewEngine } from '@/components/engines/ReviewEngine';
import { AssetsEngine } from '@/components/engines/AssetsEngine';
import { PublishEngine } from '@/components/engines/PublishEngine';
import { StandaloneEngineHost } from '@/components/engines/StandaloneEngineHost';
import type { ReviewResult } from '@/components/engines/types';
import { toast } from 'sonner';

interface Draft {
  id: string;
  title: string | null;
  type: string;
  status: string;
  draft_json: Record<string, unknown> | null;
  canonical_core_json: Record<string, unknown> | null;
  review_feedback_json: Record<string, unknown> | null;
  production_settings_json: Record<string, unknown> | null;
  review_score: number | null;
  review_verdict: string;
  iteration_count: number;
  approved_at: string | null;
  wordpress_post_id: number | null;
  published_url: string | null;
  scheduled_at: string | null;
  published_at: string | null;
}

interface ContentAsset {
  id: string;
  url: string;
  webpUrl: string | null;
  role: string | null;
  altText: string | null;
  sourceType: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  in_review: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  scheduled: 'bg-purple-100 text-purple-800',
  published: 'bg-green-200 text-green-900',
  failed: 'bg-red-100 text-red-800',
};

export default function DraftDetailPage() {
  const params = useParams();
  const draftId = params.draftId as string;
  const channelId = params.id as string;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const { enabled: manualEnabled } = useManualMode();
  const [activeTab, setActiveTab] = useState('content');
  const [editedBody, setEditedBody] = useState('');
  const [brainstormSessionId, setBrainstormSessionId] = useState<string | undefined>();
  const [researchSessionId, setResearchSessionId] = useState<string | undefined>();
  const [projectId, setProjectId] = useState<string | undefined>();
  const [projectTitle, setProjectTitle] = useState<string | undefined>();
  const [ideaTitle, setIdeaTitle] = useState<string | undefined>();

  const fetchDraft = useCallback(async () => {
    const res = await fetch(`/api/content-drafts/${draftId}`);
    const { data } = await res.json();
    if (data) {
      setDraft(data);
      const body = (data.draft_json as Record<string, unknown>)?.full_draft as string;
      if (body) setEditedBody(body);

      // Use pipeline API to get full context
      const pid = data.project_id as string | undefined;
      if (pid) {
        setProjectId(pid);
        try {
          const pRes = await fetch(`/api/projects/${pid}/pipeline`);
          const pJson = await pRes.json();
          if (pJson.data) {
            setProjectTitle(pJson.data.project?.title);
            const bs = pJson.data.brainstormSessions?.[0];
            if (bs) setBrainstormSessionId(bs.id);
            const rs = pJson.data.researchSessions?.[0];
            if (rs) setResearchSessionId(rs.id);
            const ideas = pJson.data.ideas ?? [];
            if (ideas.length > 0) setIdeaTitle(ideas[0].title);
          }
        } catch { /* pipeline fetch optional */ }
      } else {
        // Fallback: extract from draft fields
        const rsId = data.research_session_id as string | undefined;
        if (rsId) setResearchSessionId(rsId);
      }
    }
    setLoading(false);
  }, [draftId]);

  const fetchAssets = useCallback(async () => {
    const res = await fetch(`/api/assets?draft_id=${draftId}`);
    const { data } = await res.json();
    const items = Array.isArray(data) ? data : (data?.assets ?? data?.items ?? []);
    if (items.length > 0) {
      setAssets(
        (items as Array<Record<string, unknown>>).map((a) => ({
          id: a.id as string,
          url: a.url as string,
          webpUrl: (a.webp_url as string) ?? null,
          role: (a.role as string) ?? null,
          altText: (a.alt_text as string) ?? null,
          sourceType: (a.source_type as string) ?? 'ai_generated',
        })),
      );
    }
  }, [draftId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchDraft();
    void fetchAssets();
  }, [fetchDraft, fetchAssets]);

  const handleSubmitForReview = async () => {
    if (!draft) return;
    setReviewing(true);
    // First set status to in_review
    await fetch(`/api/content-drafts/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_review' }),
    });
    // Then trigger review
    const res = await fetch(`/api/content-drafts/${draftId}/review`, { method: 'POST' });
    const { data } = await res.json();
    if (data?.draft) setDraft(data.draft);
    setReviewing(false);
  };

  const handleRevise = async () => {
    if (!draft) return;
    const draftJson = { ...(draft.draft_json ?? {}), full_draft: editedBody };
    const res = await fetch(`/api/content-drafts/${draftId}/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftJson }),
    });
    const { data } = await res.json();
    if (data) setDraft(data);
  };


  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading draft...</div>;
  }
  if (!draft) {
    return <div className="p-6 text-red-500">Draft not found.</div>;
  }

  const blogBody = (draft.draft_json as Record<string, unknown>)?.full_draft as string ?? '';

  // Determine pipeline step from draft state
  let pipelineStep: PipelineStep = 'draft';
  if (draft.status === 'draft' && draft.draft_json) pipelineStep = 'review';
  if (draft.status === 'in_review') pipelineStep = 'review';
  if (draft.review_verdict === 'approved' || draft.status === 'approved') pipelineStep = 'assets';
  if (draft.status === 'published' || draft.status === 'scheduled') pipelineStep = 'published';

  return (
    <div>
      <PipelineStages
        currentStep={pipelineStep}
        channelId={channelId}
        draftId={draftId}
        brainstormSessionId={brainstormSessionId}
        researchSessionId={researchSessionId}
        projectId={projectId}
        projectTitle={projectTitle}
        ideaTitle={ideaTitle ?? draft.title ?? undefined}
      />
      <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{draft.title ?? 'Untitled Draft'}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">{draft.type}</Badge>
            <Badge className={STATUS_COLORS[draft.status] ?? ''}>
              {draft.status.replace('_', ' ')}
            </Badge>
            {draft.review_score !== null && (
              <Badge variant="outline" className="text-xs">
                {draft.review_verdict === 'approved' ? 'Approved' : draft.review_verdict?.replace('_', ' ') ?? `${draft.review_score}/100`}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="publish">Publish</TabsTrigger>
        </TabsList>

        {/* Content Tab */}
        <TabsContent value="content">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Editor */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Editor</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  className="min-h-[500px] font-mono text-sm"
                  value={editedBody}
                  onChange={(e) => setEditedBody(e.target.value)}
                />
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await fetch(`/api/content-drafts/${draftId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          draftJson: { ...(draft.draft_json ?? {}), full_draft: editedBody },
                        }),
                      });
                      await fetchDraft();
                    }}
                  >
                    Save Changes
                  </Button>
                  {draft.status === 'draft' && draft.draft_json && (
                    <Button size="sm" onClick={() => setActiveTab('review')}>
                      Submit for Review →
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Preview */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownPreview content={editedBody || blogBody} className="min-h-[500px]" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Review Tab */}
        <TabsContent value="review">
          <StandaloneEngineHost
            stage="review"
            channelId={channelId}
            projectId={projectId}
            initialStageResults={{
              draft: {
                draftId,
                draftTitle: draft.title ?? '',
                draftContent: '',
                completedAt: new Date(0).toISOString(),
              },
            }}
            onStageComplete={(_stage, result) => {
              const r = result as unknown as ReviewResult;
              if (r.verdict === 'approved') setActiveTab('assets');
            }}
          >
            <ReviewEngine draft={draft as unknown as Record<string, unknown>} />
          </StandaloneEngineHost>
        </TabsContent>

        {/* Assets Tab */}
        <TabsContent value="assets">
          <StandaloneEngineHost
            stage="assets"
            channelId={channelId}
            projectId={projectId}
            initialStageResults={{
              draft: {
                draftId,
                draftTitle: draft.title ?? '',
                draftContent: '',
                completedAt: new Date(0).toISOString(),
              },
              review: {
                score: draft.review_score ?? 0,
                verdict: draft.review_verdict ?? '',
                feedbackJson: draft.review_feedback_json ?? {},
                iterationCount: 0,
                completedAt: new Date(0).toISOString(),
              },
            }}
            onStageComplete={() => setActiveTab('publish')}
          >
            <AssetsEngine mode="generate" draft={draft as unknown as Record<string, unknown>} />
          </StandaloneEngineHost>
        </TabsContent>

        {/* Publish Tab */}
        <TabsContent value="publish">
          <StandaloneEngineHost
            stage="publish"
            channelId={channelId}
            projectId={projectId}
            initialStageResults={{
              draft: {
                draftId,
                draftTitle: draft.title ?? '',
                draftContent: '',
                completedAt: new Date(0).toISOString(),
              },
              review: {
                score: draft.review_score ?? 0,
                verdict: draft.review_verdict ?? '',
                feedbackJson: draft.review_feedback_json ?? {},
                iterationCount: 0,
                completedAt: new Date(0).toISOString(),
              },
              assets: {
                assetIds: assets.map((a) => a.id),
                featuredImageUrl: assets.find((a) => a.role === 'featured_image')?.url ?? undefined,
                completedAt: new Date(0).toISOString(),
              },
            }}
            onStageComplete={() => void fetchDraft()}
          >
            <PublishEngine draft={draft} />
          </StandaloneEngineHost>
        </TabsContent>
      </Tabs>
    </div>
    </div>
  );
}

function getStepClass(step: string, draft: Draft): string {
  const active = 'font-semibold text-foreground';
  const done = 'text-green-600 dark:text-green-400';
  const inactive = '';

  switch (step) {
    case 'Draft':
      return draft.draft_json ? done : draft.canonical_core_json ? active : inactive;
    case 'Core':
      return draft.canonical_core_json ? done : inactive;
    case 'Review':
      return draft.review_verdict === 'approved' ? done
        : draft.status === 'in_review' ? active
        : draft.iteration_count > 0 ? active
        : inactive;
    case 'Assets':
      return draft.status === 'approved' ? active : draft.status === 'published' ? done : inactive;
    case 'Published':
      return draft.status === 'published' || draft.status === 'scheduled' ? done : inactive;
    default:
      return inactive;
  }
}
