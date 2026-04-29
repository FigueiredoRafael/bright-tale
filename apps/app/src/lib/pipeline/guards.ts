import type { PipelineMachineContext, PipelineEvent } from './machine.types'

type ReviewCompleteEvent = Extract<PipelineEvent, { type: 'REVIEW_COMPLETE' }>
type GuardArgs = { context: PipelineMachineContext; event: ReviewCompleteEvent }

export function isApprovedGuard({ context, event }: GuardArgs): boolean {
  if (event.result.verdict === 'approved') return true
  const threshold = context.autopilotConfig?.review.autoApproveThreshold
    ?? context.pipelineSettings.reviewApproveScore
  return event.result.score >= threshold
}

export function isRejectedGuard({ context, event }: GuardArgs): boolean {
  const threshold = context.autopilotConfig?.review.hardFailThreshold
    ?? context.pipelineSettings.reviewRejectThreshold
  return event.result.score < threshold
}

/**
 * Reads `context.iterationCount` (machine-owned, incremented on `reviewing` entry).
 * Any `iterationCount` on the event payload is ignored — see design spec
 * "iterationCount source-of-truth invariant". The `event` arg is accepted for
 * signature symmetry with sibling guards and for XState's call shape.
 */
export function hasReachedMaxIterationsGuard({ context }: { context: PipelineMachineContext; event?: ReviewCompleteEvent }): boolean {
  const max = context.autopilotConfig?.review.maxIterations
    ?? context.pipelineSettings.reviewMaxIterations
  return context.iterationCount >= max
}
