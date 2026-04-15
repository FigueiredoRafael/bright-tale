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
import { ManualModePanel } from '@/components/ai/ManualModePanel';
import { useManualMode } from '@/hooks/use-manual-mode';
import { ContextBanner } from './ContextBanner';
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

export function ResearchEngine({
  mode: engineMode,
  channelId,
  context,
  onComplete,
  initialSession,
  initialCards,
  initialApproved,
}: ResearchEngineProps) {
  // Input mode
  const [topic, setTopic] = useState('');
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
  const [genMode, setGenMode] = useState<'ai' | 'manual'>('ai');
  const [refinedAngle, setRefinedAngle] = useState<Record<string, unknown> | null>(null);

  // Manual mode
  const { enabled: manualEnabled } = useManualMode();

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
    }
    if (initialCards && Array.isArray(initialCards)) {
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

    setCards(allCards);
    setApproved(new Set(allCards.map((_, i) => i)));
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

    try {
      const res = await fetch('/api/research-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          projectId: context.projectId,
          ideaId: context.ideaId,
          topic: topic.trim(),
          level,
          focusTags,
          provider,
          model,
        }),
      });

      let json: {
        data?: { sessionId?: string; cards?: Card[] };
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
        toast.error(friendly.title, { description: friendly.hint });
        return;
      }

      const generatedCards = json?.data?.cards ?? [];
      setCards(generatedCards);
      setSessionId(json?.data?.sessionId || null);
      setApproved(new Set(generatedCards.map((_, i) => i)));

      if (generatedCards.length === 0) {
        toast.warning('No research cards recognized in output', {
          description:
            "AI responded but format didn't match. Try a different model or re-run.",
        });
      } else {
        toast.success(`${generatedCards.length} research cards found`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const friendly = friendlyAiError(message);
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
            const newCards = (sess.approved_cards_json ?? sess.cards_json ?? []) as Card[];
            setCards(newCards);
            setApproved(new Set(newCards.map((_, i) => i)));
            if (sess.refined_angle_json && typeof sess.refined_angle_json === 'object') {
              setRefinedAngle(sess.refined_angle_json as Record<string, unknown>);
            }
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

  async function handleApprove() {
    const approvedCards = cards.filter((_, i) => approved.has(i));

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

            <Tabs
              value={genMode}
              onValueChange={(v) => setGenMode(v as 'ai' | 'manual')}
              className="mt-2"
            >
              <TabsList>
                <TabsTrigger value="ai" className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> AI Research
                </TabsTrigger>
                {manualEnabled && (
                  <TabsTrigger value="manual" className="gap-1.5">
                    <ClipboardPaste className="h-3.5 w-3.5" /> Manual
                    (ChatGPT/Gemini)
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="ai" className="space-y-4 mt-3">
                <ModelPicker
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
              </TabsContent>

              {manualEnabled && (
                <TabsContent value="manual" className="mt-3">
                  <ManualModePanel
                    agentSlug="research"
                    inputContext={[
                      context.ideaTitle
                        ? `Selected Idea: ${context.ideaTitle}`
                        : `Topic: ${topic || '(enter topic above)'}`,
                      context.ideaTitle && context.ideaCoreTension
                        ? `Core Tension: ${context.ideaCoreTension}`
                        : '',
                      `Depth: ${level}`,
                      `Research Focus: ${focusTags.join(', ') || 'general'}`,
                      '',
                      'Output must follow BC_RESEARCH_OUTPUT schema with:',
                      'idea_validation, sources[], statistics[], expert_quotes[], counterarguments[], knowledge_gaps[], research_summary, refined_angle',
                    ]
                      .filter(Boolean)
                      .join('\n')}
                    pastePlaceholder={
                      'Paste JSON matching BC_RESEARCH_OUTPUT:\n{"idea_validation":{...},"sources":[...],"statistics":[...],"expert_quotes":[...],"counterarguments":[...],"research_summary":"...","refined_angle":{...}}'
                    }
                    onImport={handleManualResearchImport}
                    importLabel="Import Research"
                    loading={running}
                  />
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Pivot recommendation */}
      {shouldPivot && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
              Pivot recommended
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {String(refinedAngle?.updated_title ?? '')}
            </p>
          </div>
        </div>
      )}

      {/* Research cards */}
      {cards.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Research cards</CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {cards.length}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-normal">
                  {approved.size} approved
                </span>
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
          </CardHeader>
          <CardContent className="space-y-2">
            {cards.map((c, i) => {
              const isApproved = approved.has(i);
              return (
                <div
                  key={i}
                  className={`p-3 rounded-lg border ${
                    isApproved
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isApproved}
                      onCheckedChange={() => toggleApproval(i)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {c.type && (
                          <Badge variant="outline" className="text-[10px]">
                            {c.type}
                          </Badge>
                        )}
                        {typeof c.relevance === 'number' && (
                          <Badge variant="secondary" className="text-[10px]">
                            relevance {c.relevance}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm font-medium mt-1">
                        {c.title ?? c.claim ?? c.quote ?? '—'}
                      </div>
                      {c.author && (
                        <div className="text-xs text-muted-foreground mt-1">
                          — {c.author}
                        </div>
                      )}
                      {c.url && (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary hover:underline mt-1 inline-block"
                        >
                          {c.url}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="flex justify-end pt-2">
              <Button onClick={handleApprove}>
                <Check className="h-4 w-4 mr-2" /> Approve ({approved.size}){' '}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Spacer if no cards yet in session detail */}
      {isSessionDetail && cards.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            No research cards yet. Run a new research or reload the page.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
