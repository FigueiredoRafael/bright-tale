'use client'

import { usePipelineActor } from '@/hooks/usePipelineActor'
import type { AutopilotConfig } from '@brighttale/shared'
import type { StageResultMap } from '@/lib/pipeline/machine.types'
import type { PipelineStage } from '@/components/engines/types'
import { PIPELINE_STAGES } from '@/components/engines/types'
import { OverviewProgressRail } from './OverviewProgressRail'
import type { RailStage, StageStatus } from './OverviewProgressRail'
import { OverviewStageResults } from './OverviewStageResults'

// ─── Stage status derivation ──────────────────────────────────────────────────

function deriveStageStatus(
  stage: PipelineStage,
  stageResults: StageResultMap,
  autopilotConfig: AutopilotConfig | null,
  isPaused: boolean,
  currentStage: PipelineStage | null,
): StageStatus {
  const result = stageResults[stage]
  const completed = Boolean(result && (result as { completedAt?: string }).completedAt)

  if (completed) return 'completed'

  // Review is skipped when maxIterations === 0
  if (stage === 'review' && autopilotConfig !== null && autopilotConfig.review.maxIterations === 0) {
    return 'skipped'
  }

  if (stage === currentStage) {
    return isPaused ? 'paused' : 'running'
  }

  return 'pending'
}

function extractStageFromMachineValue(value: unknown): PipelineStage | null {
  // XState v5 snapshot.value is `string | { [key: string]: StateValue }`.
  // Top-level pipeline states match PipelineStage names directly.
  const raw = typeof value === 'string'
    ? value
    : value && typeof value === 'object'
      ? Object.keys(value as Record<string, unknown>)[0]
      : null
  if (raw === null) return null
  return (PIPELINE_STAGES as readonly string[]).includes(raw) ? (raw as PipelineStage) : null
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PipelineOverviewProps {
  setShowEngine: (stage: string) => void
}

export function PipelineOverview({ setShowEngine }: PipelineOverviewProps) {
  const actor = usePipelineActor()
  const snapshot = actor.getSnapshot()

  const { stageResults, autopilotConfig, paused } = snapshot.context as {
    stageResults: StageResultMap
    autopilotConfig: AutopilotConfig | null
    paused: boolean
  }

  const currentStage = extractStageFromMachineValue(snapshot.value)

  const railStages: RailStage[] = PIPELINE_STAGES.map((stage) => ({
    name: stage,
    status: deriveStageStatus(stage, stageResults, autopilotConfig, Boolean(paused), currentStage),
  }))

  return (
    <div className="flex gap-6 items-start">
      {/* Left column — vertical progress rail */}
      <aside className="shrink-0 pt-1">
        <OverviewProgressRail stages={railStages} />
      </aside>

      {/* Right column — stage result cards */}
      <div className="flex-1 min-w-0">
        <OverviewStageResults
          stageResults={stageResults}
          autopilotConfig={autopilotConfig}
          setShowEngine={setShowEngine}
        />
      </div>
    </div>
  )
}
