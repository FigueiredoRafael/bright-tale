'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownPreview } from '@/components/preview/MarkdownPreview';
import { ReviewFeedbackPanel } from '@/components/preview/ReviewFeedbackPanel';
import { AssetGallery } from '@/components/preview/AssetGallery';
import { PublishPanel } from '@/components/preview/PublishPanel';
import { ManualModePanel } from '@/components/ai/ManualModePanel';
import { useManualMode } from '@/hooks/use-manual-mode';
import { Sparkles, ClipboardPaste, Loader2 } from 'lucide-react';
import { PipelineStages, type PipelineStep } from '@/components/pipeline/PipelineStages';
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
  const [publishing, setPublishing] = useState(false);
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

  const handlePublish = async (params: { mode: string; configId: string; scheduledDate?: string }) => {
    setPublishing(true);
    const res = await fetch('/api/wordpress/publish-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draftId,
        configId: params.configId,
        mode: params.mode,
        scheduledDate: params.scheduledDate,
      }),
    });
    await res.json();
    await fetchDraft();
    setPublishing(false);
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
              <span className="text-sm text-muted-foreground">Score: {draft.review_score}/100</span>
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
          <div className="max-w-2xl space-y-4">
            {/* Existing review feedback */}
            {draft.review_feedback_json && (
              <ReviewFeedbackPanel
                reviewScore={draft.review_score}
                reviewVerdict={draft.review_verdict}
                iterationCount={draft.iteration_count}
                feedbackJson={draft.review_feedback_json as Record<string, unknown>}
              />
            )}

            {/* Approved → next step */}
            {draft.review_verdict === 'approved' && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">Draft approved</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Proceed to generate assets and publish.</p>
                </div>
                <Button size="sm" onClick={() => setActiveTab('assets')}>
                  Next: Assets →
                </Button>
              </div>
            )}

            {/* Revision required */}
            {draft.review_verdict === 'revision_required' && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-3">
                <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">Revision required</p>
                <p className="text-xs text-muted-foreground">Fix the issues above, then resubmit for review.</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setActiveTab('content')}>
                    Edit Manually
                  </Button>
                  <Button
                    size="sm"
                    disabled={reviewing}
                    onClick={async () => {
                      setReviewing(true);
                      const res = await fetch(`/api/content-drafts/${draftId}/reproduce`, { method: 'POST' });
                      const json = await res.json();
                      if (json.data) {
                        setDraft(json.data);
                        setEditedBody((json.data.draft_json as Record<string, unknown>)?.full_draft as string ?? '');
                        toast.success('Draft revised by AI — review the changes');
                      } else {
                        toast.error(json.error?.message ?? 'Revision failed');
                      }
                      setReviewing(false);
                    }}
                  >
                    {reviewing ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Revising...</> : <><Sparkles className="h-3.5 w-3.5 mr-1" /> AI Revision</>}
                  </Button>
                  {manualEnabled && (
                    <Button size="sm" variant="outline" onClick={handleRevise}>
                      Manual Revise & Resubmit
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Submit for review — AI or Manual */}
            {draft.draft_json && (draft.review_verdict === 'pending' || !draft.review_feedback_json) && (
              <Tabs defaultValue="ai">
                <TabsList>
                  <TabsTrigger value="ai" className="gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> AI Review
                  </TabsTrigger>
                  {manualEnabled && (
                    <TabsTrigger value="manual" className="gap-1.5">
                      <ClipboardPaste className="h-3.5 w-3.5" /> Manual Review
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="ai" className="mt-3 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Submit to the AI review agent. Score 90+ with no critical issues = approved.
                  </p>
                  <Button onClick={handleSubmitForReview} disabled={reviewing}>
                    {reviewing ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Reviewing...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-2" /> Submit for AI Review</>
                    )}
                  </Button>
                </TabsContent>

                {manualEnabled && (
                  <TabsContent value="manual" className="mt-3">
                    <ManualModePanel
                      agentSlug="review"
                      inputContext={[
                        `Draft title: ${draft.title ?? 'Untitled'}`,
                        `Type: ${draft.type}`,
                        '',
                        'Review this content. Output:',
                        '{"overall_verdict":"approved|revision_required|rejected","blog_review":{"score":0-100,"strengths":[],"critical_issues":[],"minor_issues":[]}}',
                      ].join('\n')}
                      pastePlaceholder={'Paste JSON:\n{"overall_verdict":"approved","blog_review":{"score":92,"strengths":["..."],"critical_issues":[],"minor_issues":["..."]}}'}
                      onImport={async (parsed) => {
                        const obj = parsed as Record<string, unknown>;
                        const verdict = String(obj.overall_verdict ?? 'revision_required');
                        await fetch(`/api/content-drafts/${draftId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            reviewFeedbackJson: obj,
                            status: verdict === 'approved' ? 'approved' : 'in_review',
                          }),
                        });
                        await fetchDraft();
                      }}
                      importLabel="Import Review"
                    />
                  </TabsContent>
                )}
              </Tabs>
            )}

            {/* No content yet */}
            {!draft.draft_json && (
              <p className="text-sm text-muted-foreground">
                Produce content first before requesting review.
              </p>
            )}
          </div>
        </TabsContent>

        {/* Assets Tab */}
        <TabsContent value="assets">
          <AssetGallery
            assets={assets}
            draftStatus={draft.status}
            onGenerateAll={async () => {
              await fetch(`/api/content-drafts/${draftId}/generate-assets`, { method: 'POST' });
              await fetchAssets();
            }}
          />
        </TabsContent>

        {/* Publish Tab */}
        <TabsContent value="publish">
          <div className="max-w-lg">
            <PublishPanel
              draftId={draftId}
              draftStatus={draft.status}
              hasAssets={assets.length > 0}
              wordpressPostId={draft.wordpress_post_id}
              publishedUrl={draft.published_url}
              onPublish={handlePublish}
              isPublishing={publishing}
            />
          </div>
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
