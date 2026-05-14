'use client'

import { useState, useEffect, useRef } from 'react'
import { useSelector } from '@xstate/react'
import { PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { usePipelineActor } from '@/hooks/usePipelineActor'
import { PIPELINE_STAGES } from '@/components/engines/types'
import { StageRail, STAGE_LABEL } from './StageRail'
import { StagePanelDetail } from './StagePanelDetail'
import type { PipelineStage } from '@/components/engines/types'
import type { StageResultMap } from '@/lib/pipeline/machine.types'
import type { AutopilotConfig } from '@brighttale/shared'
import type { ActivityEntry } from './LiveActivityLog'

// ─────────────────────────────────────────────────────────────────────────────

interface PipelineDashboardProps {
  /** Called when user clicks "Open engine" in the right panel. */
  setShowEngine: (stage: string) => void
  onRedoFrom?: (stage: PipelineStage) => void
  /** Persisted activity log — lifted from orchestrator so it survives reloads. */
  activityLog: ActivityEntry[]
  onActivityLogChange: (entries: ActivityEntry[]) => void
  onSkipAssets?: () => void
  onSwitchImageProvider?: (provider: 'openai' | 'gemini') => void
}

export function PipelineDashboard({
  setShowEngine,
  onRedoFrom,
  activityLog,
  onActivityLogChange,
  onSkipAssets,
  onSwitchImageProvider,
}: PipelineDashboardProps) {
  const actor = usePipelineActor()

  // XState selectors
  const stateValue = useSelector(actor, (s) => s.value)
  const stageResults = useSelector(
    actor, (s) => s.context.stageResults as StageResultMap,
  )
  const autopilotConfig = useSelector(
    actor, (s) => s.context.autopilotConfig as AutopilotConfig | null,
  )
  const paused = useSelector(actor, (s) => s.context.paused as boolean)
  const projectId = useSelector(actor, (s) => s.context.projectId as string)

  // ── Fallback "stage_runs has completed this stage" set ────────────────────
  // The xstate-driven `stageResults` can be empty (or sparse) while the DB
  // `stage_runs` table has terminal rows — happens when the project advanced
  // via v2/channel-page routes that write to stage_runs without round-tripping
  // through the legacy machine, or when a "Redo from start" wiped stageResults
  // but left stage_runs intact. Without this fallback the rail shows every
  // stage as Queued, which is plainly wrong.
  const [completedFromDb, setCompletedFromDb] = useState<Set<PipelineStage>>(new Set())
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/stages`)
        if (!res.ok) return
        const json = await res.json()
        const items = (json?.data?.stageRuns ?? []) as Array<{ stage: PipelineStage; status: string }>
        if (cancelled) return
        const next = new Set<PipelineStage>()
        for (const it of items) {
          if (it.status === 'completed') next.add(it.stage)
        }
        setCompletedFromDb(next)
      } catch {
        // non-fatal — rail just falls back to xstate-only view
      }
    })()
    return () => { cancelled = true }
  }, [projectId])

  const currentStage = (
    typeof stateValue === 'string'
      ? stateValue
      : Object.keys(stateValue as Record<string, unknown>)[0]
  ) as PipelineStage

  const subState =
    typeof stateValue === 'string'
      ? 'idle'
      : ((stateValue as Record<string, string>)[currentStage] ?? 'idle')

  // ── Selected stage (right panel) ─────────────────────────────────────────
  // Auto-follows the running stage by default; user can click to override.
  const [manualSelection, setManualSelection] = useState<PipelineStage | null>(null)
  const selectedStage = manualSelection ?? currentStage

  // When the live stage advances, clear manual selection so panel auto-follows.
  const prevCurrentStageRef = useRef(currentStage)
  useEffect(() => {
    if (prevCurrentStageRef.current !== currentStage) {
      prevCurrentStageRef.current = currentStage
      setManualSelection(null)
    }
  }, [currentStage])

  // ── Activity log: append entry when stage transitions ────────────────────
  const lastActivityStageRef = useRef<PipelineStage | null>(null)
  useEffect(() => {
    if (
      lastActivityStageRef.current !== null &&
      lastActivityStageRef.current !== currentStage
    ) {
      const completed = lastActivityStageRef.current
      const r = stageResults[completed] as { completedAt?: string } | undefined
      if (r?.completedAt) {
        onActivityLogChange([
          ...activityLog,
          {
            timestamp: new Date().toISOString(),
            text: `${STAGE_LABEL[completed]} completed`,
          },
        ])
      }
    }
    lastActivityStageRef.current = currentStage
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStage, stageResults])

  // ── Mobile sheet ──────────────────────────────────────────────────────────
  const [mobileOpen, setMobileOpen] = useState(false)

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleSelectStage(stage: PipelineStage) {
    setManualSelection(stage === currentStage ? null : stage)
    setMobileOpen(false)
  }

  function handleBackToLive() {
    setManualSelection(null)
  }

  // ── Shared rail + panel ───────────────────────────────────────────────────
  const rail = (
    <StageRail
      currentStage={currentStage}
      stageResults={stageResults}
      paused={paused}
      subState={subState}
      autopilotConfig={autopilotConfig}
      selectedStage={selectedStage}
      activityLog={activityLog}
      onSelectStage={handleSelectStage}
      completedFromStageRuns={completedFromDb}
    />
  )

  const panel = (
    <StagePanelDetail
      selectedStage={selectedStage}
      currentStage={currentStage}
      stageResults={stageResults}
      paused={paused}
      subState={subState}
      autopilotConfig={autopilotConfig}
      onOpenEngine={(stage) => {
        setManualSelection(null)
        setShowEngine(stage)
      }}
      onRedoFrom={onRedoFrom}
      onBackToLive={handleBackToLive}
      onSkipAssets={onSkipAssets}
      onSwitchImageProvider={onSwitchImageProvider}
      completedFromStageRuns={completedFromDb}
    />
  )

  return (
    <>
      {/* ── Desktop: two-column ───────────────────────────────────────────── */}
      <div
        data-testid="pipeline-dashboard"
        className="hidden md:grid md:grid-cols-[1fr_2.2fr] gap-0 min-h-[520px] rounded-xl border border-border/60 bg-card overflow-hidden"
      >
        {/* Left rail */}
        <div className="border-r border-border/60 p-4 bg-muted/20 overflow-y-auto">
          {rail}
        </div>
        {/* Right panel */}
        <div className="p-8 overflow-y-auto">
          {panel}
        </div>
      </div>

      {/* ── Mobile: full-width panel + drawer trigger ─────────────────────── */}
      <div className="md:hidden">
        {/* Mobile trigger row */}
        <div className="flex items-center gap-2 mb-4">
          <Button
            variant="outline"
            size="sm"
            data-testid="mobile-rail-trigger"
            className="gap-1.5 text-xs"
            onClick={() => setMobileOpen(true)}
          >
            <PanelLeft className="h-3.5 w-3.5" />
            Pipeline stages
          </Button>
          <span className="text-sm font-medium">{STAGE_LABEL[selectedStage]}</span>
        </div>

        {/* Mobile full-width panel */}
        <div
          data-testid="pipeline-dashboard-mobile"
          className="rounded-xl border border-border/60 bg-card p-6 min-h-[400px]"
        >
          {panel}
        </div>

        {/* Mobile Sheet (slides over content area, not the outer sidebar) */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          {/* side="left" to avoid conflicting with the outer app sidebar which is
              hidden on mobile (hidden md:flex). The sheet opens from the right
              so it clearly overlays only the content area. */}
          <SheetContent side="right" className="w-[280px] p-0 pt-12 overflow-y-auto">
            <div className="px-4 pb-6">
              {rail}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
