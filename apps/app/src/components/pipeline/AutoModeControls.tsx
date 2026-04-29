'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Pause, Play, Loader2, Hourglass } from 'lucide-react'
import type { PauseReason } from '@/lib/pipeline/machine.types'

interface AutoModeControlsProps {
  mode: 'step-by-step' | 'supervised' | 'overview' | null
  isPaused: boolean
  isWorking: boolean
  pauseReason: PauseReason | null
  onToggle: () => void
  onPause: () => void
  onResume: () => void
}

const PAUSE_REASON_LABEL: Record<PauseReason, string> = {
  user_paused: 'Paused by user',
  max_iterations: 'Max review iterations reached',
  rejected: 'Draft rejected',
  reproduce_error: 'Reproduce step failed',
}

export function AutoModeControls({
  mode,
  isPaused,
  isWorking,
  pauseReason,
  onToggle,
  onPause,
  onResume,
}: AutoModeControlsProps) {
  const isAuto = mode === 'supervised' || mode === 'overview'

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="auto-mode" className="text-xs text-muted-foreground">
          Step-by-step
        </Label>
        <Switch id="auto-mode" checked={isAuto} onCheckedChange={onToggle} />
        <Label htmlFor="auto-mode" className="text-xs text-muted-foreground">
          Auto-pilot
        </Label>
      </div>

      {isAuto && isPaused && (
        <>
          <Badge
            variant="outline"
            className="text-xs border-yellow-500/50 text-yellow-600"
            data-testid="autopilot-paused-badge"
          >
            Paused{pauseReason ? ` — ${PAUSE_REASON_LABEL[pauseReason]}` : ''}
          </Badge>
          <Button variant="outline" size="sm" onClick={onResume}>
            <Play className="h-3 w-3 mr-1" /> Resume
          </Button>
        </>
      )}

      {isAuto && !isPaused && isWorking && (
        <>
          <Badge
            variant="outline"
            className="text-xs border-blue-500/50 text-blue-600 gap-1"
            data-testid="autopilot-running-badge"
          >
            <Loader2 className="h-3 w-3 animate-spin" />
            Running…
          </Badge>
          <Button variant="outline" size="sm" onClick={onPause}>
            <Pause className="h-3 w-3 mr-1" /> Pause
          </Button>
        </>
      )}

      {isAuto && !isPaused && !isWorking && (
        <>
          <Badge
            variant="outline"
            className="text-xs border-muted-foreground/40 text-muted-foreground gap-1"
            data-testid="autopilot-awaiting-badge"
          >
            <Hourglass className="h-3 w-3" />
            Awaiting input
          </Badge>
          <Button variant="outline" size="sm" onClick={onPause}>
            <Pause className="h-3 w-3 mr-1" /> Pause
          </Button>
        </>
      )}
    </div>
  )
}
