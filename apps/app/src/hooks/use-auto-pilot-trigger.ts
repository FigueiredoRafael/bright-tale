'use client'

import { useEffect, useRef } from 'react'
import { useOptionalProjectContext } from '@/components/pipeline/ProjectContextProvider'
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
 * Drives auto-pilot for an engine. Watches the ProjectContextProvider state
 * and invokes `fire()` exactly once per `(mode='supervised'|'overview', not
 * paused, canFire)` activation. Resets when the user pauses or `rearmKey`
 * changes (used for review-loop re-iteration).
 *
 * Slice 14.3: ctx-only path — xstate actor fallback removed.
 *   - When ProjectContextProvider is present, reads mode + paused from it.
 *     The host mounts engines at the correct stage, so "current stage" is
 *     always the engine's own stage.
 *   - When ProjectContextProvider is absent (e.g. StandaloneEngineHost with
 *     synthetic projectId, or tests without a provider), auto-pilot is a
 *     no-op — standalone engines are always manual.
 */
export function useAutoPilotTrigger({
  stage,
  canFire,
  fire,
  rearmKey,
}: AutoPilotTriggerOptions) {
  const projectCtx = useOptionalProjectContext()

  const mode = projectCtx?.context.mode ?? null
  const paused = projectCtx?.context.paused ?? false

  const firedRef = useRef<string | number | null>(null)

  useEffect(() => {
    if ((mode !== 'supervised' && mode !== 'overview') || paused) {
      firedRef.current = null
      return
    }
    const arm = rearmKey ?? '_default_'
    if (firedRef.current === arm) return
    if (!canFire()) return
    firedRef.current = arm
    void fire()
  }, [mode, paused, stage, rearmKey, canFire, fire])
}
