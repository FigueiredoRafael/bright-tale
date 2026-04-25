'use client'

import { useEffect, useRef } from 'react'
import { useMachine } from '@xstate/react'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import {
  PipelineSettingsProvider,
  usePipelineSettings,
} from '@/providers/PipelineSettingsProvider'
import type { PipelineStage, StageResultMap } from '@/lib/pipeline/machine.types'

interface StandaloneEngineHostProps {
  stage: PipelineStage
  channelId: string
  projectId?: string
  initialStageResults?: StageResultMap
  onStageComplete: (stage: PipelineStage, result: Record<string, unknown>) => void
  children: React.ReactNode
}

export function StandaloneEngineHost(props: StandaloneEngineHostProps) {
  return (
    <PipelineSettingsProvider>
      <HostInner {...props} />
    </PipelineSettingsProvider>
  )
}

function HostInner({
  stage,
  channelId,
  projectId,
  initialStageResults,
  onStageComplete,
  children,
}: StandaloneEngineHostProps) {
  const { pipelineSettings, creditSettings, isLoaded } = usePipelineSettings()
  if (!isLoaded) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        </CardContent>
      </Card>
    )
  }
  return (
    <ActorScope
      stage={stage}
      channelId={channelId}
      projectId={projectId}
      initialStageResults={initialStageResults}
      pipelineSettings={pipelineSettings}
      creditSettings={creditSettings}
      onStageComplete={onStageComplete}
    >
      {children}
    </ActorScope>
  )
}

type ActorScopeProps = StandaloneEngineHostProps & {
  pipelineSettings: ReturnType<typeof usePipelineSettings>['pipelineSettings']
  creditSettings: ReturnType<typeof usePipelineSettings>['creditSettings']
}

function ActorScope({
  stage,
  channelId,
  projectId,
  initialStageResults,
  pipelineSettings,
  creditSettings,
  onStageComplete,
  children,
}: ActorScopeProps) {
  const [, , actorRef] = useMachine(pipelineMachine, {
    input: {
      projectId: projectId ?? `standalone-${stage}`,
      channelId,
      projectTitle: '',
      pipelineSettings,
      creditSettings,
      initialStageResults,
    },
  })

  // Park the actor at the requested stage once after spawn. Brainstorm is the
  // machine default, so no NAVIGATE needed.
  const navigatedRef = useRef(false)
  useEffect(() => {
    if (navigatedRef.current) return
    navigatedRef.current = true
    if (stage !== 'brainstorm') {
      actorRef.send({ type: 'NAVIGATE', toStage: stage })
    }
  }, [stage, actorRef])

  // Fire onStageComplete the first time the requested stage's result lands in
  // context, then unsubscribe. Subscribe first, then check the current snapshot
  // to avoid a race where the child engine's effect fires before this effect
  // (child effects run before parent effects in React).
  const firedRef = useRef(false)
  useEffect(() => {
    const sub = actorRef.subscribe((snap) => {
      if (firedRef.current) return
      const result = snap.context.stageResults[stage]
      if (result) {
        firedRef.current = true
        onStageComplete(stage, result as unknown as Record<string, unknown>)
      }
    })
    // Check current snapshot after subscribing — handles the case where the
    // child engine already dispatched the completion event before this effect ran.
    if (!firedRef.current) {
      const result = actorRef.getSnapshot().context.stageResults[stage]
      if (result) {
        firedRef.current = true
        onStageComplete(stage, result as unknown as Record<string, unknown>)
      }
    }
    return () => sub.unsubscribe()
  }, [actorRef, stage, onStageComplete])

  return <PipelineActorProvider value={actorRef}>{children}</PipelineActorProvider>
}
