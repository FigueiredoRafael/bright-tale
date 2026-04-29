'use client'

// ─── Stage status icons ───────────────────────────────────────────────────────
// ✓ completed  ◐ running  ○ pending  ⏸ paused  ✗ failed  ⊘ skipped

export type StageStatus =
  | 'completed'
  | 'running'
  | 'pending'
  | 'paused'
  | 'failed'
  | 'skipped'

export interface RailStage {
  name: string
  status: StageStatus
}

const STATUS_ICON: Record<StageStatus, string> = {
  completed: '✓',
  running:   '◐',
  pending:   '○',
  paused:    '⏸',
  failed:    '✗',
  skipped:   '⊘',
}

const STATUS_COLOR: Record<StageStatus, string> = {
  completed: 'text-green-600 dark:text-green-400',
  running:   'text-blue-600 dark:text-blue-400',
  pending:   'text-muted-foreground',
  paused:    'text-yellow-600 dark:text-yellow-400',
  failed:    'text-destructive',
  skipped:   'text-muted-foreground/60',
}

interface OverviewProgressRailProps {
  stages: ReadonlyArray<RailStage>
}

export function OverviewProgressRail({ stages }: OverviewProgressRailProps) {
  return (
    <nav aria-label="Pipeline progress" className="flex flex-col gap-1 min-w-[150px]">
      {stages.map((stage, idx) => (
        <div
          key={stage.name}
          className="flex items-center gap-2"
          data-testid={`rail-stage-${stage.name}`}
        >
          {/* Connector line above (skip for first item) */}
          {idx === 0 ? null : (
            <div className="absolute" aria-hidden="true" />
          )}

          {/* Icon + label */}
          <span
            className={`text-sm font-mono w-4 text-center select-none ${STATUS_COLOR[stage.status]}`}
            aria-label={`${stage.name}: ${stage.status}`}
          >
            {STATUS_ICON[stage.status]}
          </span>
          <span
            className={`text-sm capitalize ${
              stage.status === 'running'
                ? 'font-semibold text-foreground'
                : stage.status === 'pending' || stage.status === 'skipped'
                  ? 'text-muted-foreground'
                  : 'text-foreground'
            }`}
          >
            {stage.name}
          </span>
        </div>
      ))}
    </nav>
  )
}
