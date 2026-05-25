/**
 * Slice 14.6 — Pipeline types (extracted from machine.types.ts)
 *
 * Lightweight type file with no xstate imports.
 * Replaces machine.types.ts as the import source for PipelineStage,
 * StageResultMap, PauseReason, PipelineMachineContext, and PipelineMachineInput.
 */

import type { PipelineSettings, CreditSettings } from '@/components/engines/types'
import type {
  PipelineStage,
  BrainstormResult,
  ResearchResult,
  DraftResult,
  ReviewResult,
  AssetsResult,
  PreviewResult,
  PublishResult,
} from '@/components/engines/types'
import type { AutopilotConfig } from '@brighttale/shared'
import type { StageResultsByTrack } from './stage-results-by-track'

export type { PipelineStage }
export type { StageResultsByTrack }

export type StageResultMap = {
  brainstorm?: BrainstormResult & { completedAt: string }
  research?:   ResearchResult   & { completedAt: string }
  draft?:      DraftResult      & { completedAt: string }
  review?:     ReviewResult     & { completedAt: string }
  assets?:     AssetsResult     & { completedAt: string }
  preview?:    PreviewResult    & { completedAt: string }
  publish?:    PublishResult    & { completedAt: string }
}

export type PauseReason =
  | 'user_paused'
  | 'max_iterations'
  | 'rejected'
  | 'reproduce_error'

export interface PipelineMachineContext {
  projectId: string
  channelId: string | null
  projectTitle: string
  mode: 'step-by-step' | 'supervised' | 'overview' | null
  autopilotConfig: AutopilotConfig | null
  templateId: string | null
  stageResults: StageResultMap
  /** Issue #210 — per-track stage results.
   *  `shared` holds project-scoped stages (brainstorm, research). `tracks` is keyed
   *  by track UUID, with a legacy bucket (`__legacy__`) for runs missing trackId. */
  stageResultsByTrack: StageResultsByTrack
  /** Transient per-stage in-flight metadata (isGenerating, activeSessionId, phase, …).
   *  Lives in context so it survives component remounts within the same session.
   *  Cleared automatically when a stage completes or is redone. */
  stageStatus: Partial<Record<PipelineStage, Record<string, unknown>>>
  iterationCount: number
  lastError: string | null
  pipelineSettings: PipelineSettings
  creditSettings: CreditSettings
  /** True when auto-pilot is halted; orchestrator effects skip while set. */
  paused: boolean
  /** Human-readable cause; null when not paused. */
  pauseReason: PauseReason | null
  /** Non-null when the user has drilled into a gate stage and the context is
   *  waiting for that engine to complete before prompting the return-to-overview
   *  dialog. */
  pendingDrillIn: 'assets' | 'preview' | null
  /** True after a drill-in COMPLETE fires; triggers the ConfirmReturnDialog. */
  returnPromptOpen: boolean
}

export interface PipelineMachineInput {
  projectId: string
  channelId: string | null
  projectTitle: string
  mode?: 'step-by-step' | 'supervised' | 'overview' | null
  autopilotConfig?: AutopilotConfig | null
  templateId?: string | null
  pipelineSettings: PipelineSettings
  creditSettings: CreditSettings
  initialStageResults?: StageResultMap
  initialIterationCount?: number
  initialPaused?: boolean
  initialPauseReason?: PauseReason | null
}
