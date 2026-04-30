'use client'
import { PipelineDashboard } from './PipelineDashboard'
import type { PipelineStage } from '@/components/engines/types'
import type { ActivityEntry } from './LiveActivityLog'

interface PipelineOverviewProps {
  setShowEngine: (stage: string) => void
  onRedoFrom?: (stage: PipelineStage) => void
  activityLog: ActivityEntry[]
  onActivityLogChange: (entries: ActivityEntry[]) => void
  onSkipAssets?: () => void
  onSwitchImageProvider?: (provider: 'openai' | 'gemini') => void
}

export function PipelineOverview({
  setShowEngine,
  onRedoFrom,
  activityLog,
  onActivityLogChange,
  onSkipAssets,
  onSwitchImageProvider,
}: PipelineOverviewProps) {
  return (
    <PipelineDashboard
      setShowEngine={setShowEngine}
      onRedoFrom={onRedoFrom}
      activityLog={activityLog}
      onActivityLogChange={onActivityLogChange}
      onSkipAssets={onSkipAssets}
      onSwitchImageProvider={onSwitchImageProvider}
    />
  )
}
