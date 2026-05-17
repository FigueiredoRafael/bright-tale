import { useContext } from 'react'
import { PipelineActorContext, type PipelineActorRef } from '@/providers/PipelineActorProvider'

export function usePipelineActor(): PipelineActorRef {
  const actor = useContext(PipelineActorContext)
  if (!actor) {
    throw new Error(
      'usePipelineActor must be used inside <PipelineActorProvider>. Are you rendering an engine outside the pipeline orchestrator?',
    )
  }
  return actor
}

/**
 * Returns the actor ref when inside a PipelineActorProvider, or null otherwise.
 * Use when a hook supports both the legacy actor path and the new server-driven
 * context path (Slice 14.1+).
 */
export function useOptionalPipelineActor(): PipelineActorRef | null {
  return useContext(PipelineActorContext)
}
