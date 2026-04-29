'use client'
import { Card, CardContent } from '@/components/ui/card'
import { usePipelineActor } from '@/hooks/usePipelineActor'
import { useSelector } from '@xstate/react'
import { PIPELINE_STAGES } from '@/components/engines/types'
import { StageRow, type StageRowState } from './StageRow'
import type { PipelineStage } from '@/components/engines/types'
import type { AutopilotConfig } from '@brighttale/shared'

export const STAGE_LABEL: Record<PipelineStage, string> = {
  brainstorm: 'Brainstorm',
  research:   'Research',
  draft:      'Draft',
  review:     'Review',
  assets:     'Assets',
  preview:    'Preview',
  publish:    'Publish',
}

interface OverviewTimelineProps { setShowEngine: (stage: string) => void }

export function OverviewTimeline({ setShowEngine }: OverviewTimelineProps) {
  const actor = usePipelineActor()
  const stageResults = useSelector(actor, (s) => s.context.stageResults as Record<string, unknown>)
  const autopilotConfig = useSelector(actor, (s) => s.context.autopilotConfig as AutopilotConfig | null)
  const paused = useSelector(actor, (s) => s.context.paused as boolean)
  const stateValue = useSelector(actor, (s) => s.value)
  const currentStage = (typeof stateValue === 'string' ? stateValue : Object.keys(stateValue as Record<string, unknown>)[0]) as PipelineStage

  const reviewSkipped = autopilotConfig?.review.maxIterations === 0
  const assetsSkipped = autopilotConfig?.assets.mode === 'skip'

  function deriveState(stage: PipelineStage): StageRowState {
    const r = stageResults[stage] as { completedAt?: string; skipped?: boolean } | undefined
    if (r?.completedAt) return 'completed'
    if (stage === 'review' && reviewSkipped) return 'skipped'
    if (stage === 'assets' && assetsSkipped) return 'skipped'
    if (stage === currentStage && !paused) return 'running'
    return 'pending'
  }

  function deriveSummary(stage: PipelineStage): string | undefined {
    const r = stageResults[stage] as Record<string, unknown> | undefined
    if (!r?.completedAt) return undefined
    switch (stage) {
      case 'brainstorm': return `${r.ideaTitle} (${r.ideaVerdict})`
      case 'research':   return `${r.approvedCardsCount} cards · ${r.researchLevel} depth`
      case 'draft':      return r.draftTitle as string
      case 'review':     return `Score ${r.score}/100 · ${r.iterationCount} iter`
      case 'assets':     return `${(r.assetIds as unknown[])?.length ?? 0} asset(s)`
      case 'preview':    return `${(r.categories as unknown[])?.length ?? 0} categories`
      case 'publish':    return `Published: ${r.wpStatus ?? 'draft'}`
      default: return undefined
    }
  }

  return (
    <Card data-testid="pipeline-overview">
      <CardContent className="py-4 px-5 space-y-1">
        <h3 className="text-sm font-semibold mb-2">Pipeline · {Object.keys(stageResults).length}/7 stages</h3>
        {PIPELINE_STAGES.map((stage) => {
          const state = deriveState(stage)
          const r = stageResults[stage] as Record<string, unknown> | undefined
          return (
            <StageRow
              key={stage}
              stage={stage}
              label={STAGE_LABEL[stage]}
              state={state}
              status={state === 'running' ? (r?.status as string | undefined) : undefined}
              current={state === 'running' ? (r?.current as number | undefined) : undefined}
              total={state === 'running' ? (r?.total as number | undefined) : undefined}
              detail={state === 'running' ? (r?.detail as string | undefined) : undefined}
              summary={deriveSummary(stage)}
              onOpenEngine={state === 'completed' ? () => setShowEngine(stage) : undefined}
            />
          )
        })}
      </CardContent>
    </Card>
  )
}
