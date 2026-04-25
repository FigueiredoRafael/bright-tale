import { PIPELINE_STAGES } from '@/components/engines/types'
import type { PipelineMachineContext, PipelineStage, StageResultMap } from './machine.types'

type AnyResult = Record<string, unknown>

export function mergeStageResult(
  context: PipelineMachineContext,
  stage: PipelineStage,
  result: AnyResult,
): PipelineMachineContext {
  return {
    ...context,
    stageResults: {
      ...context.stageResults,
      [stage]: { ...result, completedAt: new Date().toISOString() },
    },
  }
}

/**
 * Removes stage results at indices STRICTLY AFTER `fromStage`.
 * The named stage's own result is preserved.
 *
 * Used by REDO_FROM (user re-runs from a given stage; keeps that stage's
 * existing result so they can see what they're replacing) and by
 * *_COMPLETE actions (clear stale downstream when a user re-completes
 * an earlier stage).
 */
export function clearStrictlyAfter(
  context: PipelineMachineContext,
  fromStage: PipelineStage,
): PipelineMachineContext {
  const fromIndex = PIPELINE_STAGES.indexOf(fromStage)
  if (fromIndex === -1) return context
  const newResults: StageResultMap = { ...context.stageResults }
  PIPELINE_STAGES.slice(fromIndex + 1).forEach((s) => {
    delete newResults[s]
  })
  return { ...context, stageResults: newResults }
}

export function incrementIterationCount(context: PipelineMachineContext): PipelineMachineContext {
  return { ...context, iterationCount: context.iterationCount + 1 }
}

export function resetIterationCount(context: PipelineMachineContext): PipelineMachineContext {
  return { ...context, iterationCount: 0 }
}

export function setLastError(context: PipelineMachineContext, error: string): PipelineMachineContext {
  return { ...context, lastError: error }
}

export function clearLastError(context: PipelineMachineContext): PipelineMachineContext {
  return { ...context, lastError: null }
}
