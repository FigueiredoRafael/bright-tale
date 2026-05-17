'use client'

import { useEffect, useRef } from 'react'
import { useSelector } from '@xstate/react'
import { useOptionalPipelineActor } from './usePipelineActor'
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
 * Drives auto-pilot for an engine. Watches the machine state and invokes
 * `fire()` exactly once per `(stage active, mode='auto', not paused, canFire)`
 * activation. Resets when the user navigates away, pauses, or `rearmKey`
 * changes (used for review-loop re-iteration).
 *
 * Dual-path (Slice 14.1+):
 *   - When ProjectContextProvider is present in the tree, reads mode + paused
 *     from it and treats the stage as always current (host mounts engines at the
 *     right stage; no machine stage navigation in this path).
 *   - Otherwise falls back to the xstate actor (legacy path for engines still
 *     wrapped by StandaloneEngineHost / PipelineActorProvider).
 */
export function useAutoPilotTrigger({
  stage,
  canFire,
  fire,
  rearmKey,
}: AutoPilotTriggerOptions) {
  const projectCtx = useOptionalProjectContext()
  const actor = useOptionalPipelineActor()

  // useSelector accepts undefined actor — selector receives undefined snapshot in that case.
  // Using unknown with optional chaining avoids the no-explicit-any lint rule.
  const actorMode = useSelector(actor ?? undefined, (s: unknown) => (s as { context?: { mode?: string | null } } | undefined)?.context?.mode)
  const actorPaused = useSelector(actor ?? undefined, (s: unknown) => (s as { context?: { paused?: boolean } } | undefined)?.context?.paused)
  const actorStateValue = useSelector(actor ?? undefined, (s: unknown) => (s as { value?: unknown } | undefined)?.value)

  // ProjectContextProvider takes precedence over actor when both are present
  const mode = projectCtx ? projectCtx.context.mode : actorMode
  const paused = projectCtx ? projectCtx.context.paused : (actorPaused ?? false)

  // In the context path, "current stage" is always the engine's own stage —
  // ProjectContextProvider has no stage navigation concept; the host mounts
  // each engine at the correct stage. In the actor path, the state value is
  // the current stage name.
  const currentStage = projectCtx
    ? stage
    : (typeof actorStateValue === 'string'
        ? actorStateValue
        : actorStateValue != null
          ? Object.keys(actorStateValue as object)[0]
          : stage)

  const firedRef = useRef<string | number | null>(null)

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
