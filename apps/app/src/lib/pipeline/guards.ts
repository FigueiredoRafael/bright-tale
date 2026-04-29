import type { PipelineMachineContext, PipelineEvent } from './machine.types'

type ReviewCompleteEvent = Extract<PipelineEvent, { type: 'REVIEW_COMPLETE' }>
type GuardArgs = { context: PipelineMachineContext; event: ReviewCompleteEvent }

export function isApprovedGuard({ context, event }: GuardArgs): boolean {
  return event.result.verdict === 'approved' || event.result.score >= context.pipelineSettings.reviewApproveScore
}

export function isRejectedGuard({ context, event }: GuardArgs): boolean {
  return event.result.score < context.pipelineSettings.reviewRejectThreshold
}

/**
 * Reads `context.iterationCount` (machine-owned, incremented on `reviewing` entry).
 * Any `iterationCount` on the event payload is ignored — see design spec
 * "iterationCount source-of-truth invariant". The `event` arg is accepted for
 * signature symmetry with sibling guards and for XState's call shape.
 */
export function hasReachedMaxIterationsGuard({ context }: { context: PipelineMachineContext; event?: ReviewCompleteEvent }): boolean {
  return context.iterationCount >= context.pipelineSettings.reviewMaxIterations
}
