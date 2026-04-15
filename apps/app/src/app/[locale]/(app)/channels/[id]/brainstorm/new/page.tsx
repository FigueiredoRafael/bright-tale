'use client';

import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { PipelineStages } from '@/components/pipeline/PipelineStages';
import { BrainstormEngine } from '@/components/engines/BrainstormEngine';
import type { BrainstormResult } from '@/components/engines/types';

export default function BrainstormNewPage() {
  const { id: channelId } = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <div>
      <PipelineStages currentStep="brainstorm" channelId={channelId} />
      <div className="p-6 max-w-4xl mx-auto">
        <BrainstormEngine
          mode="generate"
          channelId={channelId}
          context={{}}
          onComplete={(result) => {
            const r = result as BrainstormResult;
            if (r.brainstormSessionId) {
              router.push(
                `/channels/${channelId}/brainstorm/${r.brainstormSessionId}`
              );
            }
          }}
        />
      </div>
    </div>
  );
}
