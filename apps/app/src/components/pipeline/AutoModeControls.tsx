'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Pause, Play, Loader2 } from 'lucide-react'

interface AutoModeControlsProps {
  mode: 'step' | 'auto'
  isPaused: boolean
  onToggle: () => void
  onPause: () => void
  onResume: () => void
}

export function AutoModeControls({
  mode,
  isPaused,
  onToggle,
  onPause,
  onResume,
}: AutoModeControlsProps) {
  const isAuto = mode === 'auto'

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
          <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-600">
            Paused
          </Badge>
          <Button variant="outline" size="sm" onClick={onResume}>
            <Play className="h-3 w-3 mr-1" /> Resume
          </Button>
        </>
      )}

      {isAuto && !isPaused && (
        <>
          <Badge variant="outline" className="text-xs border-blue-500/50 text-blue-600 gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Running…
          </Badge>
          <Button variant="outline" size="sm" onClick={onPause}>
            <Pause className="h-3 w-3 mr-1" /> Pause
          </Button>
        </>
      )}
    </div>
  )
}
