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

  // Fire onStageComplete each time a NEW result lands for the requested stage.
  // Tracks the last result by reference so REDO_FROM (which clears the result)
  // resets the gate, allowing a second research run to also fire onStageComplete.
  const lastResultRef = useRef<unknown>(undefined)
  const onStageCompleteRef = useRef(onStageComplete)
  useEffect(() => { onStageCompleteRef.current = onStageComplete }, [onStageComplete])

  function handleResult(stageResults: Record<string, unknown>, result: unknown) {
    lastResultRef.current = result
    void persistStageResult(stageResults).then(() => {
      onStageCompleteRef.current(stage, result as Record<string, unknown>)
    })
  }

  useEffect(() => {
    const sub = actorRef.subscribe((snap) => {
      const result = snap.context.stageResults[stage]
      if (!result) {
        // Result cleared (REDO_FROM) — reset so next completion fires again.
        lastResultRef.current = undefined
        return
      }
      if (result === lastResultRef.current) return
      handleResult(snap.context.stageResults as unknown as Record<string, unknown>, result)
    })
    // Check current snapshot after subscribing to avoid a race where the child
    // engine dispatched completion before this effect ran.
    const snap = actorRef.getSnapshot()
    const result = snap.context.stageResults[stage]
    if (result && result !== lastResultRef.current) {
      handleResult(snap.context.stageResults as unknown as Record<string, unknown>, result)
    }
    return () => sub.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorRef, stage, projectId])

  return <PipelineActorProvider value={actorRef}>{children}</PipelineActorProvider>
}
