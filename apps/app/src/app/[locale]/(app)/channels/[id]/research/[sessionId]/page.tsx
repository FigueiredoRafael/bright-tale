'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { PipelineStages } from '@/components/pipeline/PipelineStages';
import { ResearchEngine } from '@/components/engines/ResearchEngine';
import type { ResearchResult, PipelineContext } from '@/components/engines/types';

interface Session {
  id: string;
  idea_id: string | null;
  level: string;
  cards_json: unknown[] | null;
  approved_cards_json: unknown[] | null;
  refined_angle_json: Record<string, unknown> | null;
  project_id: string | null;
  input_json: Record<string, unknown>;
}

export default function ResearchSessionPage() {
  const params = useParams();
  const channelId = params.id as string;
  const sessionId = params.sessionId as string;
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<PipelineContext>({
    channelId,
  });

  useEffect(() => {
    (async () => {
      try {
        // Fetch session
        const res = await fetch(`/api/research-sessions/${sessionId}`);
        const json = await res.json();
        if (json.data) {
          const s = json.data as Session;
          setSession(s);

          // Build context from session + pipeline
          const newContext: PipelineContext = {
            channelId,
            ideaId: s.idea_id ?? undefined,
            projectId: s.project_id ?? undefined,
            researchSessionId: s.id,
          };

          // Fetch pipeline context if project exists
          if (s.project_id) {
            try {
              const pRes = await fetch(`/api/projects/${s.project_id}/pipeline`);
              const pJson = await pRes.json();
              if (pJson.data) {
                newContext.projectTitle = pJson.data.project?.title;
                const bs = pJson.data.brainstormSessions?.[0];
                if (bs) newContext.brainstormSessionId = bs.id;
                const dr = pJson.data.contentDrafts?.[0];
                if (dr) newContext.draftId = dr.id;

                // Get linked idea title from project
                const projectIdeas = pJson.data.ideas ?? [];
                if (projectIdeas.length > 0) {
                  newContext.ideaTitle = projectIdeas[0].title;
                  newContext.ideaVerdict = projectIdeas[0].verdict;
                }
              }
            } catch {
              /* pipeline fetch optional */
            }
          }

          // Fallback: fetch linked idea if no project
          if (!s.project_id && s.idea_id) {
            try {
              const ideaRes = await fetch(`/api/ideas/library?limit=100`);
              const ideaJson = await ideaRes.json();
              const idea = (ideaJson.data?.ideas ?? []).find(
                (i: Record<string, unknown>) =>
                  i.id === s.idea_id || i.idea_id === s.idea_id
              );
              if (idea) {
                newContext.ideaTitle = idea.title;
                newContext.ideaVerdict = idea.verdict;
              }
            } catch {
              /* silent */
            }
          }

          setContext(newContext);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId, channelId]);

  const handleComplete = (result: unknown) => {
    const r = result as ResearchResult;
    const params = new URLSearchParams();
    params.set('researchSessionId', r.researchSessionId);
    if (session?.idea_id) params.set('ideaId', session.idea_id);
    if (session?.project_id) params.set('projectId', session.project_id);
    router.push(`/channels/${channelId}/drafts/new?${params.toString()}`);
  };

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading session...</div>;
  }

  if (!session) {
    return <div className="p-6 text-red-500">Session not found.</div>;
  }

  const initialCards = (session.approved_cards_json ?? session.cards_json ?? []) as Record<string, unknown>[];
  const initialApproved = initialCards.map((_, i) => i);

  const sessionRecord: Record<string, unknown> = {
    id: session.id,
    idea_id: session.idea_id,
    level: session.level,
    cards_json: session.cards_json,
    approved_cards_json: session.approved_cards_json,
    refined_angle_json: session.refined_angle_json,
    project_id: session.project_id,
    input_json: session.input_json,
  };

  return (
    <div>
      <PipelineStages
        currentStep="research"
        channelId={channelId}
        researchSessionId={sessionId}
        brainstormSessionId={context.brainstormSessionId}
        draftId={context.draftId}
        projectId={context.projectId}
        projectTitle={context.projectTitle}
        ideaTitle={context.ideaTitle}
      />
      <div className="p-6 max-w-4xl mx-auto">
        <ResearchEngine
          mode="import"
          channelId={channelId}
          context={context}
          onComplete={handleComplete}
          initialSession={sessionRecord}
          initialCards={initialCards}
          initialApproved={initialApproved}
        />
      </div>
    </div>
  );
}
