'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Loader2,
  Search,
  RefreshCw,
  Check,
  ClipboardPaste,
  ArrowRight,
  AlertTriangle,
  Sparkles,
  FolderOpen,
  BookOpen,
  BarChart3,
  Quote,
  ShieldAlert,
  ExternalLink,
  Calendar,
  Award,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ModelPicker,
  MODELS_BY_PROVIDER,
  type ProviderId,
} from '@/components/ai/ModelPicker';
import { ManualOutputDialog } from '@/components/engines/ManualOutputDialog';
import { ResearchFindingsReport } from '@/components/engines/ResearchFindingsReport';
import { synthesizeFindingsFromLegacy } from '@/lib/research/synthesize-findings';
import { extractResearchSignals } from './utils/extractResearchSignals';
import { usePipelineTracker } from '@/hooks/use-pipeline-tracker';
import { ContextBanner } from './ContextBanner';
import { ImportPicker } from './ImportPicker';
import { friendlyAiError } from '@/lib/ai/error-message';
import { useSelector } from '@xstate/react';
import { usePipelineActor } from '@/hooks/usePipelineActor';
import { useAutoPilotTrigger } from '@/hooks/use-auto-pilot-trigger';
import { GenerationProgressFloat } from '@/components/generation/GenerationProgressFloat';
import { usePipelineAbort } from '@/components/pipeline/PipelineAbortProvider';
import { hydrateResearchFromConfig } from '@/lib/pipeline/hydrateEngineFromConfig';
import type { ResearchResult, PipelineContext } from './types';

type Level = 'surface' | 'medium' | 'deep';

interface Card {
  type?: string;
  title?: string;
  url?: string;
  author?: string;
  quote?: string;
  claim?: string;
  relevance?: number;
  [k: string]: unknown;
}

interface ResearchEngineProps {
  mode?: 'generate' | 'import';
  onModeChange?: (m: 'generate' | 'import') => void;
  onComplete?: () => void;
  initialSession?: Record<string, unknown>;
  initialCards?: Record<string, unknown>[];
  initialApproved?: number[];
  initialIdeaId?: string;
}

const FOCUS_OPTIONS = [
  { id: 'stats', label: 'Statistics' },
  { id: 'expert_advice', label: 'Expert advice' },
  { id: 'pro_tips', label: 'Pro tips' },
  { id: 'validated_processes', label: 'Validated processes' },
];

const RESEARCH_PROVIDERS: ProviderId[] = ['gemini', 'openai', 'anthropic', 'ollama', 'manual'];

export function ResearchEngine({
  mode: engineMode,
  onModeChange,
  onComplete,
  initialSession,
  initialCards,
  initialApproved,
  initialIdeaId,
}: ResearchEngineProps) {
  const actor = usePipelineActor();
  const abortController = usePipelineAbort();
  const channelId = useSelector(actor, (s) => s.context.channelId);
  const projectId = useSelector(actor, (s) => s.context.projectId);
  const brainstormResult = useSelector(actor, (s) => s.context.stageResults.brainstorm);
  const researchResult = useSelector(actor, (s) => s.context.stageResults.research);
  const researchStatus = useSelector(actor, (s) => s.context.stageStatus?.research);
  const isGenerating = useSelector(actor, (s) => s.matches({ research: 'generating' }));
  const creditSettings = useSelector(actor, (s) => s.context.creditSettings);

  const trackerContext: PipelineContext = {
    channelId: channelId ?? undefined,
    projectId,
    ideaId: brainstormResult?.ideaId ?? initialIdeaId,
    ideaTitle: brainstormResult?.ideaTitle,
    researchSessionId: researchResult?.researchSessionId,
  };

  const levels = [
    { id: 'surface' as Level, label: 'Surface', cost: creditSettings.costResearchSurface, description: 'Top 3 sources, basic statistics' },
    { id: 'medium' as Level, label: 'Medium', cost: creditSettings.costResearchMedium, description: '5-8 sources, expert quotes, supporting data' },
    { id: 'deep' as Level, label: 'Deep', cost: creditSettings.costResearchDeep, description: '10+ sources, counterarguments, cross-validation' },
  ];

  // Input mode
  const [topic, setTopic] = useState(brainstormResult?.ideaTitle ?? '');
  const [level, setLevel] = useState<Level>('medium');
  const [focusTags, setFocusTags] = useState<string[]>(['stats']);
  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [model, setModel] = useState<string>('gemini-2.5-flash');
  const [recommended, setRecommended] = useState<{
    provider: string | null;
    model: string | null;
  }>({ provider: null, model: null });

  // Generation state
  const [cards, setCards] = useState<Card[]>([]);
  const [approved, setApproved] = useState<Set<number>>(new Set());
  const [running, setRunning] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [researchSummary, setResearchSummary] = useState<string | null>(null);
  const [ideaValidation, setIdeaValidation] = useState<Record<string, unknown> | null>(null);
  const [knowledgeGaps, setKnowledgeGaps] = useState<string[]>([]);
  const [refinedAngle, setRefinedAngle] = useState<Record<string, unknown> | null>(null);
  const [findings, setFindings] = useState<Record<string, unknown> | null>(null);

  // Manual provider — open dialog when API responds with awaiting_manual
  const [manualSessionId, setManualSessionId] = useState<string | null>(null);

  // Background generation tracking (Inngest job + SSE events)
  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(null);

  const tracker = usePipelineTracker('research', trackerContext);

  // When initialSession is provided, we're in "session detail" mode
  const isSessionDetail = !!initialSession;

  // Hydrate depth from autopilotConfig once on mount (wizard inputs take precedence).
  const autopilotConfig = useSelector(actor, (s) => s.context.autopilotConfig);
  useEffect(() => {
    const h = hydrateResearchFromConfig(autopilotConfig);
    if (h.researchDepth !== undefined) setLevel(h.researchDepth);
    if (h.provider) setProvider(h.provider as Parameters<typeof setProvider>[0]);
    if (h.model) setModel(h.model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize from initial values
  useEffect(() => {
    if (initialSession && typeof initialSession === 'object') {
      const sess = initialSession as Record<string, unknown>;
      setSessionId(sess.id as string);
      if (sess.level) {
        setLevel(sess.level as Level);
      }
      if (sess.input_json && typeof sess.input_json === 'object') {
        const input = sess.input_json as Record<string, unknown>;
        setTopic((input.topic as string) || '');
        if (input.focusTags && Array.isArray(input.focusTags)) {
          setFocusTags(input.focusTags as string[]);
        }
      }
      if (sess.refined_angle_json && typeof sess.refined_angle_json === 'object') {
        setRefinedAngle(sess.refined_angle_json as Record<string, unknown>);
      }
      // Pull findings from the session row itself (new shape) or synthesize from legacy array
      if (sess.cards_json && typeof sess.cards_json === 'object' && !Array.isArray(sess.cards_json)) {
        setFindings(sess.cards_json as Record<string, unknown>);
      } else if (Array.isArray(sess.cards_json) && sess.cards_json.length > 0) {
        setFindings(synthesizeFindingsFromLegacy(sess.cards_json as Array<Record<string, unknown>>));
      }
    }
    if (initialCards && Array.isArray(initialCards)) {
      setFindings(synthesizeFindingsFromLegacy(initialCards));
      const mapped = initialCards.map((card: unknown) => {
        const c = card as Record<string, unknown>;
        return {
          type: c.type as string | undefined,
          title: c.title as string | undefined,
          url: c.url as string | undefined,
          author: c.author as string | undefined,
          quote: c.quote as string | undefined,
          claim: c.claim as string | undefined,
          relevance: c.relevance as number | undefined,
          ...c,
        } as Card;
      });
      setCards(mapped);
      if (initialApproved && Array.isArray(initialApproved)) {
        setApproved(new Set(initialApproved));
      } else {
        setApproved(new Set(mapped.map((_, i) => i)));
      }
    }
  }, [initialSession, initialCards, initialApproved]);

  // Handle findings hydration when provided in session
  useEffect(() => {
    if (initialSession && typeof initialSession === 'object') {
      const sess = initialSession as Record<string, unknown>;
      // Check if cards_json is an object (findings) not an array (legacy cards)
      if (sess.cards_json && typeof sess.cards_json === 'object' && !Array.isArray(sess.cards_json)) {
        setFindings(sess.cards_json as Record<string, unknown>);
      }
    }
  }, [initialSession]);

  // Load existing session from context when navigating back in the pipeline
  useEffect(() => {
    if (initialSession || initialCards) return;
    const ctxSessionId = researchResult?.researchSessionId;
    if (!ctxSessionId) return;
    if (sessionId === ctxSessionId && (cards.length > 0 || findings)) return;

    (async () => {
      try {
        const res = await fetch(`/api/research-sessions/${ctxSessionId}`, {
          signal: abortController?.signal,
        });
        const json = await res.json();
        const sess = json.data?.session ?? json.data;
        if (sess) {
          // Check if session is awaiting manual output
          if (sess.status === 'awaiting_manual') {
            setManualSessionId(sess.id as string);
            return;
          }

          setSessionId(sess.id as string);
          if (sess.level) setLevel(sess.level as Level);
          if (sess.input_json && typeof sess.input_json === 'object') {
            const input = sess.input_json as Record<string, unknown>;
            if (input.topic) setTopic(input.topic as string);
            if (input.focusTags && Array.isArray(input.focusTags)) {
              setFocusTags(input.focusTags as string[]);
            }
          }
          if (sess.refined_angle_json && typeof sess.refined_angle_json === 'object') {
            setRefinedAngle(sess.refined_angle_json as Record<string, unknown>);
          }

          // Check if cards_json is an object (findings) or array (legacy cards)
          if (sess.cards_json && typeof sess.cards_json === 'object' && !Array.isArray(sess.cards_json)) {
            setFindings(sess.cards_json as Record<string, unknown>);
          } else if (Array.isArray(sess.cards_json) && sess.cards_json.length > 0) {
            // Legacy array → synthesize findings so the new report renders
            setFindings(synthesizeFindingsFromLegacy(sess.cards_json as Array<Record<string, unknown>>));
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // silent — form stays empty, user can regenerate
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [researchResult?.researchSessionId]);

  // Restore in-flight generation state when re-mounting after back-navigation.
  // stageStatus.research lives in XState's in-memory snapshot only — it is NOT
  // serialized into pipeline_state_json, so this effect's restoration path runs
  // exclusively on in-session remounts, not after page reloads. `isGenerating`
  // is read at mount-time from the same actor snapshot as researchStatus, so
  // the two values are temporally consistent. Do not add `isGenerating` to the
  // dep array — the effect must stay mount-only.
  useEffect(() => {
    if (!researchStatus?.isGenerating) return;
    const activeId = researchStatus.activeSessionId as string | undefined;
    if (!activeId) return;
    if (researchResult?.researchSessionId) return; // already completed
    setActiveGenerationId(activeId);
    setRunning(true);
    // Ensure machine substate matches data state.
    if (!isGenerating) actor.send({ type: 'RESEARCH_STARTED' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally mount-only — restoring snapshot from machine

  // Fetch recommended agent
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agents', { signal: abortController?.signal });
        const json = await res.json();
        const agent = (json.data?.agents as Array<Record<string, unknown>>)?.find(
          (a) => a.slug === 'research'
        );
        if (agent?.recommended_provider) {
          setRecommended({
            provider: agent.recommended_provider as string,
            model: (agent.recommended_model as string) || null,
          });
          if (!autopilotConfig?.research?.providerOverride) {
            setProvider(agent.recommended_provider as ProviderId);
            if (agent.recommended_model && !autopilotConfig?.research?.modelOverride) {
              setModel(agent.recommended_model as string);
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // silent — keep defaults
      }
    })();
  }, [abortController?.signal, autopilotConfig?.research?.providerOverride, autopilotConfig?.research?.modelOverride]);

  function toggleFocus(id: string) {
    setFocusTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  function toggleApproval(i: number) {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
      return next;
    });
  }

  async function handleManualResearchImport(parsed: unknown) {
    // Unwrap BC_RESEARCH_OUTPUT wrapper if present
    let obj = parsed as Record<string, unknown>;
    if (obj.BC_RESEARCH_OUTPUT && typeof obj.BC_RESEARCH_OUTPUT === 'object') {
      obj = obj.BC_RESEARCH_OUTPUT as Record<string, unknown>;
    }

    // Build cards from various BC_RESEARCH_OUTPUT sections
    const allCards: Card[] = [];

    // Sources → cards
    const sources = (obj.sources ?? []) as Array<Record<string, unknown>>;
    for (const s of sources) {
      allCards.push({
        type: 'source',
        title: (s.title as string) ?? '',
        url: (s.url as string) ?? '',
        author: (s.author as string) ?? '',
        relevance:
          s.credibility === 'high'
            ? 10
            : s.credibility === 'medium'
              ? 7
              : 4,
        ...s,
      });
    }

    // Statistics → cards
    const stats = (obj.statistics ?? []) as Array<Record<string, unknown>>;
    for (const s of stats) {
      allCards.push({
        type: 'statistic',
        title: `${s.claim}: ${s.figure}`,
        claim: s.claim as string,
        ...s,
      });
    }

    // Expert quotes → cards
    const quotes = (obj.expert_quotes ?? []) as Array<Record<string, unknown>>;
    for (const q of quotes) {
      allCards.push({
        type: 'expert_quote',
        title: (q.author as string) ?? 'Expert',
        quote: q.quote as string,
        author: q.author as string,
        ...q,
      });
    }

    // Counterarguments → cards
    const counters = (obj.counterarguments ?? []) as Array<Record<string, unknown>>;
    for (const c of counters) {
      allCards.push({
        type: 'counterargument',
        title: (c.point as string) ?? '',
        claim: c.point as string,
        ...c,
      });
    }

    // Fallback: try flat cards/results array
    if (allCards.length === 0) {
      const flat = (obj.cards ?? obj.results ?? []) as Card[];
      if (Array.isArray(flat)) allCards.push(...flat);
    }

    if (allCards.length === 0) {
      toast.error('No research data found. Expected sources, statistics, expert_quotes, or counterarguments.');
      return;
    }

    // Extract summary, validation, knowledge gaps, and refined angle
    const refinedAngleObj = (obj.refined_angle && typeof obj.refined_angle === 'object')
      ? obj.refined_angle as Record<string, unknown>
      : null;

    if (typeof obj.research_summary === 'string') {
      setResearchSummary(obj.research_summary);
    }
    if (obj.idea_validation && typeof obj.idea_validation === 'object') {
      setIdeaValidation(obj.idea_validation as Record<string, unknown>);
    }
    if (Array.isArray(obj.knowledge_gaps)) {
      setKnowledgeGaps(obj.knowledge_gaps as string[]);
    }
    if (refinedAngleObj) {
      setRefinedAngle(refinedAngleObj);
    }

    // Persist as a research session so downstream engines can fetch the cards
    try {
      const res = await fetch('/api/research-sessions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController?.signal,
        body: JSON.stringify({
          ...(channelId ? { channelId } : {}),
          ...(projectId ? { projectId } : {}),
          ...(trackerContext.ideaId ? { ideaId: trackerContext.ideaId } : {}),
          topic: topic || trackerContext.ideaTitle || undefined,
          level,
          cardsJson: allCards,
          ...(refinedAngleObj ? { refinedAngleJson: refinedAngleObj } : {}),
          ...(typeof obj.research_summary === 'string' ? { researchSummary: obj.research_summary } : {}),
        }),
      });
      const json = await res.json();
      if (json?.data?.sessionId) {
        setSessionId(json.data.sessionId);
      }
    } catch {
      // Cards are still in state; just won't have a session ID for downstream
      if (!overviewMode) toast.warning('Cards imported locally but failed to save session to database');
    }

    setCards(allCards);
    setApproved(new Set(allCards.map((_, i) => i)));
    tracker.trackAction('imported', { cardCount: allCards.length, source: 'manual' });
    if (!overviewMode) toast.success(
      `${allCards.length} research cards imported (${sources.length} sources, ${stats.length} stats, ${quotes.length} quotes, ${counters.length} counterarguments)`
    );
  }

  async function handleRun() {
    if (!topic.trim()) {
      toast.error('Enter a topic');
      return;
    }

    actor.send({ type: 'STAGE_PROGRESS', stage: 'research', partial: { status: 'Researching topic' } });
    actor.send({ type: 'STAGE_STATUS', stage: 'research', status: { isGenerating: true } });
    actor.send({ type: 'RESEARCH_STARTED' });
    setRunning(true);
    setCards([]);
    setApproved(new Set());

    tracker.trackStarted({ topic: topic.trim(), level, focusTags, provider, model });

    let wentAsync = false;
    try {
      const res = await fetch('/api/research-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(channelId ? { channelId } : {}),
          ...(projectId ? { projectId } : {}),
          ...(trackerContext.ideaId ? { ideaId: trackerContext.ideaId } : {}),
          topic: topic.trim(),
          level,
          focusTags,
          provider,
          model,
        }),
        signal: abortController?.signal,
      });

      let json: {
        data?: { sessionId?: string; status?: string; cards?: Card[]; findings?: Record<string, unknown> };
        error?: { message?: string; code?: string };
      } | null = null;
      try {
        json = await res.json();
      } catch {
        toast.error(`Server returned ${res.status} without JSON`);
        return;
      }

      if (json?.error) {
        const friendly = friendlyAiError(json.error.message ?? '');
        tracker.trackFailed(json.error.message ?? '');
        toast.error(friendly.title, { description: friendly.hint });
        return;
      }

      // Check for manual provider awaiting output
      if (json?.data?.status === 'awaiting_manual') {
        setManualSessionId(json?.data?.sessionId || null);
        if (!overviewMode) toast.success('Prompt copied to Axiom. Paste the output when ready.');
        return;
      }

      const newSessionId = json?.data?.sessionId || null;
      setSessionId(newSessionId);

      // Async path (status='queued', 202 from API): subscribe to SSE and load
      // findings on completion. The sync legacy path (findings/cards in body)
      // is kept as a fallback.
      const generatedFindings = json?.data?.findings;
      const generatedCards = json?.data?.cards ?? [];

      if (generatedFindings && typeof generatedFindings === 'object') {
        setFindings(generatedFindings);
        tracker.trackCompleted({ sessionId: newSessionId || '', cardCount: generatedCards.length, approvedCount: generatedCards.length, level });
        if (!overviewMode) toast.success('Research completed');
      } else if (generatedCards.length > 0) {
        setCards(generatedCards);
        setApproved(new Set(generatedCards.map((_, i) => i)));
        tracker.trackCompleted({ sessionId: newSessionId || '', cardCount: generatedCards.length, approvedCount: generatedCards.length, level });
        if (!overviewMode) toast.success(`${generatedCards.length} research cards found`);
      } else if (newSessionId) {
        // Background job — show progress float, hydrate on complete
        wentAsync = true;
        setActiveGenerationId(newSessionId);
        // Persist session ID to machine so it survives component remounts.
        actor.send({ type: 'STAGE_STATUS', stage: 'research', status: { isGenerating: true, activeSessionId: newSessionId } });
        return;
      } else {
        if (!overviewMode) toast.warning('No research data recognized in output', {
          description:
            "AI responded but format didn't match. Try a different model or re-run.",
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        if (!wentAsync) setRunning(false);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      const friendly = friendlyAiError(message);
      tracker.trackFailed(message);
      toast.error(friendly.title, { description: friendly.hint });
    } finally {
      // Keep running=true while a background job is in flight; let
      // handleGenerationComplete / handleGenerationFailed clear it.
      if (!wentAsync) {
        setRunning(false);
        actor.send({ type: 'STAGE_STATUS', stage: 'research', status: { isGenerating: false } });
      }
    }
  }

  async function handleGenerationComplete() {
    const id = activeGenerationId;
    setActiveGenerationId(null);
    if (!id) return;
    try {
      const res = await fetch(`/api/research-sessions/${id}`, {
        signal: abortController?.signal,
      });
      const json = await res.json();
      const sess = (json.data?.session ?? json.data) as Record<string, unknown> | undefined;
      if (!sess) {
        toast.error('Failed to load research session');
        return;
      }
      if (sess.cards_json && typeof sess.cards_json === 'object' && !Array.isArray(sess.cards_json)) {
        setFindings(sess.cards_json as Record<string, unknown>);
        tracker.trackCompleted({ sessionId: id, cardCount: 0, approvedCount: 0, level });
        if (!overviewMode) toast.success('Research completed');
      } else if (Array.isArray(sess.cards_json) && sess.cards_json.length > 0) {
        const legacy = sess.cards_json as Array<Record<string, unknown>>;
        setFindings(synthesizeFindingsFromLegacy(legacy));
        tracker.trackCompleted({ sessionId: id, cardCount: legacy.length, approvedCount: legacy.length, level });
        if (!overviewMode) toast.success(`${legacy.length} research cards found`);
      } else {
        if (!overviewMode) toast.warning('Research finished but no findings were saved', {
          description: 'Try regenerating with a different model.',
        });
      }
      if (sess.refined_angle_json && typeof sess.refined_angle_json === 'object') {
        setRefinedAngle(sess.refined_angle_json as Record<string, unknown>);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : String(err);
      toast.error('Failed to load research findings', { description: message });
    } finally {
      setRunning(false);
      actor.send({ type: 'STAGE_STATUS', stage: 'research', status: { isGenerating: false } });
    }
  }

  function handleGenerationFailed(message: string) {
    setActiveGenerationId(null);
    setRunning(false);
    actor.send({ type: 'STAGE_STATUS', stage: 'research', status: { isGenerating: false } });
    tracker.trackFailed(message);
    const friendly = friendlyAiError(message);
    toast.error(friendly.title, { description: friendly.hint });
  }

  // Auto-pilot: when findings render, auto-approve and advance to draft.
  const autoApprovedRef = useRef<string | null>(null);
  const autoMode = useSelector(actor, (s) => s.context.mode);
  const overviewMode = autoMode === 'overview';
  const autoPaused = useSelector(actor, (s) => s.context.paused);
  useEffect(() => {
    if ((autoMode !== 'supervised' && autoMode !== 'overview') || autoPaused) return;
    if (researchResult?.researchSessionId) return;
    if (!findings) return;
    if (running || regenerating) return;
    // Use sessionId when available; fall back to a stable sentinel so the ref
    // guard works when findings come from initialCards (no server session yet).
    const key = sessionId ?? '__initial__';
    if (autoApprovedRef.current === key) return;
    autoApprovedRef.current = key;

    actor.send({ type: 'STAGE_PROGRESS', stage: 'research', partial: { status: 'Approving cards' } });
    const signals = extractResearchSignals(findings);
    const result: ResearchResult = {
      researchSessionId: sessionId ?? '',
      approvedCardsCount: 1,
      researchLevel: level,
      primaryKeyword: signals.primaryKeyword,
      secondaryKeywords: signals.secondaryKeywords,
      searchIntent: signals.searchIntent,
      confidenceScore: signals.confidenceScore,
      evidenceStrength: signals.evidenceStrength,
      sourceCount: signals.sourceCount,
      expertQuoteCount: signals.expertQuoteCount,
      researchSummary: signals.researchSummary,
      pivotRecommendation: signals.pivotRecommendation,
    };
    tracker.trackAction('findings.auto_approved', { sessionId });
    actor.send({ type: 'RESEARCH_COMPLETE', result });
  }, [
    autoMode,
    autoPaused,
    findings,
    sessionId,
    running,
    regenerating,
    researchResult?.researchSessionId,
    level,
    actor,
    tracker,
  ]);

  // Auto-pilot (overview mode, legacy-cards path): handles sessions where the API returned a
  // synchronous cards array instead of SSE findings. Runs only in `overview` mode per Task 1.3
  // spec ("Step 5: auto-approve-all in overview mode"); `supervised` users review cards manually.
  // The findings effect above intentionally retains supervised+overview because findings are stable
  // streaming objects with explicit IDs that the user already gated through the session-create API.
  const autoCardsApprovedRef = useRef(false);
  useEffect(() => {
    if (autoMode !== 'overview' || autoPaused) return;
    if (researchResult?.researchSessionId) return;
    if (findings) return; // handled by the findings effect above
    if (cards.length === 0) return;
    if (running || regenerating) return;
    if (autoCardsApprovedRef.current) return;
    autoCardsApprovedRef.current = true;
    const result: ResearchResult = {
      researchSessionId: sessionId || '',
      approvedCardsCount: cards.length,
      researchLevel: level,
    };
    tracker.trackAction('cards.auto_approved', { cardCount: cards.length });
    actor.send({ type: 'RESEARCH_COMPLETE', result });
  }, [
    autoMode,
    autoPaused,
    findings,
    cards,
    sessionId,
    running,
    regenerating,
    researchResult?.researchSessionId,
    level,
    actor,
    tracker,
  ]);

  useAutoPilotTrigger({
    stage: 'research',
    canFire: () =>
      topic.trim().length > 0 &&
      !(isGenerating || running) &&
      !manualSessionId &&
      !activeGenerationId &&
      !findings &&
      cards.length === 0 &&
      !researchResult?.researchSessionId &&
      // Gate on the recommended provider/model fetch so we don't auto-fire
      // with the gemini default before /api/agents resolves.
      recommended.provider !== null,
    fire: handleRun,
  });

  async function handleRegenerate() {
    if (!sessionId) {
      toast.error('No session to regenerate');
      return;
    }

    setRegenerating(true);
    try {
      const res = await fetch(`/api/research-sessions/${sessionId}/regenerate`, {
        method: 'POST',
        signal: abortController?.signal,
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error.message);
        return;
      }

      const newId = (json.data?.sessionId || json.data?.session?.id) as string | undefined;
      if (newId) {
        setSessionId(newId);
        // Reload session data
        try {
          const reloadRes = await fetch(`/api/research-sessions/${newId}`, {
            signal: abortController?.signal,
          });
          const reloadJson = await reloadRes.json();
          if (reloadJson.data) {
            const sess = reloadJson.data as Record<string, unknown>;

            if (sess.cards_json && typeof sess.cards_json === 'object' && !Array.isArray(sess.cards_json)) {
              setFindings(sess.cards_json as Record<string, unknown>);
            } else {
              const legacy = (sess.approved_cards_json ?? sess.cards_json ?? []) as Array<Record<string, unknown>>;
              if (legacy.length > 0) {
                setFindings(synthesizeFindingsFromLegacy(legacy));
              }
            }

            if (sess.refined_angle_json && typeof sess.refined_angle_json === 'object') {
              setRefinedAngle(sess.refined_angle_json as Record<string, unknown>);
            }
            tracker.trackAction('regenerated', { sessionId: newId, previousCardCount: cards.length });
            if (!overviewMode) toast.success('Regenerated successfully');
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return;
          if (!overviewMode) toast.success('Regenerated but failed to reload');
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      toast.error('Regeneration failed');
    } finally {
      setRegenerating(false);
    }
  }

  async function handleManualOutputSubmit(parsed: unknown) {
    if (!manualSessionId) return;
    const res = await fetch(`/api/research-sessions/${manualSessionId}/manual-output`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output: parsed }),
      signal: abortController?.signal,
    });
    const json = await res.json();
    if (json.error) {
      toast.error(json.error.message);
      return;
    }

    const newFindings = json.data?.findings;
    const newCards = json.data?.cards ?? [];

    setSessionId(manualSessionId);

    // Prefer findings if available (new format), otherwise use cards (legacy)
    if (newFindings && typeof newFindings === 'object') {
      setFindings(newFindings);
      tracker.trackCompleted({ sessionId: manualSessionId, cardCount: 1, approvedCount: 1, level });
      if (!overviewMode) toast.success('Research imported');
    } else if (newCards.length > 0) {
      setCards(newCards);
      setApproved(new Set(newCards.map((_: Card, i: number) => i)));
      tracker.trackCompleted({ sessionId: manualSessionId, cardCount: newCards.length, approvedCount: newCards.length, level });
      if (!overviewMode) toast.success(`${newCards.length} research cards imported`);
    }

    setManualSessionId(null);
    actor.send({ type: 'STAGE_PROGRESS', stage: 'research', partial: { researchSessionId: manualSessionId } });
  }

  async function handleManualAbandon() {
    if (!manualSessionId) return;
    try {
      // Intentionally NOT passing abortController.signal: cancel is fire-and-forget
      // cleanup that must reach the server even after the pipeline has been aborted.
      await fetch(`/api/research-sessions/${manualSessionId}/cancel`, {
        method: 'POST',
      });
    } catch {
      // silent — best-effort cancel
    }
    setManualSessionId(null);
    setCards([]);
    setSessionId(null);
    actor.send({ type: 'STAGE_PROGRESS', stage: 'research', partial: { researchSessionId: undefined } });
  }

  async function handleApprove() {
    // New findings present — always process them.
    if (findings) {
      const isNewSession = sessionId !== null && sessionId !== researchResult?.researchSessionId;

      // New research session with old result still in machine context: clear
      // downstream stages so the pipeline reflects the fresh research.
      if (isNewSession && researchResult?.researchSessionId) {
        actor.send({ type: 'REDO_FROM', fromStage: 'research' });
      }

      tracker.trackAction('findings.approved', { sessionId: sessionId || '' });

      const signals = extractResearchSignals(findings);
      const result: ResearchResult = {
        researchSessionId: sessionId || '',
        approvedCardsCount: 1,
        researchLevel: level,
        primaryKeyword: signals.primaryKeyword,
        secondaryKeywords: signals.secondaryKeywords,
        searchIntent: signals.searchIntent,
        confidenceScore: signals.confidenceScore,
        evidenceStrength: signals.evidenceStrength,
        sourceCount: signals.sourceCount,
        expertQuoteCount: signals.expertQuoteCount,
        researchSummary: signals.researchSummary,
        pivotRecommendation: signals.pivotRecommendation,
      };
      actor.send({ type: 'RESEARCH_COMPLETE', result });
      onComplete?.();
      return;
    }

    // No new findings but old research is already done — just navigate forward.
    if (researchResult?.researchSessionId) {
      actor.send({ type: 'NAVIGATE', toStage: 'draft' });
      onComplete?.();
      return;
    }

    // For legacy cards format
    const approvedCards = cards.filter((_, i) => approved.has(i));

    tracker.trackAction('cards.approved', { sessionId: sessionId || '', approvedCount: approved.size, totalCount: cards.length, approvedIndexes: Array.from(approved) });

    if (sessionId) {
      // Save approved cards to session
      try {
        const res = await fetch(`/api/research-sessions/${sessionId}/review`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvedCardsJson: approvedCards }),
          signal: abortController?.signal,
        });
        const json = await res.json();
        if (json.error) {
          toast.error(json.error.message);
          return;
        }
      } catch {
        toast.error('Failed to save review');
        return;
      }
    }

    if (!overviewMode) toast.success(`${approvedCards.length} cards approved`);
    const result: ResearchResult = {
      researchSessionId: sessionId || '',
      approvedCardsCount: approvedCards.length,
      researchLevel: level,
    };
    actor.send({ type: 'RESEARCH_COMPLETE', result });
    onComplete?.();
  }

  const shouldPivot = refinedAngle && Boolean(refinedAngle.should_pivot);
  const topic_display =
    isSessionDetail && initialSession
      ? ((initialSession as Record<string, unknown>).input_json as Record<string, unknown>)
          ?.topic as string
      : topic;

  // Import mode: show ImportPicker when mode='import' and no initial session
  if (engineMode === 'import' && !initialSession) {
    return (
      <div className="space-y-6">
        <ContextBanner stage="research" context={trackerContext} />

        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search className="h-5 w-5" /> Research
          </h1>
          {onModeChange && (
            <Tabs value="import" onValueChange={(v) => onModeChange(v as 'generate' | 'import')}>
              <TabsList>
                <TabsTrigger value="generate" className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> Generate
                </TabsTrigger>
                <TabsTrigger value="import" className="gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5" /> Import
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>

        <ImportPicker
          entityType="research-sessions"
          channelId={channelId ?? undefined}
          searchPlaceholder="Search research sessions..."
          emptyMessage="No research sessions found"
          renderItem={(item: Record<string, unknown>): React.ReactNode => (
            <div className="p-3 rounded-lg border hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{item.level as string}</Badge>
                <Badge variant="outline" className="text-[10px]">{item.status as string}</Badge>
                <span className="text-xs text-muted-foreground">
                  {Array.isArray(item.approved_cards_json) ? `${(item.approved_cards_json as unknown[]).length} cards` : 'No cards'}
                </span>
              </div>
            </div>
          )}
          onSelect={(item) => {
            const cards = (item.approved_cards_json ?? item.cards_json ?? []) as unknown[];
            actor.send({
              type: 'RESEARCH_COMPLETE',
              result: {
                researchSessionId: item.id as string,
                approvedCardsCount: cards.length,
                researchLevel: (item.level as string) ?? 'medium',
              } as ResearchResult,
            });
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ContextBanner stage="research" context={trackerContext} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search className="h-5 w-5" /> Research
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSessionDetail
              ? `Session: ${topic_display || 'Untitled'} · ${cards.length} cards · ${level} depth`
              : 'Research your idea with AI. Gather sources, statistics, expert quotes, and counterarguments.'}
          </p>
        </div>
        {onModeChange && !isSessionDetail && (
          <Tabs value="generate" onValueChange={(v) => onModeChange(v as 'generate' | 'import')}>
            <TabsList>
              <TabsTrigger value="generate" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Generate
              </TabsTrigger>
              <TabsTrigger value="import" className="gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" /> Import
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* Always-rendered sr-only span for test queries (must live outside the isSessionDetail guard). */}
      <span data-testid="research-depth" className="sr-only">{level}</span>

      {/* Show form only if not in session detail mode */}
      {!isSessionDetail && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>
                Topic
                {trackerContext.ideaId && (
                  <span className="text-xs text-muted-foreground">
                    {' '}
                    (pre-filled from idea)
                  </span>
                )}
              </Label>
              <Input
                placeholder="e.g. deep work techniques"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Research depth</Label>
              <div className="grid grid-cols-3 gap-2">
                {levels.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setLevel(l.id)}
                    className={`text-left p-3 rounded-lg border-2 transition-all ${
                      level === l.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{l.label}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {l.cost}c
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {l.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Focus</Label>
              <div className="flex flex-wrap gap-2">
                {FOCUS_OPTIONS.map((opt) => (
                  <label
                    key={opt.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs cursor-pointer hover:bg-muted/30"
                  >
                    <Checkbox
                      checked={focusTags.includes(opt.id)}
                      onCheckedChange={() => toggleFocus(opt.id)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-4 mt-2">
              <ModelPicker
                providers={RESEARCH_PROVIDERS}
                provider={provider}
                model={model}
                recommended={recommended}
                onProviderChange={(p) => {
                  setProvider(p);
                  setModel(MODELS_BY_PROVIDER[p][0].id);
                }}
                onModelChange={setModel}
              />
              <Button onClick={handleRun} disabled={(isGenerating || running)}>
                {(isGenerating || running) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />{' '}
                    Researching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" /> Research
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Research summary */}
      {researchSummary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Research Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">{researchSummary}</p>
          </CardContent>
        </Card>
      )}

      {/* Idea validation */}
      {ideaValidation && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" />
              Idea Validation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5">
                <div className={`h-2 w-2 rounded-full ${ideaValidation.core_claim_verified ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-xs">{ideaValidation.core_claim_verified ? 'Claim verified' : 'Claim unverified'}</span>
              </div>
              {typeof ideaValidation.evidence_strength === 'string' && (
                <Badge variant="secondary" className="text-[10px]">
                  Evidence: {ideaValidation.evidence_strength}
                </Badge>
              )}
              {typeof ideaValidation.confidence_score === 'number' && (
                <Badge variant="secondary" className="text-[10px]">
                  Confidence: {Math.round(ideaValidation.confidence_score * 100)}%
                </Badge>
              )}
            </div>
            {typeof ideaValidation.validation_notes === 'string' && (
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                {ideaValidation.validation_notes}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pivot recommendation */}
      {refinedAngle && (
        <Card className={shouldPivot ? 'border-yellow-500/30' : 'border-primary/30'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {shouldPivot ? (
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              ) : (
                <Sparkles className="h-4 w-4 text-primary" />
              )}
              {shouldPivot ? 'Pivot Recommended' : 'Refined Angle'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {typeof refinedAngle.updated_title === 'string' && (
              <p className="text-sm font-medium">{refinedAngle.updated_title}</p>
            )}
            {typeof refinedAngle.updated_hook === 'string' && (
              <p className="text-sm italic text-muted-foreground">&ldquo;{refinedAngle.updated_hook}&rdquo;</p>
            )}
            {typeof refinedAngle.angle_notes === 'string' && (
              <p className="text-xs text-muted-foreground">{refinedAngle.angle_notes}</p>
            )}
            {typeof refinedAngle.recommendation === 'string' && (
              <p className="text-xs text-primary font-medium mt-1">{refinedAngle.recommendation}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* New findings report */}
      {findings && (
        <>
          <ResearchFindingsReport findings={findings} />

          {!((findings as Record<string, unknown>).seo as Record<string, unknown> | undefined)?.primary_keyword && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Primary keyword missing from research output. Production may generate suboptimal SEO.</span>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={handleApprove} size="lg">
              <Check className="h-4 w-4 mr-2" /> Continue{' '}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </>
      )}

      {/* Research cards (legacy) */}
      {!findings && cards.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">Research Cards</h3>
              <Badge variant="secondary" className="text-[10px]">
                {cards.length}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {approved.size} of {cards.length} approved
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (approved.size === cards.length) {
                    setApproved(new Set());
                  } else {
                    setApproved(new Set(cards.map((_, i) => i)));
                  }
                }}
                className="text-xs"
              >
                {approved.size === cards.length ? 'Deselect all' : 'Select all'}
              </Button>
              {isSessionDetail && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                >
                  {regenerating ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1.5" />
                  )}
                  Regenerate
                </Button>
              )}
            </div>
          </div>

          {/* Group cards by type */}
          {(() => {
            const groups: { type: string; label: string; icon: React.ReactNode; cards: { card: Card; idx: number }[] }[] = [
              { type: 'source', label: 'Sources', icon: <BookOpen className="h-4 w-4" />, cards: [] },
              { type: 'statistic', label: 'Statistics', icon: <BarChart3 className="h-4 w-4" />, cards: [] },
              { type: 'expert_quote', label: 'Expert Quotes', icon: <Quote className="h-4 w-4" />, cards: [] },
              { type: 'counterargument', label: 'Counterarguments', icon: <ShieldAlert className="h-4 w-4" />, cards: [] },
            ];
            const ungrouped: { card: Card; idx: number }[] = [];

            cards.forEach((card, idx) => {
              const group = groups.find(g => g.type === card.type);
              if (group) group.cards.push({ card, idx });
              else ungrouped.push({ card, idx });
            });

            const activeGroups = groups.filter(g => g.cards.length > 0);

            return (
              <div className="space-y-4">
                {activeGroups.map((group) => (
                  <div key={group.type}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-muted-foreground">{group.icon}</span>
                      <h4 className="text-sm font-medium">{group.label}</h4>
                      <Badge variant="outline" className="text-[10px]">{group.cards.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {group.cards.map(({ card: c, idx: i }) => {
                        const isApproved = approved.has(i);
                        return (
                          <div
                            key={i}
                            className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                              isApproved
                                ? 'border-primary/40 bg-primary/5'
                                : 'border-border/50 opacity-50 hover:opacity-75'
                            }`}
                            onClick={() => toggleApproval(i)}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={isApproved}
                                onCheckedChange={() => toggleApproval(i)}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                {/* Source cards */}
                                {c.type === 'source' && (
                                  <>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {c.type && (
                                        <Badge variant="outline" className="text-[10px] capitalize">
                                          {String((c as Record<string, unknown>).type ?? c.type).replace(/_/g, ' ')}
                                        </Badge>
                                      )}
                                      {typeof (c as Record<string, unknown>).credibility === 'string' && (
                                        <Badge
                                          variant="secondary"
                                          className={`text-[10px] ${
                                            ((c as Record<string, unknown>).credibility as string).toLowerCase() === 'high'
                                              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                                              : ((c as Record<string, unknown>).credibility as string).toLowerCase() === 'medium'
                                                ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                                                : ''
                                          }`}
                                        >
                                          {(c as Record<string, unknown>).credibility as string}
                                        </Badge>
                                      )}
                                      {typeof (c as Record<string, unknown>).date_published === 'string' && (
                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                          <Calendar className="h-3 w-3" />
                                          {(c as Record<string, unknown>).date_published as string}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm font-medium mt-1.5">{c.title}</p>
                                    {(c as Record<string, unknown>).key_insight && (
                                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                        {String((c as Record<string, unknown>).key_insight)}
                                      </p>
                                    )}
                                    {(c as Record<string, unknown>).quote_excerpt && (
                                      <blockquote className="text-xs italic text-muted-foreground mt-2 pl-3 border-l-2 border-primary/30">
                                        &ldquo;{String((c as Record<string, unknown>).quote_excerpt)}&rdquo;
                                      </blockquote>
                                    )}
                                    {c.url && c.url !== 'N/A' && (
                                      <a
                                        href={c.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-[11px] text-primary hover:underline mt-2 inline-flex items-center gap-1"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                        {(() => {
                                          try { return new URL(c.url).hostname; } catch { return c.url.slice(0, 40); }
                                        })()}
                                      </a>
                                    )}
                                  </>
                                )}

                                {/* Statistic cards */}
                                {c.type === 'statistic' && (
                                  <>
                                    <div className="flex items-baseline gap-3">
                                      <span className="text-2xl font-bold text-primary">
                                        {String((c as Record<string, unknown>).figure ?? '')}
                                      </span>
                                      <span className="text-sm font-medium">
                                        {String((c as Record<string, unknown>).claim ?? c.title ?? '')}
                                      </span>
                                    </div>
                                    {(c as Record<string, unknown>).context && (
                                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                                        {String((c as Record<string, unknown>).context)}
                                      </p>
                                    )}
                                  </>
                                )}

                                {/* Expert quote cards */}
                                {c.type === 'expert_quote' && (
                                  <>
                                    <blockquote className="text-sm italic leading-relaxed pl-3 border-l-2 border-primary/40">
                                      &ldquo;{String(c.quote ?? '')}&rdquo;
                                    </blockquote>
                                    <div className="mt-2 flex items-center gap-2">
                                      <span className="text-xs font-medium">{c.author}</span>
                                      {typeof (c as Record<string, unknown>).credentials === 'string' && (
                                        <span className="text-[10px] text-muted-foreground">
                                          — {(c as Record<string, unknown>).credentials as string}
                                        </span>
                                      )}
                                    </div>
                                  </>
                                )}

                                {/* Counterargument cards */}
                                {c.type === 'counterargument' && (
                                  <>
                                    <div className="flex items-start gap-2">
                                      <p className="text-sm font-medium">
                                        {String((c as Record<string, unknown>).point ?? c.title ?? '')}
                                      </p>
                                      {typeof (c as Record<string, unknown>).strength === 'string' && (
                                        <Badge
                                          variant="outline"
                                          className={`text-[10px] shrink-0 ${
                                            ((c as Record<string, unknown>).strength as string).toLowerCase() === 'high'
                                              ? 'border-red-500/40 text-red-500'
                                              : ((c as Record<string, unknown>).strength as string).toLowerCase() === 'medium'
                                                ? 'border-yellow-500/40 text-yellow-500'
                                                : 'border-muted-foreground/40'
                                          }`}
                                        >
                                          {(c as Record<string, unknown>).strength as string} risk
                                        </Badge>
                                      )}
                                    </div>
                                    {(c as Record<string, unknown>).rebuttal && (
                                      <div className="mt-2 pl-3 border-l-2 border-green-500/30">
                                        <p className="text-[10px] font-medium text-green-600 dark:text-green-400 mb-0.5">Rebuttal</p>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                          {String((c as Record<string, unknown>).rebuttal)}
                                        </p>
                                      </div>
                                    )}
                                  </>
                                )}

                                {/* Fallback for unknown types — show all available fields */}
                                {!['source', 'statistic', 'expert_quote', 'counterargument'].includes(c.type ?? '') && (
                                  <>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {c.type && (
                                        <Badge variant="outline" className="text-[10px] capitalize">
                                          {c.type.replace(/_/g, ' ')}
                                        </Badge>
                                      )}
                                      {typeof (c as Record<string, unknown>).credibility === 'string' && (
                                        <Badge
                                          variant="secondary"
                                          className={`text-[10px] ${
                                            ((c as Record<string, unknown>).credibility as string).toLowerCase() === 'high'
                                              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                                              : ((c as Record<string, unknown>).credibility as string).toLowerCase() === 'medium'
                                                ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                                                : ''
                                          }`}
                                        >
                                          {(c as Record<string, unknown>).credibility as string}
                                        </Badge>
                                      )}
                                      {typeof (c as Record<string, unknown>).date_published === 'string' && (
                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                          <Calendar className="h-3 w-3" />
                                          {(c as Record<string, unknown>).date_published as string}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm font-medium mt-1.5">{c.title ?? c.claim ?? c.quote ?? '—'}</p>
                                    {(c as Record<string, unknown>).key_insight && (
                                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                        {String((c as Record<string, unknown>).key_insight)}
                                      </p>
                                    )}
                                    {(c as Record<string, unknown>).quote_excerpt && (
                                      <blockquote className="text-xs italic text-muted-foreground mt-2 pl-3 border-l-2 border-primary/30">
                                        &ldquo;{String((c as Record<string, unknown>).quote_excerpt)}&rdquo;
                                      </blockquote>
                                    )}
                                    {c.url && c.url !== 'N/A' && (
                                      <a
                                        href={c.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-[11px] text-primary hover:underline mt-2 inline-flex items-center gap-1"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                        {(() => {
                                          try { return new URL(c.url).hostname; } catch { return c.url.slice(0, 40); }
                                        })()}
                                      </a>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Ungrouped cards */}
                {ungrouped.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Other</h4>
                    <div className="space-y-2">
                      {ungrouped.map(({ card: c, idx: i }) => {
                        const isApproved = approved.has(i);
                        return (
                          <div
                            key={i}
                            className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                              isApproved
                                ? 'border-primary/40 bg-primary/5'
                                : 'border-border/50 opacity-50 hover:opacity-75'
                            }`}
                            onClick={() => toggleApproval(i)}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={isApproved}
                                onCheckedChange={() => toggleApproval(i)}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{c.title ?? c.claim ?? c.quote ?? '—'}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Knowledge gaps */}
          {knowledgeGaps.length > 0 && (
            <Card className="border-dashed border-muted-foreground/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Knowledge Gaps
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {knowledgeGaps.map((gap, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-muted-foreground/50 mt-0.5">•</span>
                      {gap}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={handleApprove} size="lg">
              <Check className="h-4 w-4 mr-2" /> Approve ({approved.size}){' '}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </>
      )}

      {/* Spacer if no findings or cards yet in session detail */}
      {isSessionDetail && cards.length === 0 && !findings && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            No research data yet. Run a new research or reload the page.
          </CardContent>
        </Card>
      )}

      <ManualOutputDialog
        open={!overviewMode && !!manualSessionId}
        onOpenChange={(open) => {
          if (!open) {
            setManualSessionId(null);
          }
        }}
        title="Paste research output"
        description="Copy the prompt from Axiom, run it in your AI tool, then paste the JSON output below."
        submitLabel="Import Research"
        onSubmit={handleManualOutputSubmit}
        onAbandon={handleManualAbandon}
      />

      {/* Floating progress indicator. Float UI is suppressed in overview mode
          (engine runs behind display:none; fixed portal would leak onto dashboard).
          SSE runs regardless so onComplete fires and the pipeline advances. */}
      <GenerationProgressFloat
        open={!overviewMode && !!activeGenerationId}
        sessionId={activeGenerationId ?? ''}
        sseUrl={activeGenerationId ? `/api/research-sessions/${activeGenerationId}/events` : ''}
        cancelUrl={activeGenerationId ? `/api/research-sessions/${activeGenerationId}/cancel` : undefined}
        title={`Generating research with ${model}`}
        onComplete={handleGenerationComplete}
        onFailed={handleGenerationFailed}
        onClose={() => setActiveGenerationId(null)}
      />
    </div>
  );
}
