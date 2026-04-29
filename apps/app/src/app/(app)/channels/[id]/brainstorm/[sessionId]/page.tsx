'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { PipelineStages } from '@/components/pipeline/PipelineStages';
import { BrainstormEngine } from '@/components/engines/BrainstormEngine';
import { StandaloneEngineHost } from '@/components/engines/StandaloneEngineHost';
import type { BrainstormResult } from '@/components/engines/types';
import { Loader2 } from 'lucide-react';

export default function BrainstormSessionPage() {
  const { id: channelId, sessionId } = useParams<{ id: string; sessionId: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Record<string, unknown> | null>(null);
  const [ideas, setIdeas] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/brainstorm/sessions/${sessionId}`);
        const { data, error: apiErr } = await res.json();
        if (apiErr) {
          setError(apiErr.message ?? 'Failed to load session');
          return;
        }
        setSession(data.session ?? data);
        setIdeas(data.ideas ?? []);
      } catch {
        setError('Failed to load session');
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  const projectId = (session?.project_id as string) ?? undefined;

  if (loading) {
    return (
      <div>
        <PipelineStages currentStep="brainstorm" channelId={channelId} brainstormSessionId={sessionId} />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PipelineStages currentStep="brainstorm" channelId={channelId} brainstormSessionId={sessionId} />
        <div className="p-6 max-w-4xl mx-auto">
          <p className="text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PipelineStages
        currentStep="brainstorm"
        channelId={channelId}
        brainstormSessionId={sessionId}
        projectId={projectId}
      />
      <div className="p-6 max-w-4xl mx-auto">
        <StandaloneEngineHost
          stage="brainstorm"
          channelId={channelId}
          projectId={projectId}
          onStageComplete={async (_stage, result) => {
            const r = result as unknown as BrainstormResult;
            const params = new URLSearchParams();
            if (r.ideaId) params.set('ideaId', r.ideaId);
            if (projectId) params.set('projectId', projectId);
            router.push(`/channels/${channelId}/research/new?${params.toString()}`);
          }}
        >
          <BrainstormEngine
            mode="generate"
            initialSession={session ?? undefined}
            initialIdeas={ideas}
          />
        </StandaloneEngineHost>
      </div>
    </div>
  );
}
