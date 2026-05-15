'use client';
import type React from 'react';
import { useStageRun } from '@/hooks/useStageRun';
import { BrainstormEngine } from '@/components/engines/BrainstormEngine';
import { ResearchEngine } from '@/components/engines/ResearchEngine';
import { CanonicalEngine } from '@/components/engines/CanonicalEngine';
import { ProductionEngine } from '@/components/engines/ProductionEngine';
import { ReviewEngine } from '@/components/engines/ReviewEngine';
import { AssetsEngine } from '@/components/engines/AssetsEngine';
import { PreviewEngine } from '@/components/engines/PreviewEngine';
import { PublishEngine } from '@/components/engines/PublishEngine';
import type { Stage, StageRun } from '@brighttale/shared/pipeline/inputs';

// ENGINE_BY_STAGE uses React.ComponentType<any> as the approved type for dispatch maps (T3.4 plan).
type AnyEngine = React.ComponentType<any>;

const ENGINE_BY_STAGE: Record<Stage, AnyEngine> = {
  brainstorm: BrainstormEngine,
  research: ResearchEngine,
  canonical: CanonicalEngine,
  production: ProductionEngine,
  review: ReviewEngine,
  assets: AssetsEngine,
  preview: PreviewEngine,
  publish: PublishEngine,
};

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'aborted', 'skipped']);

interface Props {
  projectId: string;
  stage: Stage;
  trackId?: string;
  publishTargetId?: string;
  attemptNo: number;
}

export function EngineHost({ projectId, stage, trackId, publishTargetId, attemptNo }: Props) {
  const { data, isLoading, error } = useStageRun({ projectId, stage, trackId, publishTargetId, attemptNo });

  if (isLoading) return <div data-testid="engine-host-loading" />;
  if (error) return <div data-testid="engine-host-error">{error.message}</div>;
  if (!data) return <div data-testid="engine-host-empty">No run yet</div>;

  const isReadOnly = TERMINAL_STATUSES.has(data.status) && data.attemptNo !== attemptNo;
  const Engine = ENGINE_BY_STAGE[stage];

  return (
    <div data-testid="engine-host" data-readonly={isReadOnly}>
      {isReadOnly && <div data-testid="engine-host-readonly" />}
      <Engine
        projectId={projectId}
        stageRun={data as StageRun}
        trackId={trackId}
        publishTargetId={publishTargetId}
        readOnly={isReadOnly}
      />
    </div>
  );
}
