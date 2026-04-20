'use client';

import { useEffect, useState } from 'react';
import {
  Loader2, BookOpen, FileText, Video, Zap, Mic, Check, ClipboardPaste,
  ArrowRight, Sparkles, ChevronDown, ChevronUp, Pencil,
  Quote, TrendingUp, Target, MessageSquare, Megaphone, Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ModelPicker,
  MODELS_BY_PROVIDER,
  type ProviderId,
} from '@/components/ai/ModelPicker';
import { ManualOutputDialog } from './ManualOutputDialog';
import { usePipelineTracker } from '@/hooks/use-pipeline-tracker';
import { GenerationProgressModal } from '@/components/generation/GenerationProgressModal';
import { MarkdownPreview } from '@/components/preview/MarkdownPreview';
import { ContextBanner } from './ContextBanner';
import { ImportPicker } from './ImportPicker';
import { friendlyAiError } from '@/lib/ai/error-message';
import { useUpgrade } from '@/components/billing/UpgradeProvider';
import type { BaseEngineProps, DraftResult } from './types';

type DraftType = 'blog' | 'video' | 'shorts' | 'podcast';
type DraftMode = 'ai' | 'manual';

/**
 * Phase tracks the two-step production workflow:
 * 1. core — generate or import the canonical core (shared narrative skeleton)
 * 2. produce — pick format(s) and produce final content from the core
 */
type Phase = 'core' | 'core-ready' | 'produce' | 'done';

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

const DRAFT_PROVIDERS: ProviderId[] = ['gemini', 'openai', 'anthropic', 'ollama', 'manual'];

export function DraftEngine({
  mode: engineMode,
  channelId,
  context,
  onComplete,
  initialDraft,
  onStageProgress,
}: DraftEngineProps) {
  // Research context
  const [research, setResearch] = useState<ResearchOption | null>(null);

  // Core settings — initialize title from pipeline context
  const [title, setTitle] = useState(context.ideaTitle ?? '');
  const [provider, setProvider] = useState<ProviderId>('ollama');
  const [model, setModel] = useState<string>('qwen2.5:7b');

  // Phase state
  const [phase, setPhase] = useState<Phase>('core');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [canonicalCore, setCanonicalCore] = useState<Record<string, unknown> | null>(null);
  const [coreExpanded, setCoreExpanded] = useState(true);
  const [coreApproved, setCoreApproved] = useState(false);

  // Produce state
  const [type, setType] = useState<DraftType>('blog');
  const [targetWords, setTargetWords] = useState<number>(700);
  const [targetMinutes, setTargetMinutes] = useState<number>(8);
  const [targetShortsSeconds, setTargetShortsSeconds] = useState<number>(30);
  const [producedContent, setProducedContent] = useState<string>('');

  // Generation state
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Manual provider — open dialog when API responds with awaiting_manual
  const [manualState, setManualState] = useState<{
    draftId: string;
    phase: 'core' | DraftType;
  } | null>(null);

  // Upgrade handling
  const { handleMaybeCreditsError } = useUpgrade();

  // Pipeline tracker
  const tracker = usePipelineTracker('draft', context);

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

  // Restore state from existing draft (when revisiting from review)
  useEffect(() => {
    if (!context.draftId) return;

    (async () => {
      try {
        const res = await fetch(`/api/content-drafts/${context.draftId}`);
        const json = await res.json();
        if (!json?.data) return;
        const d = json.data as Record<string, unknown>;

        setDraftId(context.draftId as string);
        if (d.title && typeof d.title === 'string' && !title) setTitle(d.title);
        if (d.type && typeof d.type === 'string') setType(d.type as DraftType);

        // Check if draft is awaiting manual output
        if (d.status === 'awaiting_manual') {
          // Determine which phase we're in by checking what's populated
          const hasCore = d.canonical_core_json && typeof d.canonical_core_json === 'object' && Object.keys(d.canonical_core_json as Record<string, unknown>).length > 0;
          const hasDraft = d.draft_json && typeof d.draft_json === 'object' && Object.keys(d.draft_json as Record<string, unknown>).length > 0;
          const phase_type = hasCore && !hasDraft ? 'core' : ((d.type as DraftType) ?? 'blog');
          setManualState({
            draftId: context.draftId as string,
            phase: phase_type,
          });
          return;
        }

        const core = d.canonical_core_json as Record<string, unknown> | null;
        const draftJson = d.draft_json as Record<string, unknown> | null;

        if (core && typeof core === 'object' && Object.keys(core).length > 0) {
          setCanonicalCore(core);

          if (draftJson && typeof draftJson === 'object' && Object.keys(draftJson).length > 0) {
            // Has both core and produced content — go to done
            const content = extractProducedContent(d, (d.type as DraftType) ?? 'blog');
            if (content && content !== '{}') {
              setProducedContent(content);
              setPhase('done');
              setCoreApproved(true);
            } else {
              setPhase('core-ready');
            }
          } else {
            // Has core but no produced content — go to produce step
            setPhase('core-ready');
          }
          setCoreExpanded(false);
        }
      } catch {
        // silent — will show fresh form
      }
    })();
  }, [context.draftId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch recommended model
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agents');
        const json = await res.json();
        const agent = (json.data?.agents as Array<Record<string, unknown>>)?.find(
          (a) => a.slug === 'content-core'
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

  // ── Phase 1: Generate canonical core via AI ───────────────────
  async function handleGenerateCore() {
    if (busy) return;
    if (!research) { toast.error('Select research first'); return; }
    if (!title.trim()) { toast.error('Enter a title'); return; }

    tracker.trackStarted({
      draftId: draftId || '',
      phase: 'core',
      provider,
      model,
    });

    // Create draft scaffold
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

    // For manual provider, call canonical-core endpoint which will return awaiting_manual status
    if (provider === 'manual') {
      const res = await fetch(`/api/content-drafts/${newDraftId}/canonical-core`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model }),
      });
      const json = await res.json();
      if (json.error) {
        if (handleMaybeCreditsError(json.error)) return;
        const friendly = friendlyAiError(json.error.message ?? '');
        toast.error(`start canonical core: ${friendly.title}`, { description: friendly.hint });
        return;
      }
      if (json.data?.status === 'awaiting_manual') {
        setManualState({ draftId: newDraftId, phase: 'core' });
        setBusy(false);
        return;
      }
      toast.error('Unexpected response from manual provider');
      return;
    }

    // Start canonical core generation (SSE) for non-manual providers
    const enqueued = await runStep('start canonical core', () =>
      fetch(`/api/content-drafts/${newDraftId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model }),
      })
    );
    if (!enqueued) return;
    setActiveDraftId(newDraftId);
  }

  // ── Manual provider: submit output ────────────────────────────
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
      });
      const json = await res.json();
      if (json.error) {
        toast.error('Submit failed', { description: json.error.message });
        return;
      }

      // Success! Clear manual state and proceed
      if (manualState.phase === 'core') {
        setCanonicalCore((parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : null);
        setPhase('core-ready');
        setCoreApproved(false);
        setCoreExpanded(true);
        toast.success('Canonical core submitted — review before producing');
      } else {
        const fmt = manualState.phase as DraftType;
        const parsedObj = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
        const apiDraft = json.data as Record<string, unknown> | undefined;
        const content =
          (apiDraft && extractProducedContent(apiDraft, fmt)) ||
          extractProducedContent({ draft_json: parsedObj }, fmt) ||
          '';
        setProducedContent(content);
        setPhase('done');
        toast.success(`${manualState.phase.charAt(0).toUpperCase() + manualState.phase.slice(1)} content submitted`);
      }
      setManualState(null);
      onStageProgress?.({ draftId: manualState.draftId });
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
      await fetch(`/api/content-drafts/${manualState.draftId}/cancel`, { method: 'POST' });
    } catch {
      // best-effort
    } finally {
      setBusy(false);
      setManualState(null);
      onStageProgress?.({ draftId: undefined });
    }
  }

  // ── Phase 1: Import canonical core manually ───────────────────
  async function handleManualCoreImport(parsed: unknown) {
    let core = parsed as Record<string, unknown>;
    if (core.BC_CANONICAL_CORE && typeof core.BC_CANONICAL_CORE === 'object') {
      core = core.BC_CANONICAL_CORE as Record<string, unknown>;
    }

    if (!research) { toast.error('Select research before importing'); return; }
    if (!title.trim()) { toast.error('Enter a title'); return; }

    // Create draft scaffold
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

    // Save canonical core to draft
    const updated = await runStep('save canonical core', () =>
      fetch(`/api/content-drafts/${newDraftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalCoreJson: core }),
      })
    );
    if (!updated) return;

    setCanonicalCore(core);
    tracker.trackAction('imported', {
      phase: 'core',
      source: 'manual',
    });
    setPhase('core-ready');
    setCoreExpanded(true);
    setCoreApproved(false);
    toast.success('Canonical core imported — review before producing');
  }

  // ── SSE completion: canonical core generated ──────────────────
  function onCoreJobComplete() {
    if (!draftId) return;
    setActiveDraftId(null);

    // Fetch the draft to get canonical core
    (async () => {
      try {
        const res = await fetch(`/api/content-drafts/${draftId}`);
        const json = await res.json();
        const coreJson = json.data?.canonical_core_json ?? json.data?.canonicalCoreJson;
        if (coreJson && typeof coreJson === 'object') {
          setCanonicalCore(coreJson as Record<string, unknown>);
          tracker.trackAction('core.generated', {
            draftId,
            canonicalCoreJson: coreJson,
          });
          setPhase('core-ready');
          setCoreExpanded(true);
          setCoreApproved(false);
          toast.success('Canonical core generated — review before producing');
        } else {
          // If the API generates full content in one step, handle that too
          const content = extractProducedContent(json.data as Record<string, unknown>, type);
          if (content && content !== '{}') {
            setProducedContent(content);
            setPhase('done');
            toast.success('Content generated');
          } else {
            toast.error('No canonical core found in draft');
          }
        }
      } catch {
        toast.error('Failed to load draft');
      }
    })();
  }

  function onJobFailed(message: string) {
    const friendly = friendlyAiError(message);
    toast.error(friendly.title, { description: friendly.hint });
    tracker.trackFailed(message, {
      phase: 'core',
      provider,
      model,
    });
    setActiveDraftId(null);
  }

  // ── Phase 2: Produce formatted content from canonical core ────
  async function handleProduce() {
    if (busy || !draftId) return;

    const productionParams: Record<string, unknown> = {};
    if (type === 'blog') productionParams.target_word_count = targetWords;
    if (type === 'video' || type === 'podcast') productionParams.target_duration_minutes = targetMinutes;
    if (type === 'shorts') productionParams.target_duration_minutes = targetShortsSeconds / 60;

    tracker.trackStarted({
      draftId,
      phase: 'produce',
      provider,
      model,
      format: type,
      targetLength: type === 'blog' ? targetWords : type === 'shorts' ? targetShortsSeconds : targetMinutes,
    });

    setPhase('produce');

    // For manual provider, call produce endpoint which will return awaiting_manual status
    if (provider === 'manual') {
      setBusy(true);
      try {
        const res = await fetch(`/api/content-drafts/${draftId}/produce`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productionParams, provider, model }),
        });
        const json = await res.json();
        if (json.error) {
          if (handleMaybeCreditsError(json.error)) return;
          const friendly = friendlyAiError(json.error.message ?? '');
          toast.error(`produce content: ${friendly.title}`, { description: friendly.hint });
          setPhase('core-ready');
          return;
        }
        if (json.data?.status === 'awaiting_manual') {
          setManualState({ draftId, phase: type });
          return;
        }
        toast.error('Unexpected response from manual provider');
        setPhase('core-ready');
      } catch {
        toast.error('produce content failed');
        setPhase('core-ready');
      } finally {
        setBusy(false);
      }
      return;
    }

    const produced = await runStep('produce content', () =>
      fetch(`/api/content-drafts/${draftId}/produce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productionParams, provider, model }),
      })
    );

    if (!produced) {
      setPhase('core-ready');
      return;
    }

    // The produce endpoint returns the full draft row; extract content from draft_json
    const content = extractProducedContent(produced as Record<string, unknown>, type);
    if (content) {
      setProducedContent(content);
      const wordCount = content.split(/\s+/).length;
      tracker.trackAction('content.produced', {
        draftId,
        format: type,
        wordCount,
        draftJson: (produced as Record<string, unknown>).draft_json ?? (produced as Record<string, unknown>).draftJson,
      });
    }
    setPhase('done');
    toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} content produced`);
  }

  // ── Phase 2: Import produced content manually ──────────────────
  async function handleManualProduceImport(parsed: unknown) {
    let obj = parsed as Record<string, unknown>;

    // Unwrap top-level wrapper (BC_BLOG_OUTPUT, BC_VIDEO_OUTPUT, etc.)
    const WRAPPERS: Record<DraftType, string[]> = {
      blog: ['BC_BLOG_OUTPUT'],
      video: ['BC_VIDEO_OUTPUT'],
      shorts: ['BC_SHORTS_OUTPUT'],
      podcast: ['BC_PODCAST_OUTPUT'],
    };
    for (const key of WRAPPERS[type]) {
      if (obj[key] && typeof obj[key] === 'object') {
        obj = obj[key] as Record<string, unknown>;
        break;
      }
    }

    // Extract the displayable content based on format
    let content = '';

    if (type === 'blog') {
      // Blog: full_draft is the markdown content
      const blog = (obj.blog && typeof obj.blog === 'object') ? obj.blog as Record<string, unknown> : obj;
      content = typeof blog.full_draft === 'string' ? blog.full_draft : '';
    } else if (type === 'video') {
      const video = (obj.video_script ?? obj.video ?? obj) as Record<string, unknown>;
      content = typeof video.script === 'string' ? video.script
        : typeof video.full_script === 'string' ? video.full_script : '';
    } else if (type === 'shorts') {
      const shorts = (obj.shorts ?? obj.scripts) as unknown[];
      if (Array.isArray(shorts)) {
        content = shorts.map((s, i) => {
          const item = s as Record<string, unknown>;
          return `## Short ${i + 1}${item.hook ? `: ${item.hook}` : ''}\n\n${item.script ?? item.content ?? JSON.stringify(item, null, 2)}`;
        }).join('\n\n---\n\n');
      }
    } else if (type === 'podcast') {
      const podcast = (obj.podcast_outline ?? obj.podcast ?? obj) as Record<string, unknown>;
      content = typeof podcast.outline === 'string' ? podcast.outline
        : typeof podcast.full_outline === 'string' ? podcast.full_outline : '';
    }

    // Fallback: try generic content keys
    if (!content) {
      for (const key of ['full_draft', 'content', 'script', 'outline', 'text', 'markdown']) {
        if (typeof obj[key] === 'string') { content = obj[key] as string; break; }
      }
    }

    if (!content) {
      toast.error('Could not extract content. Expected full_draft (blog), script (video), or outline (podcast).');
      return;
    }

    // Save the full JSON as draft_json and the extracted content
    if (draftId) {
      await runStep('save produced content', () =>
        fetch(`/api/content-drafts/${draftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftJson: obj }),
        })
      );
    }

    setProducedContent(content);
    tracker.trackAction('imported', {
      phase: 'produce',
      source: 'manual',
    });
    setPhase('done');
    toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} content imported`);
  }

  // ── Helpers ───────────────────────────────────────────────────

  /**
   * Extract the displayable content from the produce API response.
   * The endpoint returns the full draft row; draft_json contains the AI output
   * which varies by format:
   * - blog: { blog: { full_draft: "..." } } or { full_draft: "..." }
   * - video: { video_script: { script: "..." } } or { script: "..." }
   * - shorts: { shorts: [...] }
   * - podcast: { podcast_outline: { outline: "..." } } or { outline: "..." }
   */
  function extractProducedContent(data: Record<string, unknown>, fmt: DraftType): string {
    // Try produced_content first (direct field if API sets it)
    if (typeof data.produced_content === 'string') return data.produced_content;

    // Extract from draft_json
    const draftJson = (data.draft_json ?? data.draftJson) as Record<string, unknown> | null;
    if (!draftJson) return JSON.stringify(data, null, 2);

    // Blog: look for full_draft
    if (fmt === 'blog') {
      const blog = draftJson.blog as Record<string, unknown> | undefined;
      if (typeof blog?.full_draft === 'string') return blog.full_draft;
      if (typeof draftJson.full_draft === 'string') return draftJson.full_draft;
    }

    // Video: look for script
    if (fmt === 'video') {
      const video = (draftJson.video_script ?? draftJson.video) as Record<string, unknown> | undefined;
      if (typeof video?.script === 'string') return video.script;
      if (typeof draftJson.script === 'string') return draftJson.script;
    }

    // Shorts: format as readable text
    if (fmt === 'shorts') {
      const shorts = (draftJson.shorts ?? draftJson.scripts) as unknown[];
      if (Array.isArray(shorts)) {
        return shorts.map((s, i) => {
          const item = s as Record<string, unknown>;
          return `## Short ${i + 1}${item.hook ? `: ${item.hook}` : ''}\n\n${item.script ?? item.content ?? JSON.stringify(item, null, 2)}`;
        }).join('\n\n---\n\n');
      }
    }

    // Podcast: look for outline
    if (fmt === 'podcast') {
      const podcast = (draftJson.podcast_outline ?? draftJson.podcast) as Record<string, unknown> | undefined;
      if (typeof podcast?.outline === 'string') return podcast.outline;
      if (typeof draftJson.outline === 'string') return draftJson.outline;
    }

    // Fallback: try common keys
    for (const key of ['full_draft', 'content', 'text', 'markdown', 'html']) {
      if (typeof draftJson[key] === 'string') return draftJson[key] as string;
    }

    // Last resort: pretty-print the JSON
    return JSON.stringify(draftJson, null, 2);
  }

  const cardCount = Array.isArray(research?.cards_json)
    ? research.cards_json.length
    : Array.isArray(research?.approved_cards_json)
      ? research.approved_cards_json.length
      : 0;

  function renderCoreSummary(core: Record<string, unknown>) {
    const thesis = core.thesis as string | undefined;
    const argChain = (core.argument_chain ?? core.argumentChain) as Array<Record<string, unknown>> | undefined;
    const emotionalArc = (core.emotional_arc ?? core.emotionalArc) as Record<string, unknown> | undefined;
    const keyStats = (core.key_stats ?? core.keyStats) as Array<Record<string, unknown>> | undefined;
    const keyQuotes = (core.key_quotes ?? core.keyQuotes) as Array<Record<string, unknown>> | undefined;
    const affiliate = (core.affiliate_moment ?? core.affiliateMoment) as Record<string, unknown> | undefined;
    const ctaSubscribe = (core.cta_subscribe ?? core.ctaSubscribe) as string | undefined;
    const ctaComment = (core.cta_comment_prompt ?? core.ctaCommentPrompt) as string | undefined;

    const arcOpen = (emotionalArc?.opening_emotion ?? emotionalArc?.opening) as string | undefined;
    const arcTurn = (emotionalArc?.turning_point ?? emotionalArc?.turningPoint) as string | undefined;
    const arcClose = (emotionalArc?.closing_emotion ?? emotionalArc?.closing) as string | undefined;

    const splitArc = (raw?: string) => {
      if (!raw) return { label: undefined as string | undefined, detail: undefined as string | undefined };
      const sep = raw.indexOf(' - ');
      if (sep === -1) return { label: raw, detail: undefined };
      return { label: raw.slice(0, sep).trim(), detail: raw.slice(sep + 3).trim() };
    };

    const arcStages = [
      { key: 'opening', title: 'Opening', tone: 'rose', ...splitArc(arcOpen) },
      { key: 'turn', title: 'Turning Point', tone: 'amber', ...splitArc(arcTurn) },
      { key: 'closing', title: 'Closing', tone: 'emerald', ...splitArc(arcClose) },
    ].filter((s) => s.label);

    const toneClasses: Record<string, string> = {
      rose: 'from-rose-500/10 via-background to-background ring-rose-500/20 text-rose-500 dark:text-rose-400',
      amber: 'from-amber-500/10 via-background to-background ring-amber-500/20 text-amber-500 dark:text-amber-400',
      emerald: 'from-emerald-500/10 via-background to-background ring-emerald-500/20 text-emerald-500 dark:text-emerald-400',
    };

    return (
      <div className="space-y-6">
        {thesis && (
          <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-card to-card p-5">
            <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
            <div className="relative">
              <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary mb-2">
                <Target className="h-3 w-3" /> Thesis
              </div>
              <p className="text-base leading-relaxed font-medium text-foreground">{thesis}</p>
            </div>
          </div>
        )}

        {Array.isArray(argChain) && argChain.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Argument Chain
              </Label>
              <Badge variant="secondary" className="text-[10px]">{argChain.length} steps</Badge>
            </div>
            <ol className="space-y-2.5">
              {argChain.map((step, i) => {
                const claim = String(step.claim ?? step.title ?? step.step ?? '');
                const evidence = step.evidence as string | undefined;
                const sources = (step.source_ids ?? step.sourceIds) as string[] | undefined;
                return (
                  <li
                    key={i}
                    className="group relative rounded-lg border border-border/60 bg-card/50 p-3.5 hover:border-primary/40 hover:bg-card transition-colors"
                  >
                    <div className="flex gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold ring-1 ring-primary/20">
                        {i + 1}
                      </div>
                      <div className="flex-1 space-y-1.5 min-w-0">
                        <p className="text-sm font-medium leading-snug">{claim}</p>
                        {evidence && (
                          <p className="text-xs text-muted-foreground leading-relaxed">{evidence}</p>
                        )}
                        {Array.isArray(sources) && sources.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            <Link2 className="h-3 w-3 text-muted-foreground" />
                            {sources.map((sid) => (
                              <Badge
                                key={sid}
                                variant="outline"
                                className="text-[10px] font-mono bg-background/50"
                              >
                                {sid}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {arcStages.length > 0 && (
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Emotional Arc
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3 items-stretch">
              {arcStages.map((stage, idx) => (
                <div key={stage.key} className="flex items-stretch gap-2 md:gap-1">
                  <div
                    className={`flex-1 rounded-lg ring-1 ring-inset bg-gradient-to-br p-3 ${toneClasses[stage.tone]}`}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                      {stage.title}
                    </div>
                    <div className="text-sm font-semibold mt-1 capitalize text-foreground">
                      {stage.label}
                    </div>
                    {stage.detail && (
                      <p className="text-xs text-muted-foreground mt-1 leading-snug">
                        {stage.detail}
                      </p>
                    )}
                  </div>
                  {idx < arcStages.length - 1 && (
                    <div className="hidden md:flex items-center">
                      <ArrowRight className="h-4 w-4 text-muted-foreground/60" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(keyStats) && keyStats.length > 0 && (
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Key Stats
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {keyStats.map((s, i) => {
                const figure = s.figure as string | number | undefined;
                const stat = s.stat as string | undefined;
                const sourceId = (s.source_id ?? s.sourceId) as string | undefined;
                return (
                  <div
                    key={i}
                    className="rounded-lg border border-border/60 bg-card/50 p-3.5 flex items-start gap-3"
                  >
                    <TrendingUp className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xl font-bold tracking-tight">{figure ?? '—'}</div>
                      {stat && <div className="text-xs text-muted-foreground mt-0.5">{stat}</div>}
                      {sourceId && (
                        <Badge variant="outline" className="text-[10px] font-mono mt-1.5 bg-background/50">
                          {sourceId}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {Array.isArray(keyQuotes) && keyQuotes.length > 0 && (
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Key Quotes
            </Label>
            <div className="space-y-2.5">
              {keyQuotes.map((q, i) => {
                const quote = q.quote as string | undefined;
                const author = q.author as string | undefined;
                const credentials = q.credentials as string | undefined;
                return (
                  <blockquote
                    key={i}
                    className="relative rounded-lg border-l-4 border-primary/50 bg-muted/30 pl-4 pr-3 py-3"
                  >
                    <Quote className="absolute top-2 right-2 h-4 w-4 text-muted-foreground/30" />
                    {quote && <p className="text-sm italic leading-relaxed">&ldquo;{quote}&rdquo;</p>}
                    {(author || credentials) && (
                      <footer className="mt-2 text-xs text-muted-foreground">
                        {author && <span className="font-medium text-foreground">— {author}</span>}
                        {credentials && <span className="ml-1">· {credentials}</span>}
                      </footer>
                    )}
                  </blockquote>
                );
              })}
            </div>
          </div>
        )}

        {affiliate && (
          <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.06] via-card to-card p-4 space-y-2">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <Megaphone className="h-3 w-3" /> Affiliate Moment
            </div>
            {typeof affiliate.trigger_context === 'string' && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Trigger</div>
                <p className="text-sm text-foreground/90 mt-0.5">{affiliate.trigger_context}</p>
              </div>
            )}
            {typeof affiliate.product_angle === 'string' && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Angle</div>
                <p className="text-sm text-foreground/90 mt-0.5">{affiliate.product_angle}</p>
              </div>
            )}
            {typeof affiliate.cta_primary === 'string' && (
              <div className="pt-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">CTA</div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mt-0.5">
                  {affiliate.cta_primary}
                </p>
              </div>
            )}
          </div>
        )}

        {(ctaSubscribe || ctaComment) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {ctaSubscribe && (
              <div className="rounded-lg border border-border/60 bg-card/50 p-3 flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Subscribe CTA</div>
                  <p className="text-sm mt-0.5">{ctaSubscribe}</p>
                </div>
              </div>
            )}
            {ctaComment && (
              <div className="rounded-lg border border-border/60 bg-card/50 p-3 flex items-start gap-2.5">
                <MessageSquare className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Comment Prompt</div>
                  <p className="text-sm mt-0.5">{ctaComment}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Import mode ───────────────────────────────────────────────
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

  // ── Main render ───────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <ContextBanner stage="draft" context={context} />

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5" /> Draft
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Two-step production: generate the canonical core narrative, then produce formatted content.
        </p>
      </div>

      {/* Phase stepper */}
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-1.5 text-sm ${
          phase === 'core' ? 'text-primary font-medium' : 'text-muted-foreground'
        }`}>
          {phase !== 'core' ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <div className="h-4 w-4 rounded-full border-2 border-primary flex items-center justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            </div>
          )}
          Canonical Core
        </div>
        <div className="h-px w-8 bg-border" />
        <div className={`flex items-center gap-1.5 text-sm ${
          phase === 'core-ready' || phase === 'produce' ? 'text-primary font-medium'
            : phase === 'done' ? 'text-muted-foreground' : 'text-muted-foreground/50'
        }`}>
          {phase === 'done' ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : phase === 'core-ready' || phase === 'produce' ? (
            <div className="h-4 w-4 rounded-full border-2 border-primary flex items-center justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            </div>
          ) : (
            <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
          )}
          Produce Content
        </div>
      </div>

      {/* Research context card */}
      {research && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Research Context
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

      {/* ═══ PHASE 1: Canonical Core ═══ */}
      {phase === 'core' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 1: Canonical Core</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              The canonical core is the shared narrative skeleton — thesis, argument chain, emotional arc.
              All format-specific content (blog, video, shorts, podcast) derives from it.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Title */}
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="e.g., The 85% Rule: Why Giving Your All Is Sabotaging Your Growth"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Provider selection */}
            <div className="space-y-4">
              <div>
                <ModelPicker
                  providers={DRAFT_PROVIDERS}
                  provider={provider}
                  model={model}
                  recommended={{ provider: null, model: null }}
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
                <Button onClick={handleGenerateCore} disabled={busy || !research || !title.trim()}>
                  {busy ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating Core...</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-2" /> Generate Canonical Core</>
                  )}
                </Button>
                {!research && (
                  <p className="text-xs text-muted-foreground">
                    Select research first — production without research is weak.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SSE generation modal for canonical core */}
      {activeDraftId && (
        <GenerationProgressModal
          open={!!activeDraftId}
          sessionId={activeDraftId}
          sseUrl={`/api/content-drafts/${activeDraftId}/events`}
          title="Generating canonical core"
          onComplete={onCoreJobComplete}
          onFailed={onJobFailed}
          onClose={() => {
            setActiveDraftId(null);
          }}
        />
      )}

      {/* ═══ Canonical Core Preview (shown after Phase 1) ═══ */}
      {canonicalCore && phase !== 'core' && (
        <Card className={coreApproved ? 'border-green-500/30' : 'border-primary/40'}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                {coreApproved ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Sparkles className="h-4 w-4 text-primary" />
                )}
                Canonical Core
                {!coreApproved && (
                  <Badge variant="outline" className="text-[10px] font-medium uppercase tracking-wide border-primary/40 text-primary">
                    Review
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPhase('core');
                    setCanonicalCore(null);
                    setDraftId(null);
                    setCoreExpanded(true);
                    setCoreApproved(false);
                  }}
                  className="text-xs gap-1"
                >
                  <Pencil className="h-3 w-3" /> Regenerate
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCoreExpanded(!coreExpanded)}
                >
                  {coreExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>
          {coreExpanded && (
            <CardContent className="space-y-4">
              {renderCoreSummary(canonicalCore)}
              {!coreApproved && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/[0.04] p-3">
                  <div className="text-xs text-muted-foreground">
                    Review the core narrative. Approve to unlock content production, or regenerate to try again.
                  </div>
                  <Button size="sm" onClick={() => setCoreApproved(true)} className="shrink-0 gap-1.5">
                    <Check className="h-4 w-4" /> Approve &amp; Continue
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* ═══ PHASE 2: Produce Format-Specific Content ═══ */}
      {(phase === 'core-ready' || phase === 'produce') && coreApproved && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 2: Produce Content</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Choose a format and produce content from the canonical core.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Format picker */}
            <div className="space-y-2">
              <Label>Format</Label>
              <div className="grid grid-cols-4 gap-2">
                {TYPES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setType(t.id)}
                      disabled={phase === 'produce'}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        type === t.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-muted-foreground/30'
                      } disabled:opacity-50`}
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
                  {[300, 500, 700, 1000].map((n) => (
                    <button
                      key={n}
                      onClick={() => setTargetWords(n)}
                      disabled={phase === 'produce'}
                      className={`p-2 rounded-md border text-sm ${
                        targetWords === n
                          ? 'border-primary bg-primary/5 text-primary font-medium'
                          : 'border-border hover:border-muted-foreground/30'
                      } disabled:opacity-50`}
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
                        disabled={phase === 'produce'}
                        className={`p-2 rounded-md border text-sm ${
                          targetMinutes === m
                            ? 'border-primary bg-primary/5 text-primary font-medium'
                            : 'border-border hover:border-muted-foreground/30'
                        } disabled:opacity-50`}
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
                      disabled={phase === 'produce'}
                      className={`p-2 rounded-md border text-sm ${
                        targetShortsSeconds === s
                          ? 'border-primary bg-primary/5 text-primary font-medium'
                          : 'border-border hover:border-muted-foreground/30'
                      } disabled:opacity-50`}
                    >
                      {s}
                      <span className="text-xs text-muted-foreground">s</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Provider selection */}
            <div className="space-y-4">
              <div>
                <ModelPicker
                  providers={DRAFT_PROVIDERS}
                  provider={provider}
                  model={model}
                  recommended={{ provider: null, model: null }}
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
                <Button onClick={handleProduce} disabled={busy || phase === 'produce'}>
                  {phase === 'produce' ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Producing...</>
                  ) : (
                    <><ArrowRight className="h-4 w-4 mr-2" /> Produce {type.charAt(0).toUpperCase() + type.slice(1)}</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ Final Content Preview ═══ */}
      {phase === 'done' && producedContent && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <MarkdownPreview content={producedContent} className="bg-muted/20 p-4 rounded" />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPhase('core-ready');
                  setProducedContent('');
                }}
              >
                <Pencil className="h-4 w-4 mr-2" /> Produce Another Format
              </Button>
              <Button onClick={() => {
                const wordCount = producedContent.split(/\s+/).length;
                tracker.trackCompleted({
                  draftId: draftId || '',
                  draftTitle: title,
                  wordCount,
                  format: type,
                });
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

      {/* Manual output dialog for provider='manual' */}
      <ManualOutputDialog
        open={!!manualState}
        onOpenChange={(open) => {
          if (!open) setManualState(null);
        }}
        onSubmit={handleManualOutputSubmit}
        onAbandon={handleManualAbandon}
        title={manualState ? `Paste ${manualState.phase === 'core' ? 'canonical core' : manualState.phase} output` : 'Paste manual output'}
        description="Copy the prompt from Axiom, run it in your AI tool of choice, then paste the JSON output below."
        submitLabel="Submit"
        loading={busy}
      />
    </div>
  );
}
