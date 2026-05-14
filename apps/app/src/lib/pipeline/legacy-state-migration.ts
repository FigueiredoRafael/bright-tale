import type { Snapshot } from 'xstate'
import { createActor } from 'xstate'
import {
  PIPELINE_STAGES,
  DEFAULT_PIPELINE_SETTINGS,
  DEFAULT_CREDIT_SETTINGS,
} from '@/components/engines/types'
import type {
  PauseReason,
  PipelineMachineInput,
  PipelineStage,
  StageResultMap,
} from './machine.types'
import { pipelineMachine } from './machine'
import type { PipelineMachineContext } from './machine.types'
import type { AutopilotConfig } from '@brighttale/shared'

type LegacyMode = 'step-by-step' | 'auto'
type NewMode = 'step-by-step' | 'supervised' | 'overview' | null

const PAUSE_REASONS: readonly PauseReason[] = [
  'user_paused',
  'max_iterations',
  'rejected',
  'reproduce_error',
] as const

interface LegacyShape {
  projectId?: unknown
  channelId?: unknown
  projectTitle?: unknown
  mode?: LegacyMode | string
  currentStage?: string
  stageResults?: Record<string, unknown>
  autoConfig?: Record<string, unknown>
  autopilotConfig?: Record<string, unknown>
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
  if (mode === 'overview') return 'overview'
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
  return (
    x.currentStage !== undefined ||
    x.autoConfig !== undefined ||
    x.mode === 'auto' ||
    x.mode === 'step' ||
    (x.stageResults !== undefined && Object.keys(x.stageResults as object).length > 0)
  )
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
  const iterationFromReview = (
    input.stageResults?.review as Record<string, unknown> | undefined
  )?.iterationCount
  const initialIterationCount =
    typeof input.iterationCount === 'number'
      ? input.iterationCount
      : typeof iterationFromReview === 'number'
        ? iterationFromReview
        : 0

  const initialStage = deriveInitialStage(input.currentStage, stageResults)
  const initialPaused = input.paused === true
  const initialPauseReason: PauseReason | null =
    typeof input.pauseReason === 'string' &&
    (PAUSE_REASONS as readonly string[]).includes(input.pauseReason)
      ? (input.pauseReason as PauseReason)
      : null

  if (looksLegacy(input)) {
    try {
      if (
        typeof window !== 'undefined' &&
        typeof (window as unknown as Record<string, unknown>).Sentry === 'object'
      ) {
        const sentry = (window as unknown as Record<string, unknown>)
          .Sentry as Record<string, unknown>
        const addBreadcrumb = sentry.addBreadcrumb as
          | ((opts: unknown) => void)
          | undefined
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

function migrateAssetsMode(legacy: string | undefined): 'skip' | 'briefs_only' | 'auto_generate' {
  switch (legacy) {
    case 'briefing':      return 'briefs_only'
    case 'auto':          return 'auto_generate'
    case 'manual':        return 'skip'
    case 'skip':          return 'skip'
    case 'briefs_only':   return 'briefs_only'
    case 'auto_generate': return 'auto_generate'
    default:              return 'skip'
  }
}

function migrateImageScope(raw: unknown): AutopilotConfig['assets']['imageScope'] {
  switch (raw) {
    case 'featured_only':
    case 'featured_and_conclusion':
      return raw
    default:
      return 'all'
  }
}

function migrateAutopilotConfig(raw: Record<string, unknown> | undefined): AutopilotConfig | null {
  if (!isPlainObject(raw)) return null
  const assets = isPlainObject(raw.assets) ? raw.assets : undefined
  return {
    ...(raw as unknown as AutopilotConfig),
    assets: {
      providerOverride: (assets?.providerOverride ?? null) as AutopilotConfig['assets']['providerOverride'],
      mode: migrateAssetsMode(typeof assets?.mode === 'string' ? assets.mode : undefined),
      imageScope: migrateImageScope(assets?.imageScope),
    },
    preview: isPlainObject(raw.preview)
      ? (raw.preview as AutopilotConfig['preview'])
      : { enabled: false },
    publish: isPlainObject(raw.publish)
      ? (raw.publish as AutopilotConfig['publish'])
      : { status: 'draft' },
  }
}

/**
 * Convert legacy pipeline state to an XState v5 snapshot for direct hydration.
 * When a project is restored with existing state, this snapshot boots the actor
 * at the saved stage without needing a setup transition.
 *
 * Returns null for empty or non-legacy inputs (caller uses input path instead).
 */
export interface LegacySnapshotMeta {
  projectId?: string
  channelId?: string | null
  projectTitle?: string
}

export function mapLegacyToSnapshot(
  raw: unknown,
  meta: LegacySnapshotMeta = {}
): (Snapshot<typeof pipelineMachine> & { context: PipelineMachineContext }) | null {
  if (!raw || !isPlainObject(raw)) return null

  const input = raw as LegacyShape

  // If it doesn't look legacy, let the input path handle it (caller will create fresh actor)
  if (!looksLegacy(input)) return null

  // Run the existing migration logic to normalize fields
  const migrated = mapLegacyPipelineState(raw)
  if (!migrated) return null

  // Prefer caller-supplied meta over raw input fields. Persisted
  // pipeline_state_json does NOT contain projectId/channelId/projectTitle —
  // those live on the projects row. The caller (orchestrator) sources them
  // from props and passes them via meta.
  const projectId =
    typeof meta.projectId === 'string' && meta.projectId.length > 0
      ? meta.projectId
      : typeof input.projectId === 'string' ? input.projectId : ''
  const channelId =
    meta.channelId !== undefined
      ? meta.channelId
      : typeof input.channelId === 'string' ? input.channelId : null
  const projectTitle =
    typeof meta.projectTitle === 'string' && meta.projectTitle.length > 0
      ? meta.projectTitle
      : typeof input.projectTitle === 'string' ? input.projectTitle : ''

  // Migrate legacy autopilotConfig if present, filling in new required slots.
  const autopilotConfig = migrateAutopilotConfig(input.autopilotConfig)

  // Build a machine input that represents the restored state.
  const machineInput: PipelineMachineInput = {
    projectId,
    channelId,
    projectTitle,
    pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
    creditSettings: DEFAULT_CREDIT_SETTINGS,
    mode: migrated.mode,
    autopilotConfig,
    templateId: null,
    initialStageResults: migrated.initialStageResults,
    initialIterationCount: migrated.initialIterationCount,
    initialPaused: migrated.initialPaused,
    initialPauseReason: migrated.initialPauseReason,
  }

  // Create a temporary actor to get a valid XState snapshot structure
  const tempActor = createActor(pipelineMachine, { input: machineInput })
  const baseSnapshot = tempActor.getSnapshot()

  // Reconstruct the snapshot with the restored stage value.
  // Pipeline stages are compound states with `initial: 'idle'`. The canonical
  // XState value at e.g. draft.idle is { draft: 'idle' }, not 'draft'. XState
  // auto-corrects on boot, but a malformed value breaks snapshot round-trips.
  const snapshotWithValue = {
    ...baseSnapshot,
    value: { [migrated.initialStage]: 'idle' } as Record<string, string>,
  }
  const snapshot = snapshotWithValue as unknown as Snapshot<typeof pipelineMachine> & {
    context: PipelineMachineContext
  }

  return snapshot
}
