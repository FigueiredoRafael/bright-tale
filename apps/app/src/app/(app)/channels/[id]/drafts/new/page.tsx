'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { PipelineStages } from '@/components/pipeline/PipelineStages';
import { DraftEngine } from '@/components/engines/DraftEngine';
import { StandaloneEngineHost } from '@/components/engines/StandaloneEngineHost';
import type { DraftResult } from '@/components/engines/types';

export default function NewDraftPage() {
  const { id: channelId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const researchSessionIdParam = searchParams.get('researchSessionId') ?? undefined;
  const projectIdParam = searchParams.get('projectId') ?? undefined;

  return (
    <div>
      <PipelineStages
        currentStep="draft"
        channelId={channelId}
        researchSessionId={researchSessionIdParam}
        projectId={projectIdParam}
      />
      <div className="p-6 max-w-3xl mx-auto">
        <StandaloneEngineHost
          stage="draft"
          channelId={channelId}
          projectId={projectIdParam}
          onStageComplete={(_stage, result) => {
            const r = result as unknown as DraftResult;
            router.push(`/channels/${channelId}/drafts/${r.draftId}`);
          }}
        >
          <DraftEngine mode="generate" />
        </StandaloneEngineHost>
      </div>
    </div>
  );
}
