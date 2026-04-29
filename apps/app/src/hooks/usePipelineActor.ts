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
