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
  channelId: string
  projectTitle: string
  mode: 'step' | 'auto'
  stageResults: StageResultMap
  iterationCount: number
  lastError: string | null
  pipelineSettings: PipelineSettings
  creditSettings: CreditSettings
  /** True when auto-pilot is halted; orchestrator effects skip while set. */
  paused: boolean
  /** Human-readable cause; null when not paused. */
  pauseReason: PauseReason | null
}

export interface PipelineMachineInput {
  projectId: string
  channelId: string
  projectTitle: string
  mode?: 'step' | 'auto'
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
  | { type: 'RETRY' }
  | { type: 'TOGGLE_AUTO_PILOT' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'NAVIGATE';            toStage: PipelineStage }
  | { type: 'REDO_FROM';           fromStage: PipelineStage }
  | { type: 'SET_PROJECT_TITLE';   title: string }
