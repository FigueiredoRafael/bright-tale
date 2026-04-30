'use client'

import { useEffect, useRef, useState } from 'react'
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

  // Park the actor at the requested stage before children render. Machine
  // default is `setup`, so NAVIGATE is required even for brainstorm. Sent via
  // a useState lazy initializer so it fires exactly once, before child engines
  // mount — child useEffects fire before parent useEffects, so an effect-based
  // NAVIGATE would run too late for engines that dispatch on mount.
  useState(() => {
    actorRef.send({ type: 'NAVIGATE', toStage: stage })
    return null
  })

  // Persist stageResults to the project's pipeline_state_json so the overview
  // can restore them if the user navigates away before clicking Continue.
  async function persistStageResult(stageResults: Record<string, unknown>) {
    if (!projectId || projectId.startsWith('standalone-')) return
    try {
      const res = await fetch(`/api/projects/${projectId}`)
      const json = await res.json()
      const existing = (json.data?.pipeline_state_json ?? {}) as Record<string, unknown>
      const existingResults = (existing.stageResults ?? {}) as Record<string, unknown>
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipelineStateJson: {
            ...existing,
            stageResults: { ...existingResults, ...stageResults },
            currentStage: stage,
          },
        }),
      })
    } catch {
      // Non-fatal — the user can still continue; state just won't be in the overview.
    }
  }

  // Fire onStageComplete the first time the requested stage's result lands in
  // context, then unsubscribe. Subscribe first, then check the current snapshot
  // to avoid a race where the child engine's effect fires before this effect
  // (child effects run before parent effects in React).
  const firedRef = useRef(false)
  const onStageCompleteRef = useRef(onStageComplete)
  useEffect(() => { onStageCompleteRef.current = onStageComplete }, [onStageComplete])

  useEffect(() => {
    const sub = actorRef.subscribe((snap) => {
      if (firedRef.current) return
      const result = snap.context.stageResults[stage]
      if (result) {
        firedRef.current = true
        void persistStageResult(snap.context.stageResults as unknown as Record<string, unknown>).then(() => {
          onStageCompleteRef.current(stage, result as unknown as Record<string, unknown>)
        })
      }
    })
    // Check current snapshot after subscribing — handles the case where the
    // child engine already dispatched the completion event before this effect ran.
    if (!firedRef.current) {
      const snap = actorRef.getSnapshot()
      const result = snap.context.stageResults[stage]
      if (result) {
        firedRef.current = true
        void persistStageResult(snap.context.stageResults as unknown as Record<string, unknown>).then(() => {
          onStageCompleteRef.current(stage, result as unknown as Record<string, unknown>)
        })
      }
    }
    return () => sub.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorRef, stage, projectId])

  return <PipelineActorProvider value={actorRef}>{children}</PipelineActorProvider>
}
