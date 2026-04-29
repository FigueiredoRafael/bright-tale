import { PIPELINE_STAGES } from '@/components/engines/types'
import type { PauseReason, PipelineMachineInput, PipelineStage, StageResultMap } from './machine.types'

type LegacyMode = 'step-by-step' | 'auto'
type NewMode = 'step-by-step' | 'supervised' | 'overview' | null

const PAUSE_REASONS: readonly PauseReason[] = [
  'user_paused',
  'max_iterations',
  'rejected',
  'reproduce_error',
] as const

interface LegacyShape {
  mode?: LegacyMode | string
  currentStage?: string
  stageResults?: Record<string, unknown>
  autoConfig?: Record<string, unknown>
  iterationCount?: number
  paused?: unknown
  pauseReason?: unknown
}

export interface MigratedPipelineInput
  extends Pick<
    PipelineMachineInput,
    'mode' | 'initialStageResults' | 'initialIterationCount' | 'initialPaused' | 'initialPauseReason'
  > {
  /**
   * Stage the orchestrator should NAVIGATE to after spawning the machine.
   * Derived from legacy `currentStage` when present; otherwise from the
   * furthest completed stage (next un-done stage); otherwise `'brainstorm'`.
   */
  initialStage: PipelineStage
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function normalizeMode(mode: unknown): NewMode {
  if (mode === 'auto') return 'supervised'
  if (mode === 'step-by-step') return 'step-by-step'
  return null // 'step', unknown → null (setup-driven mode)
}

function isPipelineStage(s: unknown): s is PipelineStage {
  return typeof s === 'string' && (PIPELINE_STAGES as readonly string[]).includes(s)
}

function deriveInitialStage(currentStage: unknown, results: StageResultMap): PipelineStage {
  if (isPipelineStage(currentStage)) return currentStage
  // Find the furthest completed stage; the user should land on the NEXT stage.
  for (let i = PIPELINE_STAGES.length - 1; i >= 0; i--) {
    if (results[PIPELINE_STAGES[i]]) {
      return PIPELINE_STAGES[Math.min(i + 1, PIPELINE_STAGES.length - 1)]
    }
  }
  return 'brainstorm'
}

function looksLegacy(x: LegacyShape): boolean {
  return x.currentStage !== undefined || x.autoConfig !== undefined || x.mode === 'auto' || x.mode === 'step-by-step'
}

export function mapLegacyPipelineState(raw: unknown): MigratedPipelineInput | null {
  if (!raw || !isPlainObject(raw) || Object.keys(raw).length === 0) return null

  // Safe cast: all fields are validated by type guards and null checks before use.
  const input = raw as LegacyShape

  // stageResults must be an object if present
  if (input.stageResults !== undefined && !isPlainObject(input.stageResults)) {
    console.warn('pipeline.legacy_state.skipped: stageResults is not an object')
    return null
  }

  const mode = normalizeMode(input.mode)
  const stageResults = (input.stageResults ?? {}) as StageResultMap

  // Prefer explicit top-level iterationCount (new shape); fall back to review stage's embedded count (legacy shape).
  const iterationFromReview =
    (input.stageResults?.review as Record<string, unknown> | undefined)?.iterationCount
  const initialIterationCount =
    typeof input.iterationCount === 'number'
      ? input.iterationCount
      : typeof iterationFromReview === 'number'
        ? iterationFromReview
        : 0

  const initialStage = deriveInitialStage(input.currentStage, stageResults)
  const initialPaused = input.paused === true
  const initialPauseReason: PauseReason | null =
    typeof input.pauseReason === 'string' && (PAUSE_REASONS as readonly string[]).includes(input.pauseReason)
      ? (input.pauseReason as PauseReason)
      : null

  if (looksLegacy(input)) {
    try {
      if (typeof window !== 'undefined' && typeof (window as unknown as Record<string, unknown>).Sentry === 'object') {
        const sentry = (window as unknown as Record<string, unknown>).Sentry as Record<string, unknown>
        const addBreadcrumb = sentry.addBreadcrumb as ((opts: unknown) => void) | undefined
        if (addBreadcrumb) {
          addBreadcrumb({
            category: 'pipeline.legacy_state',
            level: 'info',
            message: 'Migrated legacy pipeline_state_json shape',
          })
        }
      }
    } catch {
      // Sentry not available or error calling addBreadcrumb — silently ignore
    }
  }

  return {
    mode,
    initialStageResults: stageResults,
    initialIterationCount,
    initialStage,
    initialPaused,
    initialPauseReason,
  }
}
