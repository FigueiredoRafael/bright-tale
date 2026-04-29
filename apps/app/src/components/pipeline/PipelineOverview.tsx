'use client'
import { useEffect, useState, useRef } from 'react'
import { useSelector } from '@xstate/react'
import { usePipelineActor } from '@/hooks/usePipelineActor'
import { OverviewTimeline, STAGE_LABEL } from './OverviewTimeline'
import { LiveActivityLog, type ActivityEntry } from './LiveActivityLog'
import type { PipelineStage } from '@/components/engines/types'

interface PipelineOverviewProps { setShowEngine: (stage: string) => void }

export function PipelineOverview({ setShowEngine }: PipelineOverviewProps) {
  const actor = usePipelineActor()
  const stateValue = useSelector(actor, (s) => s.value)
  const stageResults = useSelector(actor, (s) => s.context.stageResults as Record<string, unknown>)
  const lastStageRef = useRef<PipelineStage | null>(null)
  const [activity, setActivity] = useState<ActivityEntry[]>([])

  const currentStage = (typeof stateValue === 'string' ? stateValue : Object.keys(stateValue as Record<string, unknown>)[0]) as PipelineStage

  useEffect(() => {
    if (lastStageRef.current !== null && lastStageRef.current !== currentStage) {
      const completed = lastStageRef.current
      const r = stageResults[completed]
      if (r) {
        setActivity((a) => [...a, {
          timestamp: new Date().toISOString(),
          text: `${STAGE_LABEL[completed]} completed`,
        }])
      }
    }
    lastStageRef.current = currentStage
  }, [currentStage, stageResults])

  return (
    <div className="space-y-2">
      <OverviewTimeline setShowEngine={setShowEngine} />
      <LiveActivityLog entries={activity} />
    </div>
  )
}
