'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { usePipelineActor } from '@/hooks/usePipelineActor'
import type { AutopilotConfig } from '@brighttale/shared'
import type { StageResultMap } from '@/lib/pipeline/machine.types'
import type { PipelineStage } from '@/components/engines/types'
import { PIPELINE_STAGES } from '@/components/engines/types'

// ─── Stage display labels ─────────────────────────────────────────────────────

const STAGE_LABEL: Record<PipelineStage, string> = {
  brainstorm: 'Brainstorm',
  research:   'Research',
  draft:      'Draft',
  review:     'Review',
  assets:     'Assets',
  preview:    'Preview',
  publish:    'Publish',
}

// ─── Summary derivation ───────────────────────────────────────────────────────

function getStageSummary(stage: PipelineStage, stageResults: StageResultMap): string {
  switch (stage) {
    case 'brainstorm': {
      const r = stageResults.brainstorm
      return r ? `${r.ideaTitle} (${r.ideaVerdict})` : ''
    }
    case 'research': {
      const r = stageResults.research
      return r ? `${r.approvedCardsCount} cards approved · ${r.researchLevel} depth` : ''
    }
    case 'draft': {
      const r = stageResults.draft
      return r ? r.draftTitle : ''
    }
    case 'review': {
      const r = stageResults.review
      return r ? `Score: ${r.score}/100 · ${r.verdict} · ${r.iterationCount} iteration(s)` : ''
    }
    case 'assets': {
      const r = stageResults.assets
      return r ? `${r.assetIds.length} asset(s)` : ''
    }
    case 'preview': {
      const r = stageResults.preview
      return r ? `${r.categories.length} categories · ${r.tags.length} tags` : ''
    }
    case 'publish': {
      const r = stageResults.publish
      return r ? `Published: ${r.publishedUrl}` : ''
    }
    default:
      return ''
  }
}

function isStageCompleted(stage: PipelineStage, stageResults: StageResultMap): boolean {
  const result = stageResults[stage]
  return Boolean(result && (result as { completedAt?: string }).completedAt)
}

// ─── Pause-gate panel ─────────────────────────────────────────────────────────

interface PauseGatePanelProps {
  score: number
  hardFailThreshold: number
  onPause: () => void
}

function PauseGatePanel({ score, hardFailThreshold, onPause }: PauseGatePanelProps) {
  return (
    <div
      role="alert"
      data-testid="pause-gate-panel"
      className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 space-y-2"
    >
      <p className="text-sm font-medium text-destructive">
        Review score ({score}/100) is below the hard-fail threshold ({hardFailThreshold}).
        Autopilot cannot continue automatically.
      </p>
      <Button
        variant="destructive"
        size="sm"
        onClick={onPause}
      >
        Pause autopilot
      </Button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface OverviewStageResultsProps {
  stageResults: StageResultMap
  autopilotConfig: AutopilotConfig | null
  setShowEngine: (stage: string) => void
}

export function OverviewStageResults({
  stageResults,
  autopilotConfig,
  setShowEngine,
}: OverviewStageResultsProps) {
  const actor = usePipelineActor()

  const reviewSkipped = autopilotConfig !== null && autopilotConfig.review.maxIterations === 0

  const reviewResult = stageResults.review
  const showPauseGate =
    autopilotConfig !== null &&
    reviewResult !== undefined &&
    typeof reviewResult.score === 'number' &&
    reviewResult.score < autopilotConfig.review.hardFailThreshold

  function handlePause() {
    actor.send({ type: 'REQUEST_ABORT' })
  }

  return (
    <div className="flex flex-col gap-3">
      {showPauseGate && reviewResult && typeof reviewResult.score === 'number' && autopilotConfig && (
        <PauseGatePanel
          score={reviewResult.score}
          hardFailThreshold={autopilotConfig.review.hardFailThreshold}
          onPause={handlePause}
        />
      )}

      {PIPELINE_STAGES.map((stage) => {
        const completed = isStageCompleted(stage, stageResults)
        const summary = getStageSummary(stage, stageResults)
        const label = STAGE_LABEL[stage]
        const isSkipped = stage === 'review' && reviewSkipped

        return (
          <Card
            key={stage}
            data-testid={`stage-card-${stage}`}
            className={
              completed
                ? 'border-green-500/30 bg-green-500/5'
                : isSkipped
                  ? 'border-muted/40 bg-muted/5 opacity-60'
                  : 'border-border'
            }
          >
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{label}</span>

                {completed && (
                  <Badge
                    variant="outline"
                    className="text-[10px] border-green-500/50 text-green-600 dark:text-green-400"
                  >
                    Done
                  </Badge>
                )}

                {isSkipped && (
                  <Badge variant="secondary" className="text-[10px]">
                    Skipped
                  </Badge>
                )}

                {completed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 px-2 text-xs"
                    onClick={() => setShowEngine(stage)}
                  >
                    Open {label} engine →
                  </Button>
                )}
              </div>

              {summary && (
                <p className="mt-1 text-xs text-muted-foreground">{summary}</p>
              )}

              {!completed && !isSkipped && (
                <p className="mt-1 text-xs text-muted-foreground italic">Pending…</p>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
