"use client";

/**
 * <BrainstormForm> — leaf input for the Brainstorm Stage on the new
 * architecture. Submits `{ stage: 'brainstorm', input }` to the generic
 * `POST /api/projects/:id/stage-runs` endpoint.
 *
 * On mount we hydrate from `projects.autopilot_config_json.brainstorm` so
 * the inputs the user already supplied in the wizard land here pre-filled
 * (and, when `mode==='autopilot'`, we auto-submit so the dispatcher fires
 * without an extra click).
 *
 * Validation mirrors `brainstormInputSchema` in @brighttale/shared.
 */
import { useEffect, useRef, useState } from 'react';
import { brainstormInputSchema } from '@brighttale/shared/pipeline/inputs';

interface BrainstormFormProps {
  projectId: string;
  onSubmitted?: (stageRunId: string) => void;
}

type Mode = 'topic_driven' | 'reference_guided';

export function BrainstormForm({ projectId, onSubmitted }: BrainstormFormProps) {
  const [mode, setMode] = useState<Mode>('topic_driven');
  const [topic, setTopic] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [niche, setNiche] = useState('');
  const [tone, setTone] = useState('');
  const [audience, setAudience] = useState('');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [shouldAutorun, setShouldAutorun] = useState(false);
  const autorunFiredRef = useRef(false);

  // Hydrate from the wizard's autopilotConfig. Runs once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        const body = await res.json();
        if (cancelled || !body?.data) return;
        const bs = (body.data.autopilot_config_json as Record<string, unknown> | null | undefined)
          ?.brainstorm as Record<string, unknown> | null | undefined;
        if (bs) {
          const m = (bs.mode as Mode | undefined);
          if (m === 'topic_driven' || m === 'reference_guided') setMode(m);
          if (typeof bs.topic === 'string') setTopic(bs.topic);
          if (typeof bs.referenceUrl === 'string') setReferenceUrl(bs.referenceUrl);
          if (typeof bs.niche === 'string') setNiche(bs.niche);
          if (typeof bs.tone === 'string') setTone(bs.tone);
          if (typeof bs.audience === 'string') setAudience(bs.audience);
          const providerOverride = bs.providerOverride as string | null | undefined;
          if (providerOverride) setProvider(providerOverride);
          const modelOverride = bs.modelOverride as string | null | undefined;
          if (modelOverride) setModel(modelOverride);
        }
        const projectMode = body.data.mode as string | null | undefined;
        if (projectMode === 'autopilot' && bs) setShouldAutorun(true);
      } catch {
        // Hydration failure is non-fatal — user can still fill the form by hand.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Autopilot autorun: once the wizard config is hydrated and the project's
  // mode is autopilot, fire the same submit a real click would. Guarded by a
  // ref so React's StrictMode double-invoke (or a re-render) can't double-fire.
  useEffect(() => {
    if (!hydrated || !shouldAutorun || submitted || submitting || autorunFiredRef.current) return;
    autorunFiredRef.current = true;
    void submitCore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, shouldAutorun, submitted, submitting]);

  async function submitCore(): Promise<void> {
    setError(null);
    const input: Record<string, unknown> = { mode };
    if (mode === 'topic_driven' && topic.trim()) input.topic = topic.trim();
    if (mode === 'reference_guided' && referenceUrl.trim()) input.referenceUrl = referenceUrl.trim();
    if (niche.trim()) input.niche = niche.trim();
    if (tone.trim()) input.tone = tone.trim();
    if (audience.trim()) input.audience = audience.trim();
    if (provider.trim()) input.provider = provider.trim();
    if (model.trim()) input.model = model.trim();

    const parsed = brainstormInputSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/stage-runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage: 'brainstorm', input: parsed.data }),
      });
      const body = await res.json();
      if (!res.ok || body?.error) {
        setError(body?.error?.message ?? 'Failed to start brainstorm');
        return;
      }
      setSubmitted(true);
      onSubmitted?.(body.data.stageRun.id as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    await submitCore();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-testid="brainstorm-form">
      <div>
        <label className="text-sm font-medium">Mode</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          className="ml-2 rounded border px-2 py-1 text-sm"
          data-testid="bs-mode"
        >
          <option value="topic_driven">Topic-driven</option>
          <option value="reference_guided">Reference-guided</option>
        </select>
      </div>

      {mode === 'topic_driven' ? (
        <div>
          <label className="block text-sm font-medium">Topic</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            placeholder="e.g. AI pricing strategies for B2B SaaS"
            data-testid="bs-topic"
          />
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium">Reference URL</label>
          <input
            type="url"
            value={referenceUrl}
            onChange={(e) => setReferenceUrl(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            placeholder="https://example.com/article"
            data-testid="bs-reference-url"
          />
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Advanced</summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Niche"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
            data-testid="bs-niche"
          />
          <input
            type="text"
            placeholder="Tone"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
            data-testid="bs-tone"
          />
          <input
            type="text"
            placeholder="Audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
            data-testid="bs-audience"
          />
          <input
            type="text"
            placeholder="Provider (override)"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
            data-testid="bs-provider"
          />
          <input
            type="text"
            placeholder="Model (override)"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="col-span-2 rounded border px-2 py-1 text-sm"
            data-testid="bs-model"
          />
        </div>
      </details>

      {error ? (
        <div className="text-sm text-rose-600" role="alert" data-testid="bs-error">
          {error}
        </div>
      ) : null}

      {submitted ? (
        <div
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
          data-testid="bs-submitted"
        >
          Stage Run created. Waiting for the orchestrator to pick it up…
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting || submitted}
        className="rounded-md border bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        data-testid="bs-submit"
      >
        {submitting ? 'Starting…' : submitted ? 'Started' : 'Start Brainstorm'}
      </button>
    </form>
  );
}
