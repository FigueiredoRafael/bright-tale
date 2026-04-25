'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { PipelineStages } from '@/components/pipeline/PipelineStages';
import { BrainstormEngine } from '@/components/engines/BrainstormEngine';
import { StandaloneEngineHost } from '@/components/engines/StandaloneEngineHost';
import type { BrainstormResult } from '@/components/engines/types';

interface PipelineCtx {
  projectId?: string;
  projectTitle?: string;
  researchSessionId?: string;
  draftId?: string;
  ideaId?: string;
}

export default function BrainstormSessionPage() {
  const { id: channelId, sessionId } = useParams<{ id: string; sessionId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Record<string, unknown> | null>(null);
  const [ideas, setIdeas] = useState<Record<string, unknown>[]>([]);
  const [pipeline, setPipeline] = useState<PipelineCtx>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/brainstorm/sessions/${sessionId}`);
        const json = await res.json();
        if (json.data) {
          setSession(json.data.session);
          setIdeas(json.data.ideas ?? []);

          const projectId = (json.data.session as Record<string, unknown>)?.project_id;
          if (projectId) {
            try {
              const pRes = await fetch(`/api/projects/${projectId}/pipeline`);
              const pJson = await pRes.json();
              if (pJson.data) {
                const ctx: PipelineCtx = {
                  projectId: projectId as string,
                  projectTitle: (pJson.data.project as Record<string, unknown>)?.title as string,
                  researchSessionId: (pJson.data.researchSessions as Array<Record<string, unknown>>)?.[0]?.id as string,
                  draftId: (pJson.data.contentDrafts as Array<Record<string, unknown>>)?.[0]?.id as string,
                };
                const projIdea = (pJson.data.ideas as Array<Record<string, unknown>>)?.[0];
                if (projIdea) ctx.ideaId = projIdea.id as string;
                setPipeline(ctx);
              }
            } catch { /* optional */ }
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  if (loading) return <div className="p-6 text-muted-foreground">Loading session...</div>;
  if (!session) return <div className="p-6 text-red-500">Session not found.</div>;

  return (
    <div>
      <PipelineStages
        currentStep="brainstorm"
        channelId={channelId}
        brainstormSessionId={sessionId}
        researchSessionId={pipeline.researchSessionId}
        draftId={pipeline.draftId}
        projectId={pipeline.projectId}
        projectTitle={pipeline.projectTitle}
      />
      <div className="p-6 max-w-4xl mx-auto">
        <StandaloneEngineHost
          stage="brainstorm"
          channelId={channelId}
          projectId={pipeline.projectId}
          onStageComplete={async (_stage, result) => {
            const r = result as unknown as BrainstormResult;
            try {
              const res = await fetch('/api/projects/from-idea', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ideaId: r.ideaId, channelId }),
              });
              const json = await res.json();
              const pid = (json.data?.project as Record<string, unknown>)?.id as string;
              router.push(`/channels/${channelId}/research/new?ideaId=${r.ideaId}&projectId=${pid ?? ''}`);
            } catch {
              router.push(`/channels/${channelId}/research/new?ideaId=${r.ideaId}`);
            }
          }}
        >
          <BrainstormEngine
            mode="generate"
            initialSession={session}
            initialIdeas={ideas}
            preSelectedIdeaId={pipeline.ideaId}
          />
        </StandaloneEngineHost>
      </div>
    </div>
  );
}
