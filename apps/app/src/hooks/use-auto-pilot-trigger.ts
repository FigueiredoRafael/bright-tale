'use client'

import { useEffect, useRef } from 'react'
import { useSelector } from '@xstate/react'
import { usePipelineActor } from './usePipelineActor'
import type { PipelineStage } from '@/components/engines/types'

interface AutoPilotTriggerOptions {
  /** Stage this engine represents — auto-fire only when it's the active stage. */
  stage: PipelineStage
  /**
   * Returns true when the engine has everything it needs to auto-fire (e.g.
   * topic filled, draft hydrated). When false, auto-pilot stays awaiting input.
   */
  canFire: () => boolean
  /** The action to invoke — usually the engine's primary "Run" handler. */
  fire: () => void | Promise<void>
  /**
   * Re-arms the trigger when this value changes. Use to allow re-firing across
   * a multi-iteration loop (e.g. ReviewEngine fires once per iteration; pass
   * `iterationCount` so each new iteration can fire again).
   */
  rearmKey?: string | number
}

/**
 * Drives auto-pilot for an engine. Watches the machine state and invokes
 * `fire()` exactly once per `(stage active, mode='auto', not paused, canFire)`
 * activation. Resets when the user navigates away, pauses, or `rearmKey`
 * changes (used for review-loop re-iteration).
 */
export function useAutoPilotTrigger({
  stage,
  canFire,
  fire,
  rearmKey,
}: AutoPilotTriggerOptions) {
  const actor = usePipelineActor()
  const mode = useSelector(actor, (s) => s.context.mode)
  const paused = useSelector(actor, (s) => s.context.paused)
  const stateValue = useSelector(actor, (s) => s.value)

  const firedRef = useRef<string | number | null>(null)

  const currentStage =
    typeof stateValue === 'string' ? stateValue : Object.keys(stateValue)[0]

  useEffect(() => {
    if ((mode !== 'supervised' && mode !== 'overview') || paused || currentStage !== stage) {
      firedRef.current = null
      return
    }
    const arm = rearmKey ?? '_default_'
    if (firedRef.current === arm) return
    if (!canFire()) return
    firedRef.current = arm
    void fire()
  }, [mode, paused, currentStage, stage, rearmKey, canFire, fire])
}
