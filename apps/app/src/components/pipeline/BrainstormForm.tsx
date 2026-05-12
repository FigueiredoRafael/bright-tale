"use client";

/**
 * <BrainstormForm> — leaf input for the Brainstorm Stage on the new
 * architecture. Submits `{ stage: 'brainstorm', input }` to the generic
 * `POST /api/projects/:id/stage-runs` endpoint.
 *
 * Validation mirrors `brainstormInputSchema` in @brighttale/shared.
 */
import { useState } from 'react';
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

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
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
      onSubmitted?.(body.data.stageRun.id as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
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

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md border bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        data-testid="bs-submit"
      >
        {submitting ? 'Starting…' : 'Start Brainstorm'}
      </button>
    </form>
  );
}
