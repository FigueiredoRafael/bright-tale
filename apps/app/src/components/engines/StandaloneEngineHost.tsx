'use client'

import { useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { StandaloneProjectContextProvider } from '@/components/pipeline/ProjectContextProvider'
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
    <ContextScope
      stage={stage}
      channelId={channelId}
      projectId={projectId}
      initialStageResults={initialStageResults}
      pipelineSettings={pipelineSettings}
      creditSettings={creditSettings}
      onStageComplete={onStageComplete}
    >
      {children}
    </ContextScope>
  )
}

type ContextScopeProps = StandaloneEngineHostProps & {
  pipelineSettings: ReturnType<typeof usePipelineSettings>['pipelineSettings']
  creditSettings: ReturnType<typeof usePipelineSettings>['creditSettings']
}

function ContextScope({
  stage,
  channelId,
  projectId,
  initialStageResults,
  pipelineSettings,
  creditSettings,
  onStageComplete,
  children,
}: ContextScopeProps) {
  // Persist stageResults to the project's pipeline_state_json so the overview
  // can restore them if the user navigates away before clicking Continue.
  async function persistStageResult(result: Record<string, unknown>) {
    const pid = projectId
    if (!pid || pid.startsWith('standalone-')) return
    try {
      const res = await fetch(`/api/projects/${pid}`)
      const json = await res.json()
      const existing = (json.data?.pipeline_state_json ?? {}) as Record<string, unknown>
      const existingResults = (existing.stageResults ?? {}) as Record<string, unknown>
      await fetch(`/api/projects/${pid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipelineStateJson: {
            ...existing,
            stageResults: { ...existingResults, [stage]: result },
            currentStage: stage,
          },
        }),
      })
    } catch {
      // Non-fatal — the user can still continue; state just won't be in the overview.
    }
  }

  // Wrap onStageComplete to persist first, then notify the host.
  const onStageCompleteRef = useRef(onStageComplete)
  useEffect(() => { onStageCompleteRef.current = onStageComplete }, [onStageComplete])

  function handleStageComplete(completedStage: PipelineStage, result: Record<string, unknown>) {
    void persistStageResult(result).then(() => {
      onStageCompleteRef.current(completedStage, result)
    })
  }

  return (
    <StandaloneProjectContextProvider
      channelId={channelId}
      projectId={projectId ?? `standalone-${stage}`}
      initialStageResults={initialStageResults}
      pipelineSettings={pipelineSettings}
      creditSettings={creditSettings}
      onStageComplete={handleStageComplete}
    >
      {children}
    </StandaloneProjectContextProvider>
  )
}
