'use client';

import { useEffect, useState } from 'react';
import {
  Loader2,
  Lightbulb,
  Sparkles,
  RefreshCw,
  Check,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ModelPicker,
  MODELS_BY_PROVIDER,
  type ProviderId,
} from '@/components/ai/ModelPicker';
import { usePipelineTracker } from '@/hooks/use-pipeline-tracker';
import { ContextBanner } from './ContextBanner';
import { ImportPicker } from './ImportPicker';
import { ManualOutputDialog } from './ManualOutputDialog';
import { GenerationProgressFloat } from '@/components/generation/GenerationProgressFloat';
import { friendlyAiError } from '@/lib/ai/error-message';
import type { BaseEngineProps, BrainstormResult } from './types';

const BRAINSTORM_PROVIDERS: ProviderId[] = ['gemini', 'openai', 'anthropic', 'ollama', 'manual'];

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

  // Manual provider — open dialog when API responds with awaiting_manual
  const [manualSessionId, setManualSessionId] = useState<string | null>(null);

  // Session-level recommendation (the AI's pick + rationale across all ideas)
  const [recommendation, setRecommendation] = useState<{ pick?: string; rationale?: string } | null>(null);

  const tracker = usePipelineTracker('brainstorm', context);

  // Regenerate state
  const [regenerating, setRegenerating] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Generation progress modal
  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // When initialSession is provided, we're in "session detail" mode
  const isSessionDetail = !!initialSession;

  // localStorage key for persisting form state before a session exists
  const storageKey = channelId
    ? `brainstorm-form-${channelId}`
    : 'brainstorm-form-global';
  const [formRestored, setFormRestored] = useState(false);

  // Restore form state from localStorage on mount (only for new brainstorm, not session detail)
  useEffect(() => {
    if (initialSession) { setFormRestored(true); return; }
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const s = JSON.parse(saved) as Record<string, string>;
        if (s.mode) setMode(s.mode as Mode);
        if (s.topic) setTopic(s.topic);
        if (s.niche) setNiche(s.niche);
        if (s.tone) setTone(s.tone);
        if (s.audience) setAudience(s.audience);
        if (s.goal) setGoal(s.goal);
        if (s.constraints) setConstraints(s.constraints);
        if (s.referenceUrl) setReferenceUrl(s.referenceUrl);
      }
    } catch {
      // ignore corrupt localStorage
    }
    // Delay setting restored so the save effect waits for the re-render
    // with the restored values before it starts persisting.
    setTimeout(() => setFormRestored(true), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist form state to localStorage on change (only after restore completes)
  useEffect(() => {
    if (initialSession || !formRestored) return;
    const state = { mode, topic, niche, tone, audience, goal, constraints, referenceUrl };
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [initialSession, formRestored, storageKey, mode, topic, niche, tone, audience, goal, constraints, referenceUrl]);

  // Initialize from initial values (session detail)
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
        // Restore fine-tuning fields
        const ft = input.fineTuning as Record<string, string> | undefined;
        if (ft && typeof ft === 'object') {
          if (ft.niche) setNiche(ft.niche);
          if (ft.tone) setTone(ft.tone);
          if (ft.audience) setAudience(ft.audience);
          if (ft.goal) setGoal(ft.goal);
          if (ft.constraints) setConstraints(ft.constraints);
        }
        if (input.referenceUrl) setReferenceUrl(input.referenceUrl as string);
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

  // Load existing session from context when navigating back in the pipeline
  useEffect(() => {
    if (initialSession || initialIdeas) return;
    const ctxSessionId = context.brainstormSessionId;
    if (!ctxSessionId) return;

    // Already loaded this session
    if (sessionId === ctxSessionId && ideas.length > 0) return;

    (async () => {
      try {
        // Fetch session details (restores form fields)
        const sessRes = await fetch(`/api/brainstorm/sessions/${ctxSessionId}`);
        const sessJson = await sessRes.json();
        const sess = sessJson.data?.session ?? sessJson.data;
        if (sess) {
          setSessionId(sess.id as string);
          // If the session is awaiting manual output, reopen the modal
          if (sess.status === 'awaiting_manual') {
            setManualSessionId(sess.id as string);
            return;
          }
          if (sess.recommendation_json && typeof sess.recommendation_json === 'object') {
            setRecommendation(sess.recommendation_json as { pick?: string; rationale?: string });
          }
          if (sess.input_json && typeof sess.input_json === 'object') {
            const input = sess.input_json as Record<string, unknown>;
            if (input.topic) setTopic(input.topic as string);
            if (input.inputMode) setMode(input.inputMode as Mode);
            const ft = input.fineTuning as Record<string, string> | undefined;
            if (ft && typeof ft === 'object') {
              if (ft.niche) setNiche(ft.niche);
              if (ft.tone) setTone(ft.tone);
              if (ft.audience) setAudience(ft.audience);
              if (ft.goal) setGoal(ft.goal);
              if (ft.constraints) setConstraints(ft.constraints);
            }
            if (input.referenceUrl) setReferenceUrl(input.referenceUrl as string);
          }
        }

        // Load ideas from session response (idea_archives) or fall back to drafts
        const ideasRaw = (sessJson.data?.ideas ?? []) as Array<Record<string, unknown>>;
        let drafts = ideasRaw;
        if (drafts.length === 0) {
          // Fallback: try staged drafts
          const draftsRes = await fetch(`/api/brainstorm/sessions/${ctxSessionId}/drafts`);
          const draftsJson = await draftsRes.json();
          drafts = (draftsJson.data?.drafts ?? []) as Array<Record<string, unknown>>;
        }
        if (drafts.length > 0) {
          const mapped: Idea[] = drafts.map((d) => {
            let verdict: 'viable' | 'weak' | 'experimental' = 'experimental';
            const v = d.verdict as string;
            if (v === 'viable' || v === 'weak' || v === 'experimental') verdict = v;
            return {
              id: d.id as string,
              idea_id: (d.id as string) ?? `draft-${d.position}`,
              title: d.title as string,
              core_tension: (d.core_tension as string) || undefined,
              target_audience: (d.target_audience as string) || '',
              verdict,
              discovery_data: d.discovery_data as string | undefined,
            };
          });
          setIdeas(mapped);
          if (context.ideaId) {
            setSelectedIdeaId(context.ideaId);
          }
        }
      } catch {
        // silent — form stays empty, user can regenerate
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.brainstormSessionId]);

  // Reconnect to running session after page reload
  useEffect(() => {
    if (initialSession || activeGenerationId) return;
    (async () => {
      try {
        const url = channelId
          ? `/api/brainstorm/sessions/running?channelId=${channelId}`
          : '/api/brainstorm/sessions/running';
        const res = await fetch(url);
        const json = await res.json();
        const session = json.data?.session;
        if (session?.id && session.status === 'running') {
          // Only reconnect if session is less than 20 minutes old
          const ageMs = Date.now() - new Date(session.created_at).getTime();
          if (ageMs > 20 * 60 * 1000) return;
          setSessionId(session.id);
          setActiveGenerationId(session.id);
          setIsReconnecting(true);
          setRunning(true);
        }
      } catch {
        // silent — no running session
      }
    })();
  }, [initialSession, channelId, activeGenerationId]);

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

    try {
      const body: Record<string, unknown> = {
        ...(channelId ? { channelId } : {}),
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

      tracker.trackStarted({
        topic,
        mode,
        provider,
        model,
        fineTuning: mode === 'fine_tuned' ? { niche, tone, audience, goal, constraints } : undefined,
        referenceUrl: mode === 'reference_guided' ? referenceUrl : undefined,
      });

      const res = await fetch('/api/brainstorm/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      let json: {
        data?: { sessionId?: string; status?: string };
        error?: { message?: string; code?: string };
      } | null = null;
      try {
        json = await res.json();
      } catch {
        toast.error(`Server returned ${res.status} without JSON`);
        setRunning(false);
        return;
      }

      if (json?.error) {
        const friendly = friendlyAiError(json.error.message ?? '');
        toast.error(friendly.title, { description: friendly.hint });
        setRunning(false);
        return;
      }

      const newSessionId = json?.data?.sessionId;
      if (!newSessionId) {
        toast.error('No session ID returned');
        setRunning(false);
        return;
      }

      setSessionId(newSessionId);
      // Manual provider: API short-circuited, no SSE stream — open the paste-output modal.
      if (json?.data?.status === 'awaiting_manual') {
        setManualSessionId(newSessionId);
        setRunning(false);
        localStorage.removeItem(storageKey);
        return;
      }
      setActiveGenerationId(newSessionId);
      // Clear persisted form state after successful submission
      localStorage.removeItem(storageKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const friendly = friendlyAiError(message);
      toast.error(friendly.title, { description: friendly.hint });
      setRunning(false);
    }
  }

  async function handleGenerationComplete() {
    setActiveGenerationId(null);
    if (!sessionId) {
      setRunning(false);
      return;
    }

    try {
      const res = await fetch(`/api/brainstorm/sessions/${sessionId}/drafts`);
      const json = await res.json();
      const drafts = (json.data?.drafts ?? []) as Array<Record<string, unknown>>;

      const mapped: Idea[] = drafts.map((d) => {
        let verdict: 'viable' | 'weak' | 'experimental' = 'experimental';
        const v = d.verdict as string;
        if (v === 'viable' || v === 'weak' || v === 'experimental') verdict = v;
        return {
          id: d.id as string,
          idea_id: (d.id as string) ?? `draft-${d.position}`,
          title: d.title as string,
          core_tension: (d.core_tension as string) || undefined,
          target_audience: (d.target_audience as string) || '',
          verdict,
          discovery_data: d.discovery_data as string | undefined,
        };
      });

      setIdeas(mapped);
      tracker.trackCompleted({
        sessionId: sessionId || undefined,
        ideaCount: mapped.length,
        ideas: mapped,
      });
      if (mapped.length === 0) {
        toast.warning('No ideas recognized in output', {
          description: "AI responded but format didn't match. Try a different model or re-run.",
        });
      } else {
        toast.success(`${mapped.length} ideas generated`);
      }
    } catch {
      toast.error('Failed to load generated ideas');
    } finally {
      setRunning(false);
    }
  }

  function handleGenerationFailed(message: string) {
    setActiveGenerationId(null);
    setRunning(false);
    tracker.trackFailed(message);
    const friendly = friendlyAiError(message);
    toast.error(friendly.title, { description: friendly.hint });
  }

  async function handleManualOutputSubmit(parsed: unknown) {
    if (!manualSessionId) return;
    const res = await fetch(`/api/brainstorm/sessions/${manualSessionId}/manual-output`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output: parsed }),
    });
    const json = await res.json();
    if (json.error) {
      toast.error(json.error.message ?? 'Failed to submit output');
      return;
    }
    const rows = (json.data?.ideas ?? []) as Array<Record<string, unknown>>;
    const newIdeas: Idea[] = rows.map((d) => {
      let verdict: 'viable' | 'weak' | 'experimental' = 'experimental';
      const v = d.verdict as string;
      if (v === 'viable' || v === 'weak' || v === 'experimental') verdict = v;
      return {
        id: d.id as string,
        idea_id: d.idea_id as string,
        title: d.title as string,
        core_tension: (d.core_tension as string) || undefined,
        target_audience: (d.target_audience as string) || '',
        verdict,
        discovery_data: d.discovery_data as string | undefined,
      };
    });
    setIdeas(newIdeas);
    setSessionId(manualSessionId);
    if (json.data?.recommendation && typeof json.data.recommendation === 'object') {
      setRecommendation(json.data.recommendation as { pick?: string; rationale?: string });
    }
    setManualSessionId(null);
    tracker.trackCompleted({
      sessionId: manualSessionId,
      ideaCount: newIdeas.length,
      ideas: newIdeas,
    });
    toast.success(`${newIdeas.length} ideas saved`);
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
            tracker.trackAction('regenerated', {
              sessionId: newId,
              previousIdeaCount: ideas.length,
            });
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

    tracker.trackAction('idea.selected', {
      ideaId: result.ideaId,
      ideaTitle: result.ideaTitle,
      verdict: result.ideaVerdict,
      coreTension: result.ideaCoreTension,
    });

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
            tracker.trackAction('imported', {
              ideaCount: 1,
              source: 'library',
            });
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

            <div className="space-y-4 mt-3">
              <ModelPicker
                provider={provider}
                model={model}
                recommended={recommended}
                providers={BRAINSTORM_PROVIDERS}
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
            </div>
          </CardContent>
        </Card>
      )}

      <ManualOutputDialog
        open={!!manualSessionId}
        onOpenChange={(open) => { if (!open) setManualSessionId(null); }}
        onSubmit={handleManualOutputSubmit}
        title="Paste brainstorm output"
        description="Retrieve the prompt from Axiom, run it in an external AI, then paste the full BC_BRAINSTORM_OUTPUT JSON below."
        submitLabel="Save ideas"
      />


      {/* Floating progress indicator — non-blocking, bottom-right */}
      <GenerationProgressFloat
        open={!!activeGenerationId}
        sessionId={activeGenerationId ?? ''}
        sseUrl={activeGenerationId ? `/api/brainstorm/sessions/${activeGenerationId}/events` : ''}
        cancelUrl={activeGenerationId ? `/api/brainstorm/sessions/${activeGenerationId}/cancel` : undefined}
        title={`Generating with ${model}`}
        reconnecting={isReconnecting}
        onComplete={() => {
          setIsReconnecting(false);
          handleGenerationComplete();
        }}
        onFailed={(msg) => {
          setIsReconnecting(false);
          handleGenerationFailed(msg);
        }}
        onClose={() => {
          setActiveGenerationId(null);
          setIsReconnecting(false);
          setRunning(false);
        }}
      />

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
            {recommendation && (recommendation.pick || recommendation.rationale) && (
              <div className="mt-3 p-3 rounded-md border border-primary/30 bg-primary/5">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                  <div className="text-xs">
                    {recommendation.pick && (
                      <div className="font-medium text-primary">
                        Recommended: {recommendation.pick}
                      </div>
                    )}
                    {recommendation.rationale && (
                      <div className="text-muted-foreground mt-1">
                        {recommendation.rationale}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {ideas.map((idea) => {
              let extra: {
                angle?: string;
                monetization?: string;
                repurposing?: string[];
                risk_flags?: string[];
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
                      {extra.risk_flags && extra.risk_flags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {extra.risk_flags.map((r) => (
                            <Badge
                              key={r}
                              variant="destructive"
                              className="text-[10px] font-normal"
                            >
                              ⚠ {r}
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
