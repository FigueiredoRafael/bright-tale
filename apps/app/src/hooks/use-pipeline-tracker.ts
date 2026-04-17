'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAnalytics } from './use-analytics';
import type { PipelineContext, PipelineStage } from '@/components/engines/types';

interface PipelineTracker {
  trackStarted: (input: Record<string, unknown>) => void;
  trackCompleted: (output: Record<string, unknown>) => void;
  trackFailed: (error: string, extra?: Record<string, unknown>) => void;
  trackAction: (action: string, data?: Record<string, unknown>) => void;
}

export function usePipelineTracker(
  stage: PipelineStage,
  context: PipelineContext,
): PipelineTracker {
  const { track } = useAnalytics();
  const ctxRef = useRef(context);
  useEffect(() => { ctxRef.current = context; });

  const baseProps = useCallback(() => {
    const c = ctxRef.current;
    return {
      projectId: c.projectId,
      channelId: c.channelId,
      draftId: c.draftId,
      ideaId: c.ideaId,
      researchSessionId: c.researchSessionId,
      stage,
    };
  }, [stage]);

  const trackStarted = useCallback(
    (input: Record<string, unknown>) => {
      track(`pipeline.${stage}.started`, { ...baseProps(), ...input });
    },
    [track, stage, baseProps],
  );

  const trackCompleted = useCallback(
    (output: Record<string, unknown>) => {
      track(`pipeline.${stage}.completed`, { ...baseProps(), ...output });
    },
    [track, stage, baseProps],
  );

  const trackFailed = useCallback(
    (error: string, extra?: Record<string, unknown>) => {
      track(`pipeline.${stage}.failed`, { ...baseProps(), error, ...extra });
    },
    [track, stage, baseProps],
  );

  const trackAction = useCallback(
    (action: string, data?: Record<string, unknown>) => {
      track(`pipeline.${stage}.${action}`, { ...baseProps(), ...data });
    },
    [track, stage, baseProps],
  );

  return { trackStarted, trackCompleted, trackFailed, trackAction };
}
