'use client';

import { useEffect, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { usePipelineActor } from '@/hooks/usePipelineActor';
import { useAutoPilotTrigger } from '@/hooks/use-auto-pilot-trigger';
import {
  Loader2,
  Lightbulb,
  Sparkles,
  FolderOpen,
  RefreshCw,
  Check,
  ArrowRight,
  Target,
  Users,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ModelPicker,
  MODELS_BY_PROVIDER,
  type ProviderId,
} from '@/components/ai/ModelPicker';
import { usePipelineTracker } from '@/hooks/use-pipeline-tracker';
import { ContextBanner } from './ContextBanner';
import { ImportPicker } from './ImportPicker';
import { ContentWarningBanner } from './ContentWarningBanner';
import { ManualOutputDialog } from './ManualOutputDialog';
import { IdeaDetailsDialog } from './IdeaDetailsDialog';
import { GenerationProgressFloat } from '@/components/generation/GenerationProgressFloat';
import { friendlyAiError } from '@/lib/ai/error-message';
import { usePipelineAbort } from '@/components/pipeline/PipelineAbortProvider';
import { hydrateBrainstormFromConfig } from '@/lib/pipeline/hydrateEngineFromConfig';
import type { BrainstormResult, PipelineContext } from './types';

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

interface BrainstormEngineProps {
  mode?: 'generate' | 'import';
  onModeChange?: (m: 'generate' | 'import') => void;
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
  mode: engineMode = 'generate',
  onModeChange,
  initialSession,
  initialIdeas,
  preSelectedIdeaId,
}: BrainstormEngineProps) {
  const actor = usePipelineActor();
  const abortController = usePipelineAbort();
  const channelId = useSelector(actor, (s) => s.context.channelId);
  const projectId = useSelector(actor, (s) => s.context.projectId);
  const brainstormResult = useSelector(actor, (s) => s.context.stageResults.brainstorm);

  // Build a legacy PipelineContext for usePipelineTracker and ContextBanner
  // (both still expect this shape; brainstorm ContextBanner returns null anyway).
  const trackerContext: PipelineContext = {
    channelId: channelId ?? undefined,
    projectId,
    brainstormSessionId: brainstormResult?.brainstormSessionId,
    ideaId: brainstormResult?.ideaId,
    ideaTitle: brainstormResult?.ideaTitle,
    ideaVerdict: brainstormResult?.ideaVerdict,
    ideaCoreTension: brainstormResult?.ideaCoreTension,
  };
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
  const [recommendation, setRecommendation] = useState<{ pick?: string; rationale?: string; content_warning?: string } | null>(null);
  const [detailsIdeaId, setDetailsIdeaId] = useState<string | null>(null);

  const tracker = usePipelineTracker('brainstorm', trackerContext);

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

  // Hydrate from autopilotConfig once on mount. Runs BEFORE the localStorage
  // restore so wizard inputs take precedence over stale localStorage state
  // for fresh autopilot runs. localStorage restore won't fire for fresh
  // autopilot because initialSession is undefined.
  const autopilotConfig = useSelector(actor, (s) => s.context.autopilotConfig);
  useEffect(() => {
    const hydration = hydrateBrainstormFromConfig(autopilotConfig);
    if (Object.keys(hydration).length === 0) return;
    if (hydration.mode !== undefined) setMode(hydration.mode === 'topic_driven' ? 'fine_tuned' : 'reference_guided');
    if (hydration.topic !== undefined) setTopic(hydration.topic);
    if (hydration.niche !== undefined) setNiche(hydration.niche);
    if (hydration.tone !== undefined) setTone(hydration.tone);
    if (hydration.audience !== undefined) setAudience(hydration.audience);
    if (hydration.goal !== undefined) setGoal(hydration.goal);
    if (hydration.constraints !== undefined) setConstraints(hydration.constraints);
    if (hydration.referenceUrl !== undefined) setReferenceUrl(hydration.referenceUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore form state from localStorage on mount (only for new brainstorm, not session detail,
  // and not for autopilot runs — autopilotConfig hydration takes precedence).
  useEffect(() => {
    if (initialSession) { setFormRestored(true); return; }
    // Skip localStorage restore when autopilot brainstorm is populated. NOTE: this
    // effect runs once on mount; on REDO_FROM brainstorm the engine doesn't remount,
    // so wizard values persist (no blank-slate redo). UX of redo+autopilot is open.
    if (autopilotConfig?.brainstorm) { setFormRestored(true); return; }
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

  // Load existing session when navigating back in the pipeline.
  // Reads from actor context instead of prop — actor owns brainstorm state.
  useEffect(() => {
    if (initialSession || initialIdeas) return;
    const ctxSessionId = brainstormResult?.brainstormSessionId;
    if (!ctxSessionId) {
      // Imported ideas have no session — hydrate from actor stageResults
      if (brainstormResult?.ideaId && brainstormResult?.ideaTitle && ideas.length === 0) {
        setIdeas([{
          id: brainstormResult.ideaId,
          idea_id: brainstormResult.ideaId,
          title: brainstormResult.ideaTitle,
          core_tension: brainstormResult.ideaCoreTension || undefined,
          target_audience: '',
          verdict: (brainstormResult.ideaVerdict as 'viable' | 'weak' | 'experimental') || 'experimental',
        }]);
        setSelectedIdeaId(brainstormResult.ideaId);
      }
      return;
    }

    // Already loaded this session
    if (sessionId === ctxSessionId && ideas.length > 0) return;

    (async () => {
      try {
        // Fetch session details (restores form fields)
        const sessRes = await fetch(`/api/brainstorm/sessions/${ctxSessionId}`, {
          signal: abortController?.signal,
        });
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
          const draftsRes = await fetch(`/api/brainstorm/sessions/${ctxSessionId}/drafts`, {
            signal: abortController?.signal,
          });
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
          if (brainstormResult?.ideaId) {
            setSelectedIdeaId(brainstormResult.ideaId);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // silent — form stays empty, user can regenerate
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brainstormResult?.brainstormSessionId]);

  // Reconnect to running session after page reload
  useEffect(() => {
    if (initialSession || activeGenerationId) return;
    (async () => {
      try {
        const url = channelId
          ? `/api/brainstorm/sessions/running?channelId=${channelId}`
          : '/api/brainstorm/sessions/running';
        const res = await fetch(url, { signal: abortController?.signal });
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
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // silent — no running session
      }
    })();
  }, [initialSession, channelId, activeGenerationId, abortController?.signal]);

  // Fetch recommended agent
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agents', { signal: abortController?.signal });
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
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // silent — keep defaults
      }
    })();
  }, [abortController?.signal]);

  // Auto-pilot: trigger generation when topic is filled and we're on the
  // brainstorm stage. Brainstorm is the entry point so the user types the
  // topic; once it's there, auto-pilot can run without further clicks.
  useAutoPilotTrigger({
    stage: 'brainstorm',
    canFire: () =>
      recommended.provider !== null &&
      !running &&
      !manualSessionId &&
      !ideas.length &&
      !brainstormResult?.ideaId &&
      (mode === 'reference_guided' ? !!referenceUrl.trim() : !!topic.trim()),
    fire: handleRun,
  });

  // Auto-pilot: when ideas finish generating and the AI flagged a `pick`,
  // select that idea and advance the machine. Falls back to the first 'viable'
  // verdict if no explicit pick is provided.
  const autoPickedRef = useRef<string | null>(null);
  const autoMode = useSelector(actor, (s) => s.context.mode);
  const overviewMode = autoMode === 'overview';
  const autoPaused = useSelector(actor, (s) => s.context.paused);
  useEffect(() => {
    if ((autoMode !== 'supervised' && autoMode !== 'overview') || autoPaused) return;
    if (brainstormResult?.ideaId) return;
    if (!ideas.length) return;
    if (running || regenerating) return;

    actor.send({ type: 'STAGE_PROGRESS', stage: 'brainstorm', partial: { status: 'Selecting idea' } });
    const matchByPick = recommendation?.pick
      ? ideas.find(
          (i) =>
            (i.title ?? '').trim().toLowerCase() ===
            recommendation.pick!.trim().toLowerCase(),
        )
      : null;
    const firstViable = ideas.find((i) => i.verdict === 'viable');
    const chosen = matchByPick ?? firstViable ?? ideas[0];
    const chosenId = chosen.id ?? chosen.idea_id;
    if (!chosenId || autoPickedRef.current === chosenId) return;
    autoPickedRef.current = chosenId;

    const result: BrainstormResult = {
      ideaId: chosenId,
      ideaTitle: chosen.title,
      ideaVerdict: chosen.verdict,
      ideaCoreTension: chosen.core_tension || '',
      brainstormSessionId: sessionId || undefined,
    };
    setSelectedIdeaId(chosenId);
    tracker.trackAction('idea.auto_selected', {
      ideaId: chosenId,
      ideaTitle: result.ideaTitle,
      reason: matchByPick ? 'ai_pick' : firstViable ? 'first_viable' : 'fallback_first',
    });
    actor.send({ type: 'BRAINSTORM_COMPLETE', result });
  }, [
    autoMode,
    autoPaused,
    ideas,
    recommendation,
    brainstormResult,
    running,
    regenerating,
    sessionId,
    actor,
    tracker,
  ]);

  async function handleRun() {
    if (mode !== 'reference_guided' && !topic.trim()) {
      toast.error('Enter a topic');
      return;
    }
    if (mode === 'reference_guided' && !referenceUrl.trim()) {
      toast.error('Paste the reference URL');
      return;
    }

    actor.send({ type: 'STAGE_PROGRESS', stage: 'brainstorm', partial: { status: 'Generating ideas' } });
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
        signal: abortController?.signal,
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
      if (err instanceof Error && err.name === 'AbortError') {
        setRunning(false);
        return;
      }
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
      const res = await fetch(`/api/brainstorm/sessions/${sessionId}/drafts`, {
        signal: abortController?.signal,
      });
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
      if (sessionId && mapped.length > 0) {
        actor.send({ type: 'STAGE_PROGRESS', stage: 'brainstorm', partial: { brainstormSessionId: sessionId } });
      }
      tracker.trackCompleted({
        sessionId: sessionId || undefined,
        ideaCount: mapped.length,
        ideas: mapped,
      });
      if (mapped.length === 0) {
        if (!overviewMode) toast.warning('No ideas recognized in output', {
          description: "AI responded but format didn't match. Try a different model or re-run.",
        });
      } else {
        if (!overviewMode) toast.success(`${mapped.length} ideas generated`);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
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
      signal: abortController?.signal,
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
    if (newIdeas.length > 0) {
      actor.send({ type: 'STAGE_PROGRESS', stage: 'brainstorm', partial: { brainstormSessionId: manualSessionId } });
    }
    setManualSessionId(null);
    tracker.trackCompleted({
      sessionId: manualSessionId,
      ideaCount: newIdeas.length,
      ideas: newIdeas,
    });
    if (!overviewMode) toast.success(`${newIdeas.length} ideas saved`);
  }

  async function handleManualAbandon() {
    if (!manualSessionId) return;
    try {
      // Intentionally NOT passing abortController.signal: cancel is fire-and-forget
      // cleanup that must reach the server even after the pipeline has been aborted.
      await fetch(`/api/brainstorm/sessions/${manualSessionId}/cancel`, {
        method: 'POST',
      });
    } catch {
      // best-effort
    }
    setManualSessionId(null);
    setSessionId(null);
    setIdeas([]);
    setRecommendation(null);
    actor.send({ type: 'STAGE_PROGRESS', stage: 'brainstorm', partial: { brainstormSessionId: undefined } });
    if (!overviewMode) toast.success('Manual session abandoned');
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
        { method: 'POST', signal: abortController?.signal }
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
          const reloadRes = await fetch(`/api/brainstorm/sessions/${newId}`, {
            signal: abortController?.signal,
          });
          const reloadJson = await reloadRes.json();
          if (reloadJson.data) {
            setIdeas(reloadJson.data.ideas ?? []);
            setSelectedIdeaId(null);
            tracker.trackAction('regenerated', {
              sessionId: newId,
              previousIdeaCount: ideas.length,
            });
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

    actor.send({ type: 'BRAINSTORM_COMPLETE', result });
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
        <ContextBanner stage="brainstorm" context={trackerContext} />

        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lightbulb className="h-5 w-5" /> Brainstorm
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
          entityType="ideas"
          channelId={channelId ?? undefined}
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
            actor.send({
              type: 'BRAINSTORM_COMPLETE',
              result: {
                ideaId: (item.id ?? item.idea_id) as string,
                ideaTitle: item.title as string,
                ideaVerdict: (item.verdict as string) ?? 'experimental',
                ideaCoreTension: (item.core_tension as string) ?? '',
              } as BrainstormResult,
            });
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ContextBanner stage="brainstorm" context={trackerContext} />

      <div className="flex items-start justify-between gap-4">
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
                <Label htmlFor="brainstorm-topic">Topic</Label>
                <Input
                  id="brainstorm-topic"
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
                  <Label htmlFor="brainstorm-niche" className="text-xs">Niche</Label>
                  <Input
                    id="brainstorm-niche"
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
        open={!overviewMode && !!manualSessionId}
        onOpenChange={(open) => { if (!open) setManualSessionId(null); }}
        onSubmit={handleManualOutputSubmit}
        onAbandon={handleManualAbandon}
        title="Paste brainstorm output"
        description="Retrieve the prompt from Axiom, run it in an external AI, then paste the full BC_BRAINSTORM_OUTPUT JSON below."
        submitLabel="Save ideas"
      />

      <IdeaDetailsDialog
        open={!!detailsIdeaId}
        onOpenChange={(open) => { if (!open) setDetailsIdeaId(null); }}
        idea={(() => {
          if (!detailsIdeaId) return null;
          const found = ideas.find((i) => (i.id ?? i.idea_id) === detailsIdeaId);
          if (!found) return null;
          let extra: Record<string, unknown> = {};
          try {
            if (found.discovery_data) extra = JSON.parse(found.discovery_data);
          } catch {
            // ignore
          }
          return {
            idea_id: found.idea_id,
            title: found.title,
            core_tension: found.core_tension,
            target_audience: found.target_audience,
            verdict: found.verdict,
            ...extra,
          };
        })()}
      />


      {/* Floating progress indicator — non-blocking, bottom-right. Suppressed in
          overview mode: the engine runs hidden behind display:none and the float
          would leak onto the dashboard via its fixed-position portal. */}
      <GenerationProgressFloat
        open={!overviewMode && !!activeGenerationId}
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
        <Card className="border-border/60 bg-gradient-to-b from-card to-card/40 backdrop-blur">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 ring-1 ring-primary/20">
                  <Lightbulb className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {isSessionDetail ? 'Ideas' : 'Generated ideas'}
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                      {ideas.length}
                    </span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground font-normal mt-0.5">
                    Pick one to continue to Research
                  </p>
                </div>
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
            <ContentWarningBanner warning={recommendation?.content_warning} />
            {recommendation && (recommendation.pick || recommendation.rationale) && (
              <div className="relative mt-4 overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4">
                <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-primary/20 blur-2xl" />
                <div className="relative flex items-start gap-3">
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/20 ring-1 ring-primary/30 shrink-0">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                        AI Recommendation
                      </span>
                    </div>
                    {recommendation.pick && (
                      <div className="font-semibold text-sm text-foreground mt-1 leading-snug">
                        {recommendation.pick}
                      </div>
                    )}
                    {recommendation.rationale && (
                      <div className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        {recommendation.rationale}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-2.5">
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
              const verdictStyles =
                idea.verdict === 'viable'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30'
                  : idea.verdict === 'weak'
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/30'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/30';
              const verdictDot =
                idea.verdict === 'viable'
                  ? 'bg-emerald-500'
                  : idea.verdict === 'weak'
                    ? 'bg-rose-500'
                    : 'bg-amber-500';

              return (
                <div
                  key={idea.idea_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedIdeaId(ideaKey)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedIdeaId(ideaKey);
                    }
                  }}
                  className={`group relative w-full text-left p-4 rounded-xl border transition-all duration-200 overflow-hidden cursor-pointer ${
                    isSelected
                      ? 'border-primary/60 bg-primary/[0.07] shadow-lg shadow-primary/10'
                      : 'border-border/60 bg-card/50 hover:border-primary/30 hover:bg-card hover:-translate-y-0.5 hover:shadow-md'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary to-primary/60" />
                  )}
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-5 w-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                        isSelected
                          ? 'border-primary bg-primary scale-110'
                          : 'border-muted-foreground/30 group-hover:border-primary/50'
                      }`}
                    >
                      {isSelected && (
                        <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold text-sm leading-snug flex-1">
                          {idea.title}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${verdictStyles}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${verdictDot}`} />
                            {idea.verdict}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailsIdeaId(ideaKey);
                            }}
                            className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            aria-label="View details"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {isPreSelected && (
                        <div className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          <Check className="h-3 w-3" /> Previously selected
                        </div>
                      )}
                      {idea.core_tension && (
                        <div className="flex items-start gap-1.5 mt-2 text-xs text-muted-foreground leading-relaxed">
                          <Target className="h-3 w-3 mt-0.5 shrink-0 opacity-70" />
                          <span>{idea.core_tension}</span>
                        </div>
                      )}
                      {idea.target_audience && (
                        <div className="flex items-start gap-1.5 mt-1.5 text-xs text-muted-foreground leading-relaxed">
                          <Users className="h-3 w-3 mt-0.5 shrink-0 opacity-70" />
                          <span>{idea.target_audience}</span>
                        </div>
                      )}
                      {extra.angle && (
                        <div className="flex items-start gap-1.5 mt-1.5 text-xs text-muted-foreground leading-relaxed">
                          <Sparkles className="h-3 w-3 mt-0.5 shrink-0 opacity-70" />
                          <span>{extra.angle}</span>
                        </div>
                      )}
                      {extra.repurposing && extra.repurposing.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2.5">
                          {extra.repurposing.map((r) => (
                            <Badge
                              key={r}
                              variant="outline"
                              className="text-[10px] font-normal bg-background/50"
                            >
                              {r}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {extra.risk_flags && extra.risk_flags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {extra.risk_flags.map((r) => (
                            <span
                              key={r}
                              className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
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
