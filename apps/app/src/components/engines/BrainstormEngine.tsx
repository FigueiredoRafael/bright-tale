'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Loader2,
  Lightbulb,
  Sparkles,
  RefreshCw,
  Check,
  ClipboardPaste,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ModelPicker,
  MODELS_BY_PROVIDER,
  type ProviderId,
} from '@/components/ai/ModelPicker';
import { ManualModePanel } from '@/components/ai/ManualModePanel';
import { useManualMode } from '@/hooks/use-manual-mode';
import { ContextBanner } from './ContextBanner';
import { ImportPicker } from './ImportPicker';
import { friendlyAiError } from '@/lib/ai/error-message';
import type { BaseEngineProps, BrainstormResult } from './types';

type Mode = 'blind' | 'fine_tuned' | 'reference_guided';

interface Idea {
  id?: string;
  idea_id: string;
  title: string;
  core_tension?: string;
  target_audience: string;
  verdict: 'viable' | 'weak' | 'experimental';
  discovery_data?: string;
}

interface BrainstormEngineProps extends BaseEngineProps {
  initialSession?: Record<string, unknown>;
  initialIdeas?: Record<string, unknown>[];
  preSelectedIdeaId?: string;
}

const MODES: { id: Mode; label: string; description: string }[] = [
  {
    id: 'blind',
    label: 'Blind prompt',
    description: 'Just a topic. AI generates broad ideas from the channel niche.',
  },
  {
    id: 'fine_tuned',
    label: 'Fine-tuning',
    description:
      'Topic + niche, tone, audience, goal and constraints. More focused.',
  },
  {
    id: 'reference_guided',
    label: 'Reference-guided',
    description: 'URL of existing content (blog/YouTube). AI models from it.',
  },
];

export function BrainstormEngine({
  mode: engineMode,
  channelId,
  context,
  onComplete,
  initialSession,
  initialIdeas,
  preSelectedIdeaId,
}: BrainstormEngineProps) {
  // Input mode
  const [mode, setMode] = useState<Mode>('blind');
  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [model, setModel] = useState<string>('gemini-2.5-flash');
  const [recommended, setRecommended] = useState<{
    provider: string | null;
    model: string | null;
  }>({ provider: null, model: null });
  const [topic, setTopic] = useState('');
  const [niche, setNiche] = useState('');
  const [tone, setTone] = useState('');
  const [audience, setAudience] = useState('');
  const [goal, setGoal] = useState('');
  const [constraints, setConstraints] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');

  // Generation state
  const [running, setRunning] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Manual mode
  const [generationMode, setGenerationMode] = useState<'ai' | 'manual'>('ai');
  const { enabled: manualEnabled } = useManualMode();

  // Regenerate state
  const [regenerating, setRegenerating] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // When initialSession is provided, we're in "session detail" mode
  const isSessionDetail = !!initialSession;

  // Initialize from initial values
  useEffect(() => {
    if (initialSession && typeof initialSession === 'object') {
      const sess = initialSession as Record<string, unknown>;
      setSessionId(sess.id as string);
      if (sess.input_json && typeof sess.input_json === 'object') {
        const input = sess.input_json as Record<string, unknown>;
        setTopic((input.topic as string) || '');
        if (input.inputMode) {
          setMode(input.inputMode as Mode);
        }
      }
    }
    if (initialIdeas && Array.isArray(initialIdeas)) {
      const mapped = initialIdeas.map((idea: unknown) => {
        const i = idea as Record<string, unknown>;
        let verdict: 'viable' | 'weak' | 'experimental' = 'experimental';
        const v = i.verdict as string;
        if (v === 'viable' || v === 'weak' || v === 'experimental') {
          verdict = v;
        }
        return {
          id: i.id as string,
          idea_id: i.idea_id as string,
          title: i.title as string,
          core_tension: i.core_tension as string | undefined,
          target_audience: (i.target_audience as string) || '',
          verdict,
          discovery_data: i.discovery_data as string | undefined,
        };
      });
      setIdeas(mapped);
      if (preSelectedIdeaId) {
        setSelectedIdeaId(preSelectedIdeaId);
      }
    }
  }, [initialSession, initialIdeas, preSelectedIdeaId]);

  // Fetch recommended agent
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agents');
        const json = await res.json();
        const agent = (json.data?.agents as Array<Record<string, unknown>>)?.find(
          (a) => a.slug === 'brainstorm'
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

  async function handleRun() {
    if (mode !== 'reference_guided' && !topic.trim()) {
      toast.error('Enter a topic');
      return;
    }
    if (mode === 'reference_guided' && !referenceUrl.trim()) {
      toast.error('Paste the reference URL');
      return;
    }

    setRunning(true);
    setIdeas([]);
    setSelectedIdeaId(null);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

    try {
      const body: Record<string, unknown> = {
        channelId,
        inputMode: mode,
        provider,
        model,
        topic: topic.trim() || undefined,
      };
      if (mode === 'fine_tuned') {
        body.fineTuning = { niche, tone, audience, goal, constraints };
      }
      if (mode === 'reference_guided') {
        body.referenceUrl = referenceUrl.trim();
      }

      const res = await fetch('/api/brainstorm/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      let json: {
        data?: { sessionId?: string; ideas?: Idea[] };
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

      const generatedIdeas = json?.data?.ideas ?? [];
      setIdeas(generatedIdeas);
      setSessionId(json?.data?.sessionId || null);

      if (generatedIdeas.length === 0) {
        toast.warning('No ideas recognized in output', {
          description:
            "AI responded but format didn't match. Try a different model or re-run.",
        });
      } else {
        toast.success(`${generatedIdeas.length} ideas generated`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const friendly = friendlyAiError(message);
      toast.error(friendly.title, { description: friendly.hint });
    } finally {
      setRunning(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }

  async function handleManualImport(parsed: unknown) {
    function findIdeas(
      node: unknown,
      depth = 0
    ): Array<Record<string, unknown>> {
      if (depth > 5) return [];
      if (
        Array.isArray(node) &&
        node.length > 0 &&
        node[0] &&
        typeof node[0] === 'object' &&
        'title' in (node[0] as object)
      ) {
        return node as Array<Record<string, unknown>>;
      }
      if (node && typeof node === 'object' && !Array.isArray(node)) {
        for (const v of Object.values(node as Record<string, unknown>)) {
          const found = findIdeas(v, depth + 1);
          if (found.length > 0) return found;
        }
      }
      return [];
    }

    const rawIdeas = findIdeas(parsed);

    if (rawIdeas.length === 0) {
      toast.error(
        "No ideas found in pasted output. Expected an array with objects containing 'title'."
      );
      return;
    }

    const saved: Idea[] = [];
    const errors: string[] = [];

    for (const idea of rawIdeas) {
      try {
        const title = String(idea.title ?? '').trim();
        if (title.length < 5) {
          errors.push(`"${title || '(empty)'}" — title too short (min 5 chars)`);
          continue;
        }

        const res = await fetch('/api/ideas/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            core_tension: String(idea.core_tension ?? ''),
            target_audience: String(idea.target_audience ?? ''),
            verdict: ['viable', 'experimental', 'weak'].includes(
              String(idea.verdict ?? '')
            )
              ? idea.verdict
              : 'experimental',
            source_type: 'manual',
            channel_id: channelId,
            tags: Array.isArray(idea.tags) ? idea.tags : [],
          }),
        });

        const json = await res.json();
        if (json.error) {
          errors.push(`"${title}" — ${json.error.message}`);
          continue;
        }

        if (json.data?.idea) {
          const ideaData = json.data.idea as Record<string, unknown>;
          let verdict: 'viable' | 'weak' | 'experimental' = 'experimental';
          const v = ideaData.verdict as string;
          if (v === 'viable' || v === 'weak' || v === 'experimental') {
            verdict = v;
          }
          saved.push({
            id: ideaData.id as string,
            idea_id: ideaData.idea_id as string,
            title: ideaData.title as string,
            core_tension: undefined,
            target_audience: (ideaData.target_audience as string) || '',
            verdict,
            discovery_data: JSON.stringify({
              monetization: idea.monetization,
              repurposing: idea.repurposing,
            }),
          });
        }
      } catch (err) {
        errors.push(
          `"${idea.title ?? '?'}" — ${err instanceof Error ? err.message : 'unknown error'}`
        );
      }
    }

    if (saved.length > 0) {
      setIdeas(saved);
      toast.success(`${saved.length} of ${rawIdeas.length} ideas saved`);
    }
    if (errors.length > 0) {
      toast.error(`${errors.length} failed`, {
        description: errors.slice(0, 3).join('\n'),
      });
    }
    if (saved.length === 0 && errors.length === 0) {
      toast.error('No ideas found in pasted output');
    }
  }

  async function handleRegenerate() {
    if (!sessionId) {
      toast.error('No session to regenerate');
      return;
    }

    setRegenerating(true);
    try {
      const res = await fetch(
        `/api/brainstorm/sessions/${sessionId}/regenerate`,
        { method: 'POST' }
      );
      const json = await res.json();
      if (json.error) {
        toast.error(json.error.message);
        return;
      }

      const newId = (json.data?.sessionId ||
        json.data?.session?.id) as string | undefined;
      if (newId) {
        setSessionId(newId);
        // Reload ideas from new session
        try {
          const reloadRes = await fetch(`/api/brainstorm/sessions/${newId}`);
          const reloadJson = await reloadRes.json();
          if (reloadJson.data) {
            setIdeas(reloadJson.data.ideas ?? []);
            setSelectedIdeaId(null);
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

  function handleComplete() {
    const selectedIdea = ideas.find(
      (i) => (i.id ?? i.idea_id) === selectedIdeaId
    );
    if (!selectedIdea) return;

    const result: BrainstormResult = {
      ideaId: selectedIdea.id ?? selectedIdea.idea_id,
      ideaTitle: selectedIdea.title,
      ideaVerdict: selectedIdea.verdict,
      ideaCoreTension: selectedIdea.core_tension || '',
      brainstormSessionId: sessionId || undefined,
    };

    onComplete(result);
  }

  const selectedIdea = ideas.find(
    (i) => (i.id ?? i.idea_id) === selectedIdeaId
  );
  const topic_display = isSessionDetail && initialSession
    ? ((initialSession as Record<string, unknown>).input_json as Record<string, unknown>)?.topic as string
    : topic;

  // Import mode: show ImportPicker when mode='import' and no initial session
  if (engineMode === 'import' && !initialSession) {
    return (
      <div className="space-y-6">
        <ContextBanner stage="brainstorm" context={context} />

        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lightbulb className="h-5 w-5" /> Brainstorm
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Import an idea from your library to continue.
          </p>
        </div>

        <ImportPicker
          entityType="ideas"
          channelId={channelId}
          searchPlaceholder="Search ideas..."
          emptyMessage="No ideas in library yet"
          renderItem={(item: Record<string, unknown>): React.ReactNode => {
            const verdict = item.verdict as string;
            const title = item.title as string;
            const coreTension = item.core_tension as string | undefined;

            return (
              <div className="p-3 rounded-lg border hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-2">
                  <Badge variant={verdict === 'viable' ? 'default' : verdict === 'weak' ? 'destructive' : 'secondary'} className="text-[10px]">
                    {verdict}
                  </Badge>
                  <span className="text-sm font-medium">{title}</span>
                </div>
                {coreTension && <p className="text-xs text-muted-foreground mt-1">{coreTension}</p>}
              </div>
            );
          }}
          onSelect={(item) => {
            onComplete({
              ideaId: (item.id ?? item.idea_id) as string,
              ideaTitle: item.title as string,
              ideaVerdict: (item.verdict as string) ?? 'experimental',
              ideaCoreTension: (item.core_tension as string) ?? '',
            } as BrainstormResult);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ContextBanner stage="brainstorm" context={context} />

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Lightbulb className="h-5 w-5" /> Brainstorm
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isSessionDetail
            ? `Session: ${topic_display || 'Untitled'} · ${ideas.length} ideas`
            : 'Generate ideas for this channel using AI. Each brainstorm costs 50 credits.'}
        </p>
      </div>

      {/* Show form only if not in session detail mode */}
      {!isSessionDetail && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Input mode</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    mode === m.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="font-medium text-sm">{m.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {m.description}
                  </div>
                </button>
              ))}
            </div>

            {mode !== 'reference_guided' && (
              <div className="space-y-2">
                <Label>Topic</Label>
                <Input
                  placeholder="e.g. produtividade pra desenvolvedores"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            {mode === 'fine_tuned' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Niche</Label>
                  <Input
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    placeholder="tech / educação"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tone</Label>
                  <Input
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    placeholder="técnico / casual"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Audience</Label>
                  <Input
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="devs sênior"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Goal</Label>
                  <Input
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="educar / engajar"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Constraints</Label>
                  <Textarea
                    value={constraints}
                    onChange={(e) => setConstraints(e.target.value)}
                    placeholder="avoid X, always include Y…"
                    rows={2}
                  />
                </div>
              </div>
            )}

            {mode === 'reference_guided' && (
              <div className="space-y-2">
                <Label>Reference URL</Label>
                <Input
                  placeholder="https://youtube.com/watch?v=… ou https://blog.com/post"
                  value={referenceUrl}
                  onChange={(e) => setReferenceUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  AI extracts context from this content and generates variations
                  aligned with your channel.
                </p>
              </div>
            )}

            <Tabs
              value={generationMode}
              onValueChange={(v) => setGenerationMode(v as 'ai' | 'manual')}
              className="mt-2"
            >
              <TabsList>
                <TabsTrigger value="ai" className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> AI Generation
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
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" /> Generate ideas
                    </>
                  )}
                </Button>
              </TabsContent>

              {manualEnabled && (
                <TabsContent value="manual" className="mt-3">
                  <ManualModePanel
                    agentSlug="brainstorm"
                    inputContext={[
                      `Topic: ${topic || '(enter topic above)'}`,
                      mode === 'fine_tuned' && niche ? `Niche: ${niche}` : '',
                      mode === 'fine_tuned' && tone ? `Tone: ${tone}` : '',
                      mode === 'fine_tuned' && audience
                        ? `Audience: ${audience}`
                        : '',
                      mode === 'fine_tuned' && goal ? `Goal: ${goal}` : '',
                      mode === 'fine_tuned' && constraints
                        ? `Constraints: ${constraints}`
                        : '',
                    ]
                      .filter(Boolean)
                      .join('\n')}
                    pastePlaceholder={
                      'Paste JSON:\n{"ideas":[{"title":"...","core_tension":"...","target_audience":"...","verdict":"viable"}]}'
                    }
                    onImport={handleManualImport}
                    importLabel="Import Ideas"
                    loading={running}
                  />
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Progress Panel */}
      {running && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">
                  Generating ideas with {model}...
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {provider}
                </Badge>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {elapsed}s
                </span>
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full animate-pulse"
                style={{ width: '60%' }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ideas Selection */}
      {!running && ideas.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">
                  {isSessionDetail ? 'Ideas' : 'Ideias geradas'}
                </CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {ideas.length}
                </Badge>
              </div>
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
            <p className="text-xs text-muted-foreground font-normal mt-2">
              Select one to continue to Research
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {ideas.map((idea) => {
              let extra: {
                angle?: string;
                monetization?: string;
                repurposing?: string[];
              } = {};
              try {
                if (idea.discovery_data) {
                  extra = JSON.parse(idea.discovery_data);
                }
              } catch {
                // ignore
              }

              const ideaKey = idea.id ?? idea.idea_id;
              const isSelected = selectedIdeaId === ideaKey;
              const isPreSelected = preSelectedIdeaId === ideaKey;

              return (
                <button
                  key={idea.idea_id}
                  onClick={() => setSelectedIdeaId(ideaKey)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-5 w-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${
                        isSelected
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/30'
                      }`}
                    >
                      {isSelected && (
                        <svg
                          className="h-3 w-3 text-primary-foreground"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                    <Badge
                      variant={
                        idea.verdict === 'viable'
                          ? 'default'
                          : idea.verdict === 'weak'
                            ? 'destructive'
                            : 'secondary'
                      }
                      className="text-[10px] shrink-0"
                    >
                      {idea.verdict}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm flex items-center gap-2">
                        {idea.title}
                        {isPreSelected && (
                          <Badge
                            variant="outline"
                            className="text-[9px] border-green-500/50 text-green-600 dark:text-green-400 gap-0.5"
                          >
                            <Check className="h-2.5 w-2.5" /> Selected
                          </Badge>
                        )}
                      </div>
                      {idea.core_tension && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {idea.core_tension}
                        </div>
                      )}
                      {idea.target_audience && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          For: {idea.target_audience}
                        </div>
                      )}
                      {extra.angle && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Ângulo: {extra.angle}
                        </div>
                      )}
                      {extra.repurposing && extra.repurposing.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {extra.repurposing.map((r) => (
                            <Badge
                              key={r}
                              variant="outline"
                              className="text-[10px]"
                            >
                              {r}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Sticky Footer */}
      {selectedIdea && !running && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-50">
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Badge
                variant={
                  selectedIdea.verdict === 'viable'
                    ? 'default'
                    : selectedIdea.verdict === 'weak'
                      ? 'destructive'
                      : 'secondary'
                }
                className="text-[10px] shrink-0"
              >
                {selectedIdea.verdict}
              </Badge>
              <span className="text-sm font-medium truncate">
                {selectedIdea.title}
              </span>
            </div>
            <Button
              onClick={handleComplete}
              className="shrink-0 gap-2"
            >
              Next: Research <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Spacer for sticky footer */}
      {selectedIdea && !running && <div className="h-16" />}
    </div>
  );
}
