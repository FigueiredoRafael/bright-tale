'use client'

import { useState } from 'react'
import {
  Lightbulb, Search, FileText, CheckCircle, Image, Eye, Globe,
  Loader2, Check, Minus, CircleDashed, ChevronDown, ChevronUp,
  Activity,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { PIPELINE_STAGES } from '@/components/engines/types'
import type { PipelineStage } from '@/components/engines/types'
import type { StageResultMap } from '@/lib/pipeline/machine.types'
import type { AutopilotConfig } from '@brighttale/shared'
import type { ActivityEntry } from './LiveActivityLog'

// ── Stage metadata ────────────────────────────────────────────────────────────

export const STAGE_ICON: Record<PipelineStage, typeof Lightbulb> = {
  brainstorm: Lightbulb,
  research:   Search,
  draft:      FileText,
  review:     CheckCircle,
  assets:     Image,
  preview:    Eye,
  publish:    Globe,
}

export const STAGE_LABEL: Record<PipelineStage, string> = {
  brainstorm: 'Brainstorm',
  research:   'Research',
  draft:      'Draft',
  review:     'Review',
  assets:     'Assets',
  preview:    'Preview',
  publish:    'Publish',
}

export type RailStageStatus = 'queued' | 'running' | 'done' | 'paused' | 'failed' | 'skipped'

// ── Status pill ───────────────────────────────────────────────────────────────

interface StatusPillProps {
  status: RailStageStatus
  className?: string
}

export function StatusPill({ status, className }: StatusPillProps) {
  const map: Record<RailStageStatus, { label: string; className: string }> = {
    queued:  { label: 'Queued',  className: 'border-border/60 text-muted-foreground bg-muted/30' },
    running: { label: 'Running', className: 'border-primary/40 text-primary bg-primary/10 animate-pulse' },
    done:    { label: 'Done',    className: 'border-green-500/40 text-green-600 dark:text-green-400 bg-green-500/10' },
    paused:  { label: 'Paused', className: 'border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10' },
    failed:  { label: 'Failed', className: 'border-destructive/40 text-destructive bg-destructive/10' },
    skipped: { label: 'Skipped', className: 'border-border/40 text-muted-foreground/60 bg-muted/20' },
  }
  const { label, className: cls } = map[status]
  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] px-1.5 py-0 h-4 font-medium', cls, className)}
    >
      {label}
    </Badge>
  )
}

// ── Derive status from machine state ─────────────────────────────────────────

const STAGE_ORDER: ReadonlyArray<PipelineStage> = [
  'brainstorm',
  'research',
  'draft',
  'review',
  'assets',
  'preview',
  'publish',
]

export function deriveRailStatus(
  stage: PipelineStage,
  currentStage: PipelineStage,
  stageResults: StageResultMap,
  paused: boolean,
  subState: string,
  autopilotConfig: AutopilotConfig | null,
): RailStageStatus {
  const r = stageResults[stage] as { completedAt?: string; skipped?: boolean } | undefined

  if (r?.completedAt) return 'done'

  // Explicitly skipped stages
  if (stage === 'review' && autopilotConfig?.review.maxIterations === 0) return 'skipped'
  if (stage === 'assets' && autopilotConfig?.assets.mode === 'skip') return 'skipped'

  if (stage === currentStage) {
    if (subState === 'error') return 'failed'
    if (paused || subState === 'paused') return 'paused'
    return 'running'
  }

  // Gap-fill: downstream completed → this stage's work definitely happened
  // (Review/Publish can't pass without Research). It just wasn't tracked by
  // this orchestrator — likely done via the channel-level Research/Draft
  // pages. Show as `done` (not `skipped`) so the rail is semantically
  // honest. The panel renders an "outside the engine" empty state.
  const myIdx = STAGE_ORDER.indexOf(stage)
  for (let i = myIdx + 1; i < STAGE_ORDER.length; i++) {
    const downstream = stageResults[STAGE_ORDER[i]] as { completedAt?: string } | undefined
    if (downstream?.completedAt) return 'done'
  }

  return 'queued'
}

// ── Progress hint ─────────────────────────────────────────────────────────────

function deriveProgressHint(
  stage: PipelineStage,
  stageResults: StageResultMap,
  subState: string,
): string | undefined {
  const r = stageResults[stage] as Record<string, unknown> | undefined
  if (!r) return undefined
  if (typeof r.status === 'string') return r.status
  if (stage === 'review' && typeof r.iterationCount === 'number' && r.iterationCount > 0) {
    return `Iteration ${r.iterationCount}`
  }
  if (typeof r.current === 'number' && typeof r.total === 'number' && r.total > 0) {
    return `${r.current}/${r.total}`
  }
  if (subState === 'reproducing') return 'Applying feedback…'
  if (subState === 'reviewing') return 'Reviewing…'
  return undefined
}

// ── Stage button row ──────────────────────────────────────────────────────────

interface StageButtonProps {
  stage: PipelineStage
  status: RailStageStatus
  isSelected: boolean
  progressHint?: string
  onClick: () => void
}

function StageButton({ stage, status, isSelected, progressHint, onClick }: StageButtonProps) {
  const Icon = STAGE_ICON[stage]
  const StatusIcon =
    status === 'done'    ? Check
    : status === 'running' ? Loader2
    : status === 'skipped' ? Minus
    : CircleDashed

  return (
    <button
      type="button"
      data-testid={`rail-stage-${stage}`}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all text-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected
          ? 'bg-primary/10 text-primary font-medium border border-primary/20'
          : 'text-foreground hover:bg-muted/60 border border-transparent',
      )}
      aria-current={isSelected ? 'step' : undefined}
    >
      {/* Stage icon */}
      <Icon className={cn('h-4 w-4 shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')} />

      {/* Label + hint */}
      <span className="flex-1 min-w-0">
        <span className="block truncate">{STAGE_LABEL[stage]}</span>
        {progressHint && status === 'running' && (
          <span className="block text-[10px] text-muted-foreground truncate">{progressHint}</span>
        )}
      </span>

      {/* Status indicator */}
      <span className="shrink-0 flex items-center">
        {status === 'done' && (
          <StatusIcon className="h-3.5 w-3.5 text-green-500 dark:text-green-400" />
        )}
        {status === 'running' && (
          <StatusIcon className="h-3.5 w-3.5 text-primary animate-spin" />
        )}
        {status === 'skipped' && (
          <StatusIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
        )}
        {(status === 'queued' || status === 'paused' || status === 'failed') && (
          <StatusPill status={status} />
        )}
      </span>
    </button>
  )
}

// ── Activity log (collapsed by default) ──────────────────────────────────────

interface ActivityLogSectionProps {
  entries: ActivityEntry[]
}

function ActivityLogSection({ entries }: ActivityLogSectionProps) {
  const [open, setOpen] = useState(false)

  if (entries.length === 0) return null

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          data-testid="activity-log-toggle"
          className="w-full flex items-center justify-between px-3 py-2 h-auto text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            Activity
          </span>
          <span className="flex items-center gap-1.5">
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-4"
              data-testid="activity-log-count"
            >
              {entries.length}
            </Badge>
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          data-testid="activity-log-entries"
          className="px-3 pb-2 space-y-1 max-h-48 overflow-y-auto"
        >
          {[...entries].reverse().map((e, i) => (
            <div key={`${e.timestamp}-${i}`} className="flex gap-2 text-[11px]">
              <span className="text-muted-foreground/70 shrink-0 tabular-nums">
                {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-muted-foreground">{e.text}</span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ── StageRail ─────────────────────────────────────────────────────────────────

interface StageRailProps {
  currentStage: PipelineStage
  stageResults: StageResultMap
  paused: boolean
  subState: string
  autopilotConfig: AutopilotConfig | null
  selectedStage: PipelineStage
  activityLog: ActivityEntry[]
  onSelectStage: (stage: PipelineStage) => void
}

export function StageRail({
  currentStage,
  stageResults,
  paused,
  subState,
  autopilotConfig,
  selectedStage,
  activityLog,
  onSelectStage,
}: StageRailProps) {
  return (
    <div
      data-testid="stage-rail"
      className="flex flex-col gap-0.5 h-full"
    >
      <p className="px-3 mb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        Pipeline
      </p>

      <div className="flex flex-col gap-0.5 flex-1">
        {PIPELINE_STAGES.map((stage) => {
          const status = deriveRailStatus(
            stage, currentStage, stageResults, paused, subState, autopilotConfig,
          )
          const progressHint = status === 'running'
            ? deriveProgressHint(stage, stageResults, subState)
            : undefined

          return (
            <StageButton
              key={stage}
              stage={stage}
              status={status}
              isSelected={selectedStage === stage}
              progressHint={progressHint}
              onClick={() => onSelectStage(stage)}
            />
          )
        })}
      </div>

      {/* Activity log pinned at bottom */}
      <div className="mt-4 pt-3 border-t border-border/50">
        <ActivityLogSection entries={activityLog} />
      </div>
    </div>
  )
}
