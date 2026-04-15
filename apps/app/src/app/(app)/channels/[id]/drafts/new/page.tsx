'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { PipelineStages } from '@/components/pipeline/PipelineStages';
import { DraftEngine } from '@/components/engines/DraftEngine';
import type { DraftResult } from '@/components/engines/types';

export default function NewDraftPage() {
  const { id: channelId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ideaIdParam = searchParams.get('ideaId') ?? undefined;
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
        <DraftEngine
          mode="generate"
          channelId={channelId}
          context={{
            ideaId: ideaIdParam,
            researchSessionId: researchSessionIdParam,
            projectId: projectIdParam,
            channelId,
          }}
          onComplete={(result) => {
            const r = result as DraftResult;
            router.push(`/channels/${channelId}/drafts/${r.draftId}`);
          }}
        />
      </div>
    </div>
  );
}
