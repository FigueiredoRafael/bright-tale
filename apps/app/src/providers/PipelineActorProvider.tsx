'use client'

import { createContext } from 'react'
import type { ActorRefFrom } from 'xstate'
import type { pipelineMachine } from '@/lib/pipeline/machine'

export type PipelineActorRef = ActorRefFrom<typeof pipelineMachine>

/**
 * Per-project actor context.
 * Value is a single ActorRef (not a Map). Each <PipelineActorProvider> scopes
 * its own subtree, so sibling project pages get isolated actors.
 */
export const PipelineActorContext = createContext<PipelineActorRef | null>(null)

export function PipelineActorProvider({
  value,
  children,
}: {
  value: PipelineActorRef
  children: React.ReactNode
}) {
  return (
    <PipelineActorContext.Provider value={value}>
      {children}
    </PipelineActorContext.Provider>
  )
}
