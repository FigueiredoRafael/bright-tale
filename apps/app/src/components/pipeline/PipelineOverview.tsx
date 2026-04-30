'use client'
import { PipelineDashboard } from './PipelineDashboard'
import type { PipelineStage } from '@/components/engines/types'
import type { ActivityEntry } from './LiveActivityLog'

interface PipelineOverviewProps {
  setShowEngine: (stage: string) => void
  onRedoFrom?: (stage: PipelineStage) => void
  activityLog: ActivityEntry[]
  onActivityLogChange: (entries: ActivityEntry[]) => void
}

export function PipelineOverview({
  setShowEngine,
  onRedoFrom,
  activityLog,
  onActivityLogChange,
}: PipelineOverviewProps) {
  return (
    <PipelineDashboard
      setShowEngine={setShowEngine}
      onRedoFrom={onRedoFrom}
      activityLog={activityLog}
      onActivityLogChange={onActivityLogChange}
    />
  )
}
