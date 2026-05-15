'use client';

import { useCallback, useRef, useState } from 'react';
import {
  Loader2, FileText, Video, Zap, Mic, Check, ArrowRight, Sparkles, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ModelPicker,
  MODELS_BY_PROVIDER,
  type ProviderId,
} from '@/components/ai/ModelPicker';
import { ManualOutputDialog } from './ManualOutputDialog';
import { GenerationProgressFloat } from '@/components/generation/GenerationProgressFloat';
import { DraftViewer } from '@/components/preview/DraftViewer';
import { ContentWarningBanner } from './ContentWarningBanner';
import { friendlyAiError } from '@/lib/ai/error-message';
import { useUpgrade } from '@/components/billing/UpgradeProvider';
import VideoStyleSelector from '@/components/production/VideoStyleSelector';
import { useSelector } from '@xstate/react';
import { usePipelineActor } from '@/hooks/usePipelineActor';
import { usePipelineAbort } from '@/components/pipeline/PipelineAbortProvider';
import type { VideoStyleConfig } from '@brighttale/shared/schemas/videoStyle';
import type { DraftResult } from './types';
import { usePipelineTracker } from '@/hooks/use-pipeline-tracker';

type Medium = 'blog' | 'video' | 'shorts' | 'podcast';
type Phase = 'produce' | 'done';

interface ProductionEngineProps {
  projectId?: string;
  trackId: string;
  medium: Medium;
}

const DRAFT_PROVIDERS: ProviderId[] = ['gemini', 'openai', 'anthropic', 'ollama', 'manual'];

export function ProductionEngine({ projectId: projectIdProp, trackId, medium }: ProductionEngineProps) {
  const actor = usePipelineActor();
  const abortController = usePipelineAbort();

  const channelId = useSelector(actor, (s) => s.context.channelId);
  const ctxProjectId = useSelector(actor, (s) => s.context.projectId);
  const projectId = projectIdProp ?? ctxProjectId;
  const draftResult = useSelector(actor, (s) => s.context.stageResults.draft);
  const creditSettings = useSelector(actor, (s) => s.context.creditSettings);
  const autopilotConfig = useSelector(actor, (s) => s.context.autopilotConfig);
  const autoMode = useSelector(actor, (s) => s.context.mode);
  const overviewMode = autoMode === 'overview';

  const trackerContext = {
    channelId: channelId ?? undefined,
    projectId,
  };
  const tracker = usePipelineTracker('draft', trackerContext);

  // Produce state
  const [targetWords, setTargetWords] = useState<number>(900);
  const [targetMinutes, setTargetMinutes] = useState<number>(8);
  const [targetShortsSeconds, setTargetShortsSeconds] = useState<number>(30);
  const [videoStyleConfig, setVideoStyleConfig] = useState<VideoStyleConfig>({
    template: 'talking_head_standard',
    cut_frequency: 'moderate',
    b_roll_density: 'low',
    text_overlays: 'minimal',
    music_style: 'calm_ambient',
    presenter_notes: false,
    b_roll_required: false,
  });

  const [phase, setPhase] = useState<Phase>('produce');
  const [draftId] = useState<string | null>(draftResult?.draftId ?? null);
  const [producedContent, setProducedContent] = useState<string>('');
  const [producedDraftJson, setProducedDraftJson] = useState<Record<string, unknown> | null>(null);
  const [contentWarning, setContentWarning] = useState<string | null>(null);

  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [model, setModel] = useState<string>('gemini-2.5-flash');
  const [recommended] = useState<{ provider: string | null; model: string | null }>({
    provider: autopilotConfig?.draft?.providerOverride ?? null,
    model: null,
  });

  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [activeSince, setActiveSince] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [manualState, setManualState] = useState<{
    draftId: string;
    phase: Medium;
  } | null>(null);

  const { handleMaybeCreditsError } = useUpgrade();

  const [derivingShorts, setDerivingShorts] = useState(false);

  const TYPES: { id: Medium; label: string; icon: typeof FileText; cost: number }[] = [
    { id: 'blog', label: 'Blog', icon: FileText, cost: creditSettings.costBlog },
    { id: 'video', label: 'Video', icon: Video, cost: creditSettings.costVideo },
    { id: 'shorts', label: 'Shorts', icon: Zap, cost: creditSettings.costShorts },
    { id: 'podcast', label: 'Podcast', icon: Mic, cost: creditSettings.costPodcast },
  ];

  async function runStep(label: string, fn: () => Promise<Response>) {
    setBusy(true);
    try {
      const res = await fn();
      const json = await res.json();
      if (json.error) {
        if (handleMaybeCreditsError(json.error)) return null;
        const friendly = friendlyAiError(json.error.message ?? '');
        toast.error(`${label}: ${friendly.title}`, { description: friendly.hint });
        return null;
      }
      return json.data;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return null;
      toast.error(`${label} failed`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleProduce() {
    if (busy || !draftId) return;

    actor.send({ type: 'STAGE_PROGRESS', stage: 'draft', partial: { status: 'Writing draft' } });
    const productionParams: Record<string, unknown> = {};
    if (medium === 'blog') productionParams.target_word_count = targetWords;
    if (medium === 'video' || medium === 'podcast') productionParams.target_duration_minutes = targetMinutes;
    if (medium === 'shorts') productionParams.target_duration_minutes = targetShortsSeconds / 60;
    if (medium === 'video') productionParams.video_style_config = videoStyleConfig;

    tracker.trackStarted({
      draftId,
      phase: 'produce',
      provider,
      model,
      format: medium,
      targetLength: medium === 'blog' ? targetWords : medium === 'shorts' ? targetShortsSeconds : targetMinutes,
    });

    setPhase('produce');

    if (provider === 'manual') {
      setBusy(true);
      try {
        const res = await fetch(`/api/content-drafts/${draftId}/produce`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productionParams, provider, model }),
          signal: abortController?.signal,
        });
        const json = await res.json();
        if (json.error) {
          if (handleMaybeCreditsError(json.error)) return;
          const friendly = friendlyAiError(json.error.message ?? '');
          toast.error(`produce content: ${friendly.title}`, { description: friendly.hint });
          setPhase('produce');
          return;
        }
        if (json.data?.status === 'awaiting_manual') {
          setManualState({ draftId, phase: medium });
          return;
        }
        toast.error('Unexpected response from manual provider');
        setPhase('produce');
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') { setPhase('produce'); return; }
        toast.error('produce content failed');
        setPhase('produce');
      } finally {
        setBusy(false);
      }
      return;
    }

    const sinceAnchor = new Date(Date.now() - 1_000).toISOString();
    const enqueued = await runStep('start produce', () =>
      fetch(`/api/content-drafts/${draftId}/produce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productionParams, provider, model }),
        signal: abortController?.signal,
      })
    );
    if (!enqueued) {
      setPhase('produce');
      return;
    }
    setActiveSince(sinceAnchor);
    setActiveDraftId(draftId);
  }

  function onProduceJobComplete() {
    if (!draftId) return;
    setActiveDraftId(null);
    setActiveSince(null);

    (async () => {
      try {
        const res = await fetch(`/api/content-drafts/${draftId}`, {
          signal: abortController?.signal,
        });
        const json = await res.json();
        const draftRow = json.data as Record<string, unknown> | null;
        if (!draftRow) {
          toast.error('Failed to load produced draft');
          return;
        }
        const draftJson = draftRow.draft_json as Record<string, unknown> | null | undefined;
        const hasProducedContent =
          draftJson && typeof draftJson === 'object' && Object.keys(draftJson).length > 0;

        if (hasProducedContent) {
          const content = extractProducedContent(draftRow, medium);
          if (content && content !== '{}') {
            setProducedContent(content);
            setProducedDraftJson((draftJson as Record<string, unknown>) ?? null);
            setPhase('done');
            const warning = typeof draftJson?.content_warning === 'string' ? draftJson.content_warning : null;
            setContentWarning(warning);
            if (!overviewMode) toast.success(`${medium.charAt(0).toUpperCase() + medium.slice(1)} content produced`);
            return;
          }
        }
        toast.error('No produced content found in draft');
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        toast.error('Failed to load produced draft');
      }
    })();
  }

  function onJobFailed(message: string) {
    const friendly = friendlyAiError(message);
    toast.error(friendly.title, { description: friendly.hint });
    setActiveDraftId(null);
    setActiveSince(null);
  }

  async function handleManualOutputSubmit(parsed: unknown) {
    if (!manualState) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/content-drafts/${manualState.draftId}/manual-output`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: manualState.phase,
          output: parsed,
        }),
        signal: abortController?.signal,
      });
      const json = await res.json();
      if (json.error) {
        toast.error('Submit failed', { description: json.error.message });
        return;
      }

      const fmt = manualState.phase;
      const parsedObj = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
      const apiDraft = json.data as Record<string, unknown> | undefined;
      const content =
        (apiDraft && extractProducedContent(apiDraft, fmt)) ||
        extractProducedContent({ draft_json: parsedObj }, fmt) ||
        '';
      setProducedContent(content);
      setProducedDraftJson(
        (apiDraft && extractDraftJson(apiDraft)) ||
        (Object.keys(parsedObj).length > 0 ? parsedObj : null),
      );
      setPhase('done');
      if (!overviewMode) toast.success(`${manualState.phase.charAt(0).toUpperCase() + manualState.phase.slice(1)} content submitted`);
      setManualState(null);
      actor.send({ type: 'STAGE_PROGRESS', stage: 'draft', partial: { draftId: manualState.draftId } });
    } catch (err) {
      toast.error('Submit failed', { description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleManualAbandon() {
    if (!manualState) return;
    setBusy(true);
    try {
      await fetch(`/api/content-drafts/${manualState.draftId}/cancel`, {
        method: 'POST',
      });
    } catch {
      // best-effort
    } finally {
      setBusy(false);
      setManualState(null);
    }
  }

  async function handleManualProduceImport(parsed: unknown) {
    let obj = parsed as Record<string, unknown>;

    const WRAPPERS: Record<Medium, string[]> = {
      blog: ['BC_BLOG_OUTPUT'],
      video: ['BC_VIDEO_OUTPUT'],
      shorts: ['BC_SHORTS_OUTPUT'],
      podcast: ['BC_PODCAST_OUTPUT'],
    };
    for (const key of WRAPPERS[medium]) {
      if (obj[key] && typeof obj[key] === 'object') {
        obj = obj[key] as Record<string, unknown>;
        break;
      }
    }

    let content = '';

    if (medium === 'blog') {
      const blog = (obj.blog && typeof obj.blog === 'object') ? obj.blog as Record<string, unknown> : obj;
      content = typeof blog.full_draft === 'string' ? blog.full_draft : '';
    } else if (medium === 'video') {
      const video = (obj.video_script ?? obj.video ?? obj) as Record<string, unknown>;
      content = typeof video.script === 'string' ? video.script
        : typeof video.full_script === 'string' ? video.full_script
        : typeof video.teleprompter_script === 'string' ? video.teleprompter_script
        : typeof obj.teleprompter_script === 'string' ? (obj.teleprompter_script as string) : '';
    } else if (medium === 'shorts') {
      const shorts = (obj.shorts ?? obj.scripts) as unknown[];
      if (Array.isArray(shorts)) {
        content = shorts.map((s, i) => {
          const item = s as Record<string, unknown>;
          return `## Short ${i + 1}${item.hook ? `: ${item.hook}` : ''}\n\n${item.script ?? item.content ?? JSON.stringify(item, null, 2)}`;
        }).join('\n\n---\n\n');
      }
    } else if (medium === 'podcast') {
      const podcast = (obj.podcast_outline ?? obj.podcast ?? obj) as Record<string, unknown>;
      content = typeof podcast.outline === 'string' ? podcast.outline
        : typeof podcast.full_outline === 'string' ? podcast.full_outline : '';
    }

    if (!content) {
      for (const key of ['full_draft', 'content', 'script', 'outline', 'text', 'markdown']) {
        if (typeof obj[key] === 'string') { content = obj[key] as string; break; }
      }
    }

    if (!content && medium !== 'video') {
      toast.error('Could not extract content. Expected full_draft (blog), script (video), or outline (podcast).');
      return;
    }

    if (draftId) {
      await runStep('save produced content', () =>
        fetch(`/api/content-drafts/${draftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftJson: obj }),
          signal: abortController?.signal,
        })
      );
    }

    setProducedContent(content);
    setProducedDraftJson(obj);
    tracker.trackAction('imported', {
      phase: 'produce',
      source: 'manual',
    });
    setPhase('done');
    if (!overviewMode) toast.success(`${medium.charAt(0).toUpperCase() + medium.slice(1)} content imported`);
  }

  function extractDraftJson(data: Record<string, unknown>): Record<string, unknown> | null {
    const fromRow = (data.draft_json ?? data.draftJson) as Record<string, unknown> | null | undefined;
    if (fromRow && typeof fromRow === 'object' && Object.keys(fromRow).length > 0) return fromRow;
    if (data && typeof data === 'object' && !data.draft_json && !data.draftJson) {
      return data as Record<string, unknown>;
    }
    return null;
  }

  function extractProducedContent(data: Record<string, unknown>, fmt: Medium): string {
    if (typeof data.produced_content === 'string') return data.produced_content;

    const draftJson = (data.draft_json ?? data.draftJson) as Record<string, unknown> | null;
    if (!draftJson) return JSON.stringify(data, null, 2);

    if (fmt === 'blog') {
      const blog = draftJson.blog as Record<string, unknown> | undefined;
      if (typeof blog?.full_draft === 'string') return blog.full_draft;
      if (typeof draftJson.full_draft === 'string') return draftJson.full_draft;
    }

    if (fmt === 'video') {
      const video = (draftJson.video_script ?? draftJson.video) as Record<string, unknown> | undefined;
      if (typeof video?.script === 'string') return video.script;
      if (typeof draftJson.script === 'string') return draftJson.script;
      if (typeof draftJson.teleprompter_script === 'string') return draftJson.teleprompter_script;
      if (typeof video?.teleprompter_script === 'string') return video.teleprompter_script;
    }

    if (fmt === 'shorts') {
      const shorts = (draftJson.shorts ?? draftJson.scripts) as unknown[];
      if (Array.isArray(shorts)) {
        return shorts.map((s, i) => {
          const item = s as Record<string, unknown>;
          return `## Short ${i + 1}${item.hook ? `: ${item.hook}` : ''}\n\n${item.script ?? item.content ?? JSON.stringify(item, null, 2)}`;
        }).join('\n\n---\n\n');
      }
    }

    if (fmt === 'podcast') {
      const podcast = (draftJson.podcast_outline ?? draftJson.podcast) as Record<string, unknown> | undefined;
      if (typeof podcast?.outline === 'string') return podcast.outline;
      if (typeof draftJson.outline === 'string') return draftJson.outline;
    }

    for (const key of ['full_draft', 'content', 'text', 'markdown', 'html']) {
      if (typeof draftJson[key] === 'string') return draftJson[key] as string;
    }

    return JSON.stringify(draftJson, null, 2);
  }

  const handleVideoSave = useCallback(
    async (next: Record<string, unknown>) => {
      if (!draftId) return;
      setProducedDraftJson(next);
      try {
        const res = await fetch(`/api/content-drafts/${draftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftJson: next }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json?.error) throw new Error(json.error.message ?? 'Save failed');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        toast.error('Failed to save draft', { description: msg });
      }
    },
    [draftId],
  );

  const handleDeriveShorts = useCallback(async () => {
    if (!draftId || derivingShorts) return;
    setDerivingShorts(true);
    try {
      const res = await fetch(`/api/content-drafts/${draftId}/derive-shorts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok || json?.error) {
        throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
      }
      const newDraft = json.data?.draft as { id?: string; title?: string; channel_id?: string | null } | undefined;
      const link = newDraft?.channel_id && newDraft.id
        ? `/channels/${newDraft.channel_id}/drafts/${newDraft.id}`
        : null;
      toast.success('Shorts draft created from this video', {
        description: link
          ? `Open the new draft and click "Produce" to generate the 3 shorts.`
          : `Find the new draft (type "shorts") in your channel drafts list.`,
        action: link ? { label: 'Open', onClick: () => { window.location.href = link; } } : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Failed to derive shorts', { description: msg });
    } finally {
      setDerivingShorts(false);
    }
  }, [draftId, derivingShorts]);

  const currentType = TYPES.find((t) => t.id === medium);

  return (
    <section
      data-testid="production-engine"
      data-medium={medium}
      data-track-id={trackId}
      className="space-y-6"
    >
      {activeDraftId && (
        <GenerationProgressFloat
          open={!overviewMode && !!activeDraftId}
          sessionId={activeDraftId}
          sseUrl={`/api/content-drafts/${activeDraftId}/events`}
          since={activeSince ?? undefined}
          title={`Producing ${medium}`}
          onComplete={onProduceJobComplete}
          onFailed={onJobFailed}
          onClose={() => {
            setActiveDraftId(null);
            setActiveSince(null);
          }}
        />
      )}

      {phase === 'produce' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {currentType && <currentType.icon className="h-4 w-4" />}
              Produce {medium.charAt(0).toUpperCase() + medium.slice(1)} Content
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Choose your production parameters and generate format-specific content from the canonical core.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {medium === 'blog' && (
              <div data-testid="control-target-words" className="space-y-2">
                <Label>Post size</Label>
                <div className="grid grid-cols-3 gap-2">
                  {([{ value: 900, label: '800–1000' }, { value: 1200, label: '1000–1400' }, { value: 1600, label: '1400+' }] as const).map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setTargetWords(value)}
                      className={`p-2 rounded-md border text-sm ${targetWords === value
                        ? 'border-primary bg-primary/5 text-primary font-medium'
                        : 'border-border hover:border-muted-foreground/30'
                      }`}
                    >
                      {label}
                      <span className="text-xs text-muted-foreground"> words</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(medium === 'video' || medium === 'podcast') && (
              <div data-testid="control-target-duration" className="space-y-2">
                <Label>Target duration</Label>
                <div className="grid grid-cols-5 gap-2">
                  {(medium === 'video' ? [3, 5, 8, 10, 15] : [10, 20, 30, 45, 60]).map(
                    (m) => (
                      <button
                        key={m}
                        onClick={() => setTargetMinutes(m)}
                        className={`p-2 rounded-md border text-sm ${targetMinutes === m
                          ? 'border-primary bg-primary/5 text-primary font-medium'
                          : 'border-border hover:border-muted-foreground/30'
                        }`}
                      >
                        {m}
                        <span className="text-xs text-muted-foreground">min</span>
                      </button>
                    )
                  )}
                </div>
              </div>
            )}

            {medium === 'video' && (
              <div data-testid="control-video-style">
                <VideoStyleSelector
                  value={videoStyleConfig}
                  onChange={setVideoStyleConfig}
                  disabled={false}
                />
              </div>
            )}

            {medium === 'shorts' && (
              <div data-testid="control-duration-sec" className="space-y-2">
                <Label>Duration</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[15, 30, 60].map((s) => (
                    <button
                      key={s}
                      onClick={() => setTargetShortsSeconds(s)}
                      className={`p-2 rounded-md border text-sm ${targetShortsSeconds === s
                        ? 'border-primary bg-primary/5 text-primary font-medium'
                        : 'border-border hover:border-muted-foreground/30'
                      }`}
                    >
                      {s}
                      <span className="text-xs text-muted-foreground">s</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <ModelPicker
                  providers={DRAFT_PROVIDERS}
                  provider={provider}
                  model={model}
                  recommended={recommended}
                  onProviderChange={(p) => {
                    setProvider(p);
                    if (p === 'manual') {
                      setModel('manual');
                    } else {
                      setModel(MODELS_BY_PROVIDER[p][0].id);
                    }
                  }}
                  onModelChange={setModel}
                />
                <Button onClick={handleProduce} disabled={busy || !draftId}>
                  {busy ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Producing...</>
                  ) : (
                    <><ArrowRight className="h-4 w-4 mr-2" /> Produce {medium.charAt(0).toUpperCase() + medium.slice(1)}</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <ContentWarningBanner warning={contentWarning} />

      {phase === 'done' && (producedContent || (medium === 'video' && producedDraftJson)) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DraftViewer
              type={medium}
              bodyMarkdown={producedContent}
              draftJson={producedDraftJson}
              draftId={draftId ?? undefined}
              onVideoSave={handleVideoSave}
              className="bg-muted/20 p-4 rounded"
            />
            <div className="flex justify-end gap-2 flex-wrap">
              {medium === 'video' && producedDraftJson && (
                <Button
                  variant="outline"
                  onClick={handleDeriveShorts}
                  disabled={derivingShorts || !draftId}
                >
                  {derivingShorts ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  {derivingShorts ? 'Generating…' : 'Generate Shorts'}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setPhase('produce');
                  setProducedContent('');
                  setProducedDraftJson(null);
                }}
              >
                <Pencil className="h-4 w-4 mr-2" /> Produce Again
              </Button>
              <Button onClick={() => {
                const wordCount = producedContent.split(/\s+/).length;
                tracker.trackCompleted({
                  draftId: draftId || '',
                  draftTitle: '',
                  wordCount,
                  format: medium,
                });
                const result: DraftResult = {
                  draftId: draftId || '',
                  draftTitle: '',
                  draftContent: producedContent,
                };
                actor.send({ type: 'DRAFT_COMPLETE', result });
              }}>
                <Check className="h-4 w-4 mr-2" /> Done <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ManualOutputDialog
        open={!overviewMode && !!manualState}
        onOpenChange={(open) => {
          if (!open) setManualState(null);
        }}
        onSubmit={handleManualOutputSubmit}
        onAbandon={handleManualAbandon}
        title={manualState ? `Paste ${manualState.phase} output` : 'Paste manual output'}
        description="Copy the prompt from Axiom, run it in your AI tool of choice, then paste the JSON output below."
        submitLabel="Submit"
        loading={busy}
      />

      {phase === 'produce' && !draftId && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
          Waiting for canonical core — complete the CanonicalEngine step first.
        </div>
      )}

      {phase === 'produce' && draftId && (
        <div className="text-xs text-muted-foreground px-1">
          Import instead?{' '}
          <button
            className="underline underline-offset-2 hover:text-foreground transition-colors"
            onClick={() => {
              toast.info('Use the Manual Output dialog (select "manual" provider) to import produced content.');
            }}
          >
            Paste manually
          </button>
        </div>
      )}
    </section>
  );
}
