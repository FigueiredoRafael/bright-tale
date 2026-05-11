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

export type { PipelineStage }

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
  /** Transient per-stage in-flight metadata (isGenerating, activeSessionId, phase, …).
   *  Lives in the machine so it survives component remounts within the same session.
   *  Cleared automatically when a stage completes (saveStageResult) or is redone. */
  stageStatus: Partial<Record<PipelineStage, Record<string, unknown>>>
  iterationCount: number
  lastError: string | null
  pipelineSettings: PipelineSettings
  creditSettings: CreditSettings
  /** True when auto-pilot is halted; orchestrator effects skip while set. */
  paused: boolean
  /** Human-readable cause; null when not paused. */
  pauseReason: PauseReason | null
  /** Non-null when the user has drilled into a gate stage and the machine is
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

export type PipelineEvent =
  | { type: 'BRAINSTORM_COMPLETE'; result: BrainstormResult }
  | { type: 'RESEARCH_COMPLETE';   result: ResearchResult }
  | { type: 'DRAFT_COMPLETE';      result: DraftResult }
  | { type: 'REVIEW_COMPLETE';     result: ReviewResult }
  | { type: 'ASSETS_COMPLETE';     result: AssetsResult }
  | { type: 'PREVIEW_COMPLETE';    result: PreviewResult }
  | { type: 'PUBLISH_COMPLETE';    result: PublishResult }
  | { type: 'STAGE_ERROR';         error: string }
  | { type: 'STAGE_PROGRESS';      stage: PipelineStage; partial: Record<string, unknown> }
  | { type: 'STAGE_STATUS';        stage: PipelineStage; status: Record<string, unknown> }
  // Substate lifecycle signals — fired by engines to drive compound-state transitions.
  // Add a `<STAGE>_STARTED` (and any phase signals) here when introducing substates for a stage.
  | { type: 'RESEARCH_STARTED' }
  | { type: 'RESEARCH_GENERATED' }
  | { type: 'ASSETS_BRIEFS_STARTED' }
  | { type: 'ASSETS_BRIEFS_COMPLETE' }
  | { type: 'ASSETS_IMAGES_STARTED' }
  | { type: 'RETRY' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'NAVIGATE';            toStage: PipelineStage }
  | { type: 'REDO_FROM';           fromStage: PipelineStage }
  | { type: 'SET_PROJECT_TITLE';   title: string }
  | { type: 'SETUP_COMPLETE';      mode: 'step-by-step' | 'supervised' | 'overview'; autopilotConfig: AutopilotConfig | null; templateId: string | null; startStage: PipelineStage }
  | { type: 'RESET_TO_SETUP' }
  | { type: 'GO_AUTOPILOT';        mode: 'supervised' | 'overview'; autopilotConfig: AutopilotConfig }
  | { type: 'REQUEST_ABORT' }
  | { type: 'ASSETS_GATE_TRIGGERED' }
  | { type: 'PREVIEW_GATE_TRIGGERED' }
  | { type: 'CONTINUE_AUTOPILOT' }
  | { type: 'STOP_AUTOPILOT' }
