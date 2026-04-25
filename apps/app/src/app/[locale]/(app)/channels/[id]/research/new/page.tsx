'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { PipelineStages } from '@/components/pipeline/PipelineStages';
import { ResearchEngine } from '@/components/engines/ResearchEngine';
import { StandaloneEngineHost } from '@/components/engines/StandaloneEngineHost';
import type { ResearchResult } from '@/components/engines/types';

export default function NewResearchPage() {
  const { id: channelId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ideaIdParam = searchParams.get('ideaId') ?? undefined;
  const projectIdParam = searchParams.get('projectId') ?? undefined;

  return (
    <div>
      <PipelineStages
        currentStep="research"
        channelId={channelId}
        projectId={projectIdParam}
      />
      <div className="p-6 max-w-4xl mx-auto">
        <StandaloneEngineHost
          stage="research"
          channelId={channelId}
          projectId={projectIdParam}
          onStageComplete={(_stage, result) => {
            const r = result as unknown as ResearchResult;
            const params = new URLSearchParams();
            if (r.researchSessionId) params.set('researchSessionId', r.researchSessionId);
            if (ideaIdParam) params.set('ideaId', ideaIdParam);
            if (projectIdParam) params.set('projectId', projectIdParam);
            router.push(`/channels/${channelId}/drafts/new?${params.toString()}`);
          }}
        >
          <ResearchEngine mode="generate" initialIdeaId={ideaIdParam} />
        </StandaloneEngineHost>
      </div>
    </div>
  );
}
