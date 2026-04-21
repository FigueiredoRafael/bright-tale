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
import { usePipelineTracker } from '@/hooks/use-pipeline-tracker';
import { ContextBanner } from './ContextBanner';
import { ImportPicker } from './ImportPicker';
import { friendlyAiError } from '@/lib/ai/error-message';
import type { BaseEngineProps, ResearchResult } from './types';

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

interface ResearchEngineProps extends BaseEngineProps {
  initialSession?: Record<string, unknown>;
  initialCards?: Record<string, unknown>[];
  initialApproved?: number[];
}

const LEVELS: { id: Level; label: string; cost: number; description: string }[] = [
  {
    id: 'surface',
    label: 'Surface',
    cost: 60,
    description: 'Top 3 sources, basic statistics',
  },
  {
    id: 'medium',
    label: 'Medium',
    cost: 100,
    description: '5-8 sources, expert quotes, supporting data',
  },
  {
    id: 'deep',
    label: 'Deep',
    cost: 180,
    description: '10+ sources, counterarguments, cross-validation',
  },
];

const FOCUS_OPTIONS = [
  { id: 'stats', label: 'Statistics' },
  { id: 'expert_advice', label: 'Expert advice' },
  { id: 'pro_tips', label: 'Pro tips' },
  { id: 'validated_processes', label: 'Validated processes' },
];

const RESEARCH_PROVIDERS: ProviderId[] = ['gemini', 'openai', 'anthropic', 'ollama', 'manual'];

export function ResearchEngine({
  mode: engineMode,
  channelId,
  context,
  onComplete,
  onStageProgress,
  initialSession,
  initialCards,
  initialApproved,
}: ResearchEngineProps) {
  // Input mode
  const [topic, setTopic] = useState(context.ideaTitle ?? '');
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

  const tracker = usePipelineTracker('research', context);

  // When initialSession is provided, we're in "session detail" mode
  const isSessionDetail = !!initialSession;

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
    const ctxSessionId = context.researchSessionId;
    if (!ctxSessionId) return;
    if (sessionId === ctxSessionId && (cards.length > 0 || findings)) return;

    (async () => {
      try {
        const res = await fetch(`/api/research-sessions/${ctxSessionId}`);
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
      } catch {
        // silent — form stays empty, user can regenerate
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.researchSessionId]);

  // Fetch recommended agent
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agents');
        const json = await res.json();
        const agent = (json.data?.agents as Array<Record<string, unknown>>)?.find(
          (a) => a.slug === 'research'
        );
        if (agent?.recommended_provider) {
          setRecommended({
            provider: agent.recommended_provider as string,
            model: (agent.recommended_model as string) || null,
          });
          setProvider(agent.recommended_provider as ProviderId);
          if (agent.recommended_model) {
            setModel(agent.recommended_model as string);
          }
        }
      } catch {
        // silent — keep defaults
      }
    })();
  }, []);

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
        body: JSON.stringify({
          ...(channelId ? { channelId } : {}),
          ...(context.projectId ? { projectId: context.projectId } : {}),
          ...(context.ideaId ? { ideaId: context.ideaId } : {}),
          topic: topic || context.ideaTitle || undefined,
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
      toast.warning('Cards imported locally but failed to save session to database');
    }

    setCards(allCards);
    setApproved(new Set(allCards.map((_, i) => i)));
    tracker.trackAction('imported', { cardCount: allCards.length, source: 'manual' });
    toast.success(
      `${allCards.length} research cards imported (${sources.length} sources, ${stats.length} stats, ${quotes.length} quotes, ${counters.length} counterarguments)`
    );
  }

  async function handleRun() {
    if (!topic.trim()) {
      toast.error('Enter a topic');
      return;
    }

    setRunning(true);
    setCards([]);
    setApproved(new Set());

    tracker.trackStarted({ topic: topic.trim(), level, focusTags, provider, model });

    try {
      const res = await fetch('/api/research-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(channelId ? { channelId } : {}),
          ...(context.projectId ? { projectId: context.projectId } : {}),
          ...(context.ideaId ? { ideaId: context.ideaId } : {}),
          topic: topic.trim(),
          level,
          focusTags,
          provider,
          model,
        }),
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
        toast.success('Prompt copied to Axiom. Paste the output when ready.');
        return;
      }

      const generatedFindings = json?.data?.findings;
      const generatedCards = json?.data?.cards ?? [];

      setSessionId(json?.data?.sessionId || null);

      // Prefer findings if available (new format), otherwise use cards (legacy)
      if (generatedFindings && typeof generatedFindings === 'object') {
        setFindings(generatedFindings);
        tracker.trackCompleted({ sessionId: json?.data?.sessionId || '', cardCount: generatedCards.length, approvedCount: generatedCards.length, level });
        toast.success('Research completed');
      } else if (generatedCards.length > 0) {
        setCards(generatedCards);
        setApproved(new Set(generatedCards.map((_, i) => i)));
        tracker.trackCompleted({ sessionId: json?.data?.sessionId || '', cardCount: generatedCards.length, approvedCount: generatedCards.length, level });
        toast.success(`${generatedCards.length} research cards found`);
      } else {
        toast.warning('No research data recognized in output', {
          description:
            "AI responded but format didn't match. Try a different model or re-run.",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const friendly = friendlyAiError(message);
      tracker.trackFailed(message);
      toast.error(friendly.title, { description: friendly.hint });
    } finally {
      setRunning(false);
    }
  }

  async function handleRegenerate() {
    if (!sessionId) {
      toast.error('No session to regenerate');
      return;
    }

    setRegenerating(true);
    try {
      const res = await fetch(`/api/research-sessions/${sessionId}/regenerate`, {
        method: 'POST',
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
          const reloadRes = await fetch(`/api/research-sessions/${newId}`);
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
            toast.success('Regenerated successfully');
          }
        } catch {
          toast.success('Regenerated but failed to reload');
        }
      }
    } catch {
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
      toast.success('Research imported');
    } else if (newCards.length > 0) {
      setCards(newCards);
      setApproved(new Set(newCards.map((_: Card, i: number) => i)));
      tracker.trackCompleted({ sessionId: manualSessionId, cardCount: newCards.length, approvedCount: newCards.length, level });
      toast.success(`${newCards.length} research cards imported`);
    }

    setManualSessionId(null);
    onStageProgress?.({ researchSessionId: manualSessionId });
  }

  async function handleManualAbandon() {
    if (!manualSessionId) return;
    try {
      await fetch(`/api/research-sessions/${manualSessionId}/cancel`, { method: 'POST' });
    } catch {
      // silent — best-effort cancel
    }
    setManualSessionId(null);
    setCards([]);
    setSessionId(null);
    onStageProgress?.({ researchSessionId: undefined });
  }

  async function handleApprove() {
    // For new findings format, approve the whole research
    if (findings) {
      tracker.trackAction('findings.approved', { sessionId: sessionId || '' });

      const result: ResearchResult = {
        researchSessionId: sessionId || '',
        approvedCardsCount: 1,
        researchLevel: level,
      };
      onComplete(result);
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

    toast.success(`${approvedCards.length} cards approved`);
    const result: ResearchResult = {
      researchSessionId: sessionId || '',
      approvedCardsCount: approvedCards.length,
      researchLevel: level,
    };
    onComplete(result);
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
        <ContextBanner stage="research" context={context} />

        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search className="h-5 w-5" /> Research
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Import a research session to continue.
          </p>
        </div>

        <ImportPicker
          entityType="research-sessions"
          channelId={channelId}
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
            onComplete({
              researchSessionId: item.id as string,
              approvedCardsCount: cards.length,
              researchLevel: (item.level as string) ?? 'medium',
            } as ResearchResult);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ContextBanner stage="research" context={context} />

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
                {context.ideaId && (
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
                {LEVELS.map((l) => (
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
              <Button onClick={handleRun} disabled={running}>
                {running ? (
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
        open={!!manualSessionId}
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
    </div>
  );
}
