'use client';

import { useEffect, useState } from 'react';
import { Loader2, BookOpen, FileText, Video, Zap, Mic, Check, ClipboardPaste, ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ModelPicker,
  MODELS_BY_PROVIDER,
  type ProviderId,
} from '@/components/ai/ModelPicker';
import { ManualModePanel } from '@/components/ai/ManualModePanel';
import { useManualMode } from '@/hooks/use-manual-mode';
import { GenerationProgressModal } from '@/components/generation/GenerationProgressModal';
import { WizardStepper } from '@/components/generation/WizardStepper';
import { MarkdownPreview } from '@/components/preview/MarkdownPreview';
import { ContextBanner } from './ContextBanner';
import { ImportPicker } from './ImportPicker';
import { friendlyAiError } from '@/lib/ai/error-message';
import { useUpgrade } from '@/components/billing/UpgradeProvider';
import type { BaseEngineProps, DraftResult } from './types';

type DraftType = 'blog' | 'video' | 'shorts' | 'podcast';
type DraftMode = 'ai' | 'manual';
type ProgressStep = 'setup' | 'core' | 'produce' | 'done';

interface ResearchOption {
  id: string;
  input_json?: Record<string, unknown>;
  level?: string;
  cards_json?: unknown[];
  approved_cards_json?: unknown[];
}

interface DraftEngineProps extends BaseEngineProps {
  initialDraft?: Record<string, unknown>;
}

const TYPES: { id: DraftType; label: string; icon: typeof FileText; cost: number }[] = [
  { id: 'blog', label: 'Blog', icon: FileText, cost: 200 },
  { id: 'video', label: 'Video', icon: Video, cost: 200 },
  { id: 'shorts', label: 'Shorts', icon: Zap, cost: 100 },
  { id: 'podcast', label: 'Podcast', icon: Mic, cost: 150 },
];

export function DraftEngine({
  mode: engineMode,
  channelId,
  context,
  onComplete,
  initialDraft,
}: DraftEngineProps) {
  // Research context
  const [research, setResearch] = useState<ResearchOption | null>(null);

  // Format and settings
  const [type, setType] = useState<DraftType>('blog');
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState<ProviderId>('ollama');
  const [model, setModel] = useState<string>('qwen2.5:7b');
  const [targetWords, setTargetWords] = useState<number>(700);
  const [targetMinutes, setTargetMinutes] = useState<number>(8);
  const [targetShortsSeconds, setTargetShortsSeconds] = useState<number>(30);

  // Generation state
  const [draftId, setDraftId] = useState<string | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progressStep, setProgressStep] = useState<ProgressStep>('setup');
  const [producedContent, setProducedContent] = useState<string>('');

  // Manual mode
  const [draftMode, setDraftMode] = useState<DraftMode>('ai');
  const { enabled: manualEnabled } = useManualMode();

  // Upgrade handling
  const { handleMaybeCreditsError } = useUpgrade();

  // Fetch research data if researchSessionId is in context
  useEffect(() => {
    if (!context.researchSessionId) return;

    (async () => {
      try {
        const res = await fetch(`/api/research-sessions/${context.researchSessionId}`);
        const json = await res.json();
        if (json?.data) {
          setResearch(json.data as ResearchOption);
          if (!title && json.data.input_json?.topic) {
            setTitle(json.data.input_json.topic as string);
          }
        }
      } catch {
        // silent
      }
    })();
  }, [context.researchSessionId, title]);

  // Fetch recommended agent
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agents');
        const json = await res.json();
        const agent = (json.data?.agents as Array<Record<string, unknown>>)?.find(
          (a) => a.slug === 'draft'
        );
        if (agent?.recommended_provider) {
          setProvider(agent.recommended_provider as ProviderId);
          if (agent.recommended_model) {
            setModel(agent.recommended_model as string);
          }
        }
      } catch {
        // silent
      }
    })();
  }, []);

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
    } catch {
      toast.error(`${label} failed`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleStart() {
    if (busy || activeDraftId) return;

    if (!research) {
      toast.error('Select or create research before generating content');
      return;
    }

    if (!title.trim()) {
      toast.error('Enter a title');
      return;
    }

    // Build production_params based on format
    const productionParams: Record<string, unknown> = {};
    if (type === 'blog') productionParams.target_word_count = targetWords;
    if (type === 'video' || type === 'podcast') productionParams.target_duration_minutes = targetMinutes;
    if (type === 'shorts') productionParams.target_duration_minutes = targetShortsSeconds / 60;

    // Step 1: Create draft scaffold
    setProgressStep('setup');
    const draft = await runStep('create draft', () =>
      fetch('/api/content-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(channelId ? { channelId } : {}),
          ...(context.ideaId ? { ideaId: context.ideaId } : {}),
          researchSessionId: research.id,
          type,
          title,
          productionParams,
        }),
      })
    );

    if (!draft) return;
    const newDraftId = (draft as { id: string }).id;
    setDraftId(newDraftId);

    // Step 2: Start full generation pipeline (canonical-core + produce) with SSE
    setProgressStep('core');
    const enqueued = await runStep('start production', () =>
      fetch(`/api/content-drafts/${newDraftId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model }),
      })
    );

    if (!enqueued) return;
    setActiveDraftId(newDraftId);
  }

  async function handleManualImport(parsed: unknown) {
    // Try to extract canonical core from various wrapper formats
    let canonicalCore = parsed as Record<string, unknown>;
    if (canonicalCore.BC_CANONICAL_CORE && typeof canonicalCore.BC_CANONICAL_CORE === 'object') {
      canonicalCore = canonicalCore.BC_CANONICAL_CORE as Record<string, unknown>;
    }

    if (!research) {
      toast.error('Select research before importing');
      return;
    }

    if (!title.trim()) {
      toast.error('Enter a title');
      return;
    }

    // Step 1: Create draft
    setProgressStep('setup');
    const draft = await runStep('create draft', () =>
      fetch('/api/content-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(channelId ? { channelId } : {}),
          ...(context.ideaId ? { ideaId: context.ideaId } : {}),
          researchSessionId: research.id,
          type,
          title,
          productionParams: {},
        }),
      })
    );

    if (!draft) return;
    const newDraftId = (draft as { id: string }).id;
    setDraftId(newDraftId);

    // Step 2: Patch draft with canonical core content
    setProgressStep('core');
    const updated = await runStep('save canonical core', () =>
      fetch(`/api/content-drafts/${newDraftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonicalCoreJson: canonicalCore,
        }),
      })
    );

    if (!updated) return;

    // Step 3: Produce formatted content
    setProgressStep('produce');
    const productionParams: Record<string, unknown> = {};
    if (type === 'blog') productionParams.target_word_count = targetWords;
    if (type === 'video' || type === 'podcast') productionParams.target_duration_minutes = targetMinutes;
    if (type === 'shorts') productionParams.target_duration_minutes = targetShortsSeconds / 60;

    const produced = await runStep('produce content', () =>
      fetch(`/api/content-drafts/${newDraftId}/produce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productionParams, provider, model }),
      })
    );

    if (!produced) return;

    // Get the produced content
    const prodData = produced as { produced_content?: string };
    if (prodData.produced_content) {
      setProducedContent(prodData.produced_content);
    }

    setProgressStep('done');
    toast.success('Content imported and produced');
  }

  function onJobComplete() {
    if (!draftId) return;
    setProgressStep('done');
    toast.success('Content generated');

    // Fetch the draft to get final content
    (async () => {
      try {
        const res = await fetch(`/api/content-drafts/${draftId}`);
        const json = await res.json();
        if (json.data?.produced_content) {
          setProducedContent(json.data.produced_content as string);
        }
        const result: DraftResult = {
          draftId,
          draftTitle: title,
          draftContent: json.data?.produced_content ?? '',
        };
        onComplete(result);
      } catch {
        // Still complete even if fetch fails
        const result: DraftResult = {
          draftId,
          draftTitle: title,
          draftContent: producedContent,
        };
        onComplete(result);
      }
    })();
  }

  function onJobFailed(message: string) {
    const friendly = friendlyAiError(message);
    toast.error(friendly.title, { description: friendly.hint });
    setActiveDraftId(null);
    setProgressStep('setup');
  }

  const cardCount = Array.isArray(research?.cards_json)
    ? research.cards_json.length
    : Array.isArray(research?.approved_cards_json)
      ? research.approved_cards_json.length
      : 0;

  // Import mode: show ImportPicker when mode='import' and no initial draft
  if (engineMode === 'import' && !initialDraft) {
    return (
      <div className="space-y-6">
        <ContextBanner stage="draft" context={context} />

        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> Draft
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Import a draft to continue.
          </p>
        </div>

        <ImportPicker
          entityType="content-drafts"
          channelId={channelId}
          searchPlaceholder="Search drafts..."
          emptyMessage="No drafts found"
          renderItem={(item: Record<string, unknown>): React.ReactNode => (
            <div className="p-3 rounded-lg border hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{item.type as string}</Badge>
                <Badge variant="outline" className="text-[10px]">{item.status as string}</Badge>
                <span className="text-sm font-medium">{item.title as string}</span>
              </div>
            </div>
          )}
          onSelect={(item) => {
            const draftJson = item.draft_json as Record<string, unknown> | null;
            onComplete({
              draftId: item.id as string,
              draftTitle: (item.title as string) ?? 'Untitled',
              draftContent: (draftJson?.full_draft as string) ?? '',
            } as DraftResult);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ContextBanner stage="draft" context={context} />

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5" /> Draft
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate formatted content from your research. Write blog posts, video scripts,
          and more with AI-powered production.
        </p>
      </div>

      {/* Research context card */}
      {research && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Base Research
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-muted/20">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium line-clamp-2">
                  {(research.input_json?.topic as string) ?? 'Untitled research'}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {research.level && (
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {research.level}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px]">
                    {cardCount} cards
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Format and generation card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Format + Generate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {research && (
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="e.g., Deep work techniques for developers"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Format</Label>
            <div className="grid grid-cols-4 gap-2">
              {TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setType(t.id)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      type === t.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30'
                    }`}
                  >
                    <Icon className="h-4 w-4 mb-1.5" />
                    <div className="text-sm font-medium">{t.label}</div>
                    <Badge variant="outline" className="text-[10px] mt-1">
                      {t.cost}c
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Per-type target length picker */}
          {type === 'blog' && (
            <div className="space-y-2">
              <Label>Post size</Label>
              <div className="grid grid-cols-4 gap-2">
                {[300, 500, 700, 1000, 1500, 2000].slice(0, 4).map((n) => (
                  <button
                    key={n}
                    onClick={() => setTargetWords(n)}
                    className={`p-2 rounded-md border text-sm ${
                      targetWords === n
                        ? 'border-primary bg-primary/5 text-primary font-medium'
                        : 'border-border hover:border-muted-foreground/30'
                    }`}
                  >
                    {n}
                    <span className="text-xs text-muted-foreground"> words</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {(type === 'video' || type === 'podcast') && (
            <div className="space-y-2">
              <Label>Target duration</Label>
              <div className="grid grid-cols-5 gap-2">
                {(type === 'video' ? [3, 5, 8, 10, 15] : [10, 20, 30, 45, 60]).map(
                  (m) => (
                    <button
                      key={m}
                      onClick={() => setTargetMinutes(m)}
                      className={`p-2 rounded-md border text-sm ${
                        targetMinutes === m
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
          {type === 'shorts' && (
            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="grid grid-cols-3 gap-2">
                {[15, 30, 60].map((s) => (
                  <button
                    key={s}
                    onClick={() => setTargetShortsSeconds(s)}
                    className={`p-2 rounded-md border text-sm ${
                      targetShortsSeconds === s
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

          {/* AI/Manual Tabs */}
          <Tabs
            value={draftMode}
            onValueChange={(v) => setDraftMode(v as DraftMode)}
            className="mt-2"
          >
            <TabsList>
              <TabsTrigger value="ai" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> AI Generation
              </TabsTrigger>
              {manualEnabled && (
                <TabsTrigger value="manual" className="gap-1.5">
                  <ClipboardPaste className="h-3.5 w-3.5" /> Manual (ChatGPT/Gemini)
                </TabsTrigger>
              )}
            </TabsList>

            {/* AI mode */}
            <TabsContent value="ai" className="space-y-4 mt-3">
              <ModelPicker
                provider={provider}
                model={model}
                recommended={{ provider: null, model: null }}
                onProviderChange={(p) => {
                  setProvider(p);
                  setModel(MODELS_BY_PROVIDER[p][0].id);
                }}
                onModelChange={setModel}
              />
              <Button onClick={handleStart} disabled={busy || !!activeDraftId || !research}>
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" /> Generate
                  </>
                )}
              </Button>
              {!research && (
                <p className="text-xs text-muted-foreground">
                  Select research first — production without research is weak.
                </p>
              )}
            </TabsContent>

            {/* Manual mode */}
            {manualEnabled && (
              <TabsContent value="manual" className="mt-3">
                <ManualModePanel
                  agentSlug="draft"
                  inputContext={[
                    `Title: ${title || '(enter title above)'}`,
                    `Format: ${type}`,
                    context.ideaTitle ? `Idea: ${context.ideaTitle}` : '',
                    research?.input_json?.topic
                      ? `Research topic: ${research.input_json.topic}`
                      : '',
                    `Research cards: ${cardCount}`,
                  ]
                    .filter(Boolean)
                    .join('\n')}
                  pastePlaceholder={
                    'Paste JSON matching BC_CANONICAL_CORE:\n{"section":"...","subsections":[...]}'
                  }
                  onImport={handleManualImport}
                  importLabel="Import Canonical Core"
                  loading={busy}
                />
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      {/* Progress stepper during generation */}
      {activeDraftId && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 space-y-3">
            <div className="space-y-2">
              {(['setup', 'core', 'produce', 'done'] as ProgressStep[]).map((step) => {
                const stepLabels: Record<ProgressStep, string> = {
                  setup: 'Setup',
                  core: 'Generate canonical core',
                  produce: 'Produce formatted content',
                  done: 'Complete',
                };
                const isActive = progressStep === step;
                const isDone =
                  ['setup', 'core', 'produce'].indexOf(progressStep) >=
                  ['setup', 'core', 'produce'].indexOf(step);

                return (
                  <div key={step} className="flex items-center gap-2">
                    {isDone ? (
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                    ) : isActive ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                    )}
                    <span
                      className={`text-sm ${
                        isDone
                          ? 'text-foreground'
                          : isActive
                            ? 'font-medium text-primary'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {stepLabels[step]}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* SSE generation modal */}
      {activeDraftId && (
        <GenerationProgressModal
          open={!!activeDraftId}
          sessionId={activeDraftId}
          sseUrl={`/api/content-drafts/${activeDraftId}/events`}
          title={
            type === 'video'
              ? 'Generating video script'
              : type === 'shorts'
                ? 'Generating Shorts script'
                : type === 'podcast'
                  ? 'Generating podcast script'
                  : 'Generating blog post'
          }
          onComplete={onJobComplete}
          onFailed={onJobFailed}
          onClose={() => {
            setActiveDraftId(null);
            setProgressStep('setup');
          }}
        />
      )}

      {/* Content preview after completion */}
      {progressStep === 'done' && producedContent && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <MarkdownPreview content={producedContent} className="bg-muted/20 p-4 rounded" />
            <div className="flex justify-end">
              <Button onClick={() => {
                const result: DraftResult = {
                  draftId: draftId || '',
                  draftTitle: title,
                  draftContent: producedContent,
                };
                onComplete(result);
              }}>
                <Check className="h-4 w-4 mr-2" /> Done <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
