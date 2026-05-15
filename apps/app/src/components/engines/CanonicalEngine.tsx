'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, BookOpen, Check,
  ArrowRight, Sparkles, ChevronDown, ChevronUp, Pencil,
  Quote, TrendingUp, Target, MessageSquare, Megaphone, Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ModelPicker,
  MODELS_BY_PROVIDER,
  type ProviderId,
} from '@/components/ai/ModelPicker';
import { ManualOutputDialog } from './ManualOutputDialog';
import { usePipelineTracker } from '@/hooks/use-pipeline-tracker';
import { GenerationProgressFloat } from '@/components/generation/GenerationProgressFloat';
import { ContextBanner } from './ContextBanner';
import { friendlyAiError } from '@/lib/ai/error-message';
import { useUpgrade } from '@/components/billing/UpgradeProvider';
import { rankPersonas, type RankedPersona } from './utils/personaScoring';
import { getPersonaTheme } from './utils/personaTheme';
import { PersonaCarousel } from './PersonaCarousel';
import type { Persona } from '@brighttale/shared/types/agents';
import { useSelector } from '@xstate/react';
import { usePipelineActor } from '@/hooks/usePipelineActor';
import { useAutoPilotTrigger } from '@/hooks/use-auto-pilot-trigger';
import { usePipelineAbort } from '@/components/pipeline/PipelineAbortProvider';
import { hydrateDraftFromConfig } from '@/lib/pipeline/hydrateEngineFromConfig';
import type { PipelineContext } from './types';

type Phase = 'core' | 'core-ready';

interface ResearchOption {
  id: string;
  input_json?: Record<string, unknown>;
  level?: string;
  cards_json?: unknown[];
  approved_cards_json?: unknown[];
}

interface CanonicalEngineProps {
  projectId?: string;
}

const DRAFT_PROVIDERS: ProviderId[] = ['gemini', 'openai', 'anthropic', 'ollama', 'manual'];

export function CanonicalEngine({ projectId: projectIdProp }: CanonicalEngineProps) {
  const actor = usePipelineActor();
  const abortController = usePipelineAbort();
  const channelId = useSelector(actor, (s) => s.context.channelId);
  const ctxProjectId = useSelector(actor, (s) => s.context.projectId);
  const projectId = projectIdProp ?? ctxProjectId;
  const brainstormResult = useSelector(actor, (s) => s.context.stageResults.brainstorm);
  const researchResult = useSelector(actor, (s) => s.context.stageResults.research);
  const draftResult = useSelector(actor, (s) => s.context.stageResults.draft);

  const trackerContext: PipelineContext = {
    channelId: channelId ?? undefined,
    projectId,
    ideaId: brainstormResult?.ideaId,
    ideaTitle: brainstormResult?.ideaTitle,
    ideaVerdict: brainstormResult?.ideaVerdict,
    ideaCoreTension: brainstormResult?.ideaCoreTension,
    brainstormSessionId: brainstormResult?.brainstormSessionId,
    researchSessionId: researchResult?.researchSessionId,
    approvedCardsCount: researchResult?.approvedCardsCount,
    researchLevel: researchResult?.researchLevel,
    researchPrimaryKeyword: researchResult?.primaryKeyword,
    researchSecondaryKeywords: researchResult?.secondaryKeywords,
    researchSearchIntent: researchResult?.searchIntent,
    draftId: draftResult?.draftId,
  };
  const trackerContextRef = useRef<PipelineContext>(trackerContext);
  trackerContextRef.current = trackerContext;

  const [research, setResearch] = useState<ResearchOption | null>(null);
  const [title, setTitle] = useState(brainstormResult?.ideaTitle ?? '');
  const titleRef = useRef(title);
  titleRef.current = title;
  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [model, setModel] = useState<string>('gemini-2.5-flash');

  const [phase, setPhase] = useState<Phase>('core');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [canonicalCore, setCanonicalCore] = useState<Record<string, unknown> | null>(null);
  const [coreExpanded, setCoreExpanded] = useState(true);
  const [coreApproved, setCoreApproved] = useState(false);

  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [activeSince, setActiveSince] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [manualState, setManualState] = useState<{
    draftId: string;
    phase: 'core';
  } | null>(null);

  const [personas, setPersonas] = useState<Persona[]>([]);
  const [rankedPersonas, setRankedPersonas] = useState<RankedPersona[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);

  const { handleMaybeCreditsError } = useUpgrade();

  const tracker = usePipelineTracker('draft', trackerContext);

  const autopilotConfig = useSelector(actor, (s) => s.context.autopilotConfig);
  useEffect(() => {
    const h = hydrateDraftFromConfig(autopilotConfig);
    if (h.selectedPersonaId !== undefined && h.selectedPersonaId !== null) {
      setSelectedPersonaId(h.selectedPersonaId);
    }
    if (h.provider) setProvider(h.provider as Parameters<typeof setProvider>[0]);
    if (h.model) setModel(h.model);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const rsid = researchResult?.researchSessionId;
    if (!rsid) return;

    (async () => {
      try {
        const res = await fetch(`/api/research-sessions/${rsid}`, {
          signal: abortController?.signal,
        });
        const json = await res.json();
        if (json?.data) {
          setResearch(json.data as ResearchOption);
          if (!title && json.data.input_json?.topic) {
            setTitle(json.data.input_json.topic as string);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    })();
  }, [researchResult?.researchSessionId, title, abortController?.signal]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/personas', { signal: abortController?.signal });
        const json = await res.json();
        if (json?.data) {
          setPersonas(json.data as Persona[]);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    })();
  }, [abortController?.signal]);

  useEffect(() => {
    const ctxDraftId = draftResult?.draftId;
    if (!ctxDraftId) return;

    (async () => {
      try {
        const res = await fetch(`/api/content-drafts/${ctxDraftId}`, {
          signal: abortController?.signal,
        });
        const json = await res.json();
        if (!json?.data) return;
        const d = json.data as Record<string, unknown>;

        setDraftId(ctxDraftId);
        if (d.title && typeof d.title === 'string' && !titleRef.current) setTitle(d.title);

        if (d.status === 'awaiting_manual') {
          const hasCore = d.canonical_core_json && typeof d.canonical_core_json === 'object' && Object.keys(d.canonical_core_json as Record<string, unknown>).length > 0;
          const hasDraft = d.draft_json && typeof d.draft_json === 'object' && Object.keys(d.draft_json as Record<string, unknown>).length > 0;
          if (hasCore && !hasDraft) {
            setManualState({ draftId: ctxDraftId, phase: 'core' });
          }
          return;
        }

        const core = d.canonical_core_json as Record<string, unknown> | null;
        if (core && typeof core === 'object' && Object.keys(core).length > 0) {
          setCanonicalCore(core);
          setPhase('core-ready');
          setCoreExpanded(true);
          setCoreApproved(false);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    })();
  }, [draftResult?.draftId, abortController?.signal]);

  useEffect(() => {
    if (personas.length === 0) return;
    const ranked = rankPersonas(personas, trackerContextRef.current, undefined);
    setRankedPersonas(ranked);
    const recommended = ranked.find((r) => r.isRecommended) ?? ranked[0];
    if (recommended && !selectedPersonaId) {
      setSelectedPersonaId(recommended.persona.id);
    }
  }, [personas, brainstormResult?.ideaTitle, researchResult?.primaryKeyword, selectedPersonaId]);

  const selectedPersona = personas.find((p) => p.id === selectedPersonaId);
  const selectedTheme = selectedPersona ? getPersonaTheme(selectedPersona.slug) : null;
  const personaCardStyle = selectedTheme
    ? {
      borderColor: `rgba(${selectedTheme.glow}, 0.35)`,
      boxShadow: `0 0 0 1px rgba(${selectedTheme.glow}, 0.08), 0 8px 28px -12px rgba(${selectedTheme.glow}, 0.18)`,
    }
    : undefined;

  const [recommendationLoaded, setRecommendationLoaded] = useState(false);
  const [recommended, setRecommended] = useState<{ provider: string | null; model: string | null }>({
    provider: null,
    model: null,
  });
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agents', { signal: abortController?.signal });
        const json = await res.json();
        const agent = (json.data?.agents as Array<Record<string, unknown>>)?.find(
          (a) => a.slug === 'content-core'
        );
        if (agent?.recommended_provider) {
          setRecommended({
            provider: agent.recommended_provider as string,
            model: (agent.recommended_model as string) || null,
          });
          if (!autopilotConfig?.draft?.providerOverride) {
            setProvider(agent.recommended_provider as ProviderId);
            if (agent.recommended_model && !autopilotConfig?.draft?.modelOverride) {
              setModel(agent.recommended_model as string);
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      } finally {
        setRecommendationLoaded(true);
      }
    })();
  }, [abortController?.signal, autopilotConfig?.draft?.providerOverride, autopilotConfig?.draft?.modelOverride]);

  const autoMode = useSelector(actor, (s) => s.context.mode);
  const overviewMode = autoMode === 'overview';
  const autoPaused = useSelector(actor, (s) => s.context.paused);

  useAutoPilotTrigger({
    stage: 'draft',
    canFire: () =>
      phase === 'core' &&
      !busy &&
      !activeDraftId &&
      !manualState &&
      !!research &&
      title.trim().length > 0 &&
      !!selectedPersonaId &&
      recommendationLoaded,
    fire: handleGenerateCore,
  });

  const autoCoreApprovedRef = useRef<string | null>(null);
  useEffect(() => {
    if ((autoMode !== 'supervised' && autoMode !== 'overview') || autoPaused) return;
    if (phase !== 'core-ready') return;
    if (!canonicalCore || !draftId) return;
    if (coreApproved) return;
    if (autoCoreApprovedRef.current === draftId) return;
    autoCoreApprovedRef.current = draftId;
    setCoreApproved(true);
  }, [autoMode, autoPaused, phase, canonicalCore, draftId, coreApproved]);

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

  async function handleGenerateCore() {
    if (busy) return;
    if (!research) { toast.error('Select research first'); return; }
    if (!title.trim()) { toast.error('Enter a title'); return; }
    if (!selectedPersonaId) { toast.error('Select a persona'); return; }

    actor.send({ type: 'STAGE_PROGRESS', stage: 'draft', partial: { status: 'Building outline' } });
    tracker.trackStarted({
      draftId: draftId || '',
      phase: 'core',
      provider,
      model,
    });

    let newDraftId = draftId;
    if (!newDraftId) {
      const draft = await runStep('create draft', () =>
        fetch('/api/content-drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(channelId ? { channelId } : {}),
            ...(projectId ? { projectId } : {}),
            ...(trackerContext.ideaId ? { ideaId: trackerContext.ideaId } : {}),
            researchSessionId: research.id,
            title,
            personaId: selectedPersonaId,
          }),
          signal: abortController?.signal,
        })
      );
      if (!draft) return;
      newDraftId = (draft as { id: string }).id;
      setDraftId(newDraftId);

      actor.send({
        type: 'STAGE_PROGRESS',
        stage: 'draft',
        partial: { draftId: newDraftId, draftTitle: title },
      });
    }

    if (provider === 'manual') {
      const res = await fetch(`/api/content-drafts/${newDraftId}/canonical-core`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model }),
        signal: abortController?.signal,
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

    const sinceAnchor = new Date(Date.now() - 1_000).toISOString();
    const enqueued = await runStep('start canonical core', () =>
      fetch(`/api/content-drafts/${newDraftId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model }),
        signal: abortController?.signal,
      })
    );
    if (!enqueued) return;
    setActiveSince(sinceAnchor);
    setActiveDraftId(newDraftId);
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

      setCanonicalCore((parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : null);
      setPhase('core-ready');
      setCoreApproved(false);
      setCoreExpanded(true);
      if (!overviewMode) toast.success('Canonical core submitted — review before producing');
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
      actor.send({ type: 'STAGE_PROGRESS', stage: 'draft', partial: { draftId: undefined } });
    }
  }

  const handleManualCoreImport = useCallback(async (parsed: unknown) => {
    let core = parsed as Record<string, unknown>;
    if (core.BC_CANONICAL_CORE && typeof core.BC_CANONICAL_CORE === 'object') {
      core = core.BC_CANONICAL_CORE as Record<string, unknown>;
    }

    if (!research) { toast.error('Select research before importing'); return; }
    if (!title.trim()) { toast.error('Enter a title'); return; }
    if (!selectedPersonaId) { toast.error('Select a persona'); return; }

    const draft = await runStep('create draft', () =>
      fetch('/api/content-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(channelId ? { channelId } : {}),
          ...(projectId ? { projectId } : {}),
          ...(trackerContext.ideaId ? { ideaId: trackerContext.ideaId } : {}),
          researchSessionId: research.id,
          title,
          personaId: selectedPersonaId,
        }),
        signal: abortController?.signal,
      })
    );
    if (!draft) return;
    const newDraftId = (draft as { id: string }).id;
    setDraftId(newDraftId);

    actor.send({
      type: 'STAGE_PROGRESS',
      stage: 'draft',
      partial: { draftId: newDraftId, draftTitle: title },
    });

    const updated = await runStep('save canonical core', () =>
      fetch(`/api/content-drafts/${newDraftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalCoreJson: core }),
        signal: abortController?.signal,
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
    if (!overviewMode) toast.success('Canonical core imported — review before producing');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [research, title, selectedPersonaId, channelId, projectId, trackerContext.ideaId, abortController?.signal, overviewMode]);

  function onCoreJobComplete() {
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
          toast.error('Failed to load draft');
          return;
        }
        const coreJson = draftRow.canonical_core_json ?? draftRow.canonicalCoreJson;

        if (coreJson && typeof coreJson === 'object') {
          setCanonicalCore(coreJson as Record<string, unknown>);
          tracker.trackAction('core.generated', {
            draftId,
            canonicalCoreJson: coreJson,
          });
          setPhase('core-ready');
          setCoreExpanded(true);
          setCoreApproved(false);
          if (!overviewMode) toast.success('Canonical core generated — review before producing');
        } else {
          toast.error('No canonical core found in draft');
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
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
    setActiveSince(null);
  }

  const cardCount = (() => {
    const data = research?.approved_cards_json ?? research?.cards_json;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return Array.isArray(data) ? data.length : 0;
    const d = data as Record<string, unknown>;
    const count = (Array.isArray(d.sources) ? d.sources.length : 0)
      + (Array.isArray(d.statistics) ? d.statistics.length : 0)
      + (Array.isArray(d.expert_quotes) ? d.expert_quotes.length : 0);
    return count > 0 ? count : 0;
  })();

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

  return (
    <section data-testid="canonical-engine" className="space-y-6">
      <ContextBanner stage="draft" context={trackerContext} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> Canonical Core
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate the shared narrative skeleton — thesis, argument chain, emotional arc — that all formats derive from.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-1.5 text-sm ${phase === 'core' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
          {phase !== 'core' ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <div className="h-4 w-4 rounded-full border-2 border-primary flex items-center justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            </div>
          )}
          Generate Core
        </div>
        <div className="h-px w-8 bg-border" />
        <div className={`flex items-center gap-1.5 text-sm ${phase === 'core-ready' ? 'text-primary font-medium' : 'text-muted-foreground/50'}`}>
          {phase === 'core-ready' ? (
            <div className="h-4 w-4 rounded-full border-2 border-primary flex items-center justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            </div>
          ) : (
            <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
          )}
          Review &amp; Approve
        </div>
      </div>

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

      {rankedPersonas.length > 0 && (
        <div className="space-y-2">
          <div className="px-1">
            <h3 className="text-base font-semibold tracking-tight">Author Persona</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Whose voice tells this story? Click a card or use ← → to browse.
            </p>
          </div>
          <PersonaCarousel
            rankedPersonas={rankedPersonas}
            selectedPersonaId={selectedPersonaId}
            onSelect={setSelectedPersonaId}
          />
        </div>
      )}

      {phase === 'core' && (
        <Card style={personaCardStyle}>
          <CardHeader>
            <CardTitle className="text-base">Step 1: Canonical Core</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              The canonical core is the shared narrative skeleton — thesis, argument chain, emotional arc.
              All format-specific content (blog, video, shorts, podcast) derives from it.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="e.g., The 85% Rule: Why Giving Your All Is Sabotaging Your Growth"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

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
                <Button onClick={handleGenerateCore} disabled={busy || !research || !title.trim() || !selectedPersonaId}>
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
                {!selectedPersonaId && (
                  <p className="text-xs text-muted-foreground">
                    Select a persona before generating.
                  </p>
                )}
              </div>
            </div>

            <ManualOutputDialog
              open={provider === 'manual' && phase === 'core' && !manualState}
              title="Paste Canonical Core Output"
              description="Paste the BC_CANONICAL_CORE YAML/JSON output from your AI assistant."
              onSubmit={handleManualCoreImport}
              onOpenChange={(o) => { if (!o) setProvider('gemini'); }}
            />
          </CardContent>
        </Card>
      )}

      {activeDraftId && (
        <GenerationProgressFloat
          open={!overviewMode && !!activeDraftId}
          sessionId={activeDraftId}
          sseUrl={`/api/content-drafts/${activeDraftId}/events`}
          since={activeSince ?? undefined}
          title="Generating canonical core"
          onComplete={onCoreJobComplete}
          onFailed={onJobFailed}
          onClose={() => {
            setActiveDraftId(null);
            setActiveSince(null);
          }}
        />
      )}

      {manualState && (
        <ManualOutputDialog
          open={true}
          title="Paste Canonical Core Output"
          description="Paste the BC_CANONICAL_CORE YAML/JSON output from your AI assistant."
          onSubmit={handleManualOutputSubmit}
          onOpenChange={(o) => { if (!o) void handleManualAbandon(); }}
          onAbandon={handleManualAbandon}
        />
      )}

      {canonicalCore && phase === 'core-ready' && (
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

    </section>
  );
}

