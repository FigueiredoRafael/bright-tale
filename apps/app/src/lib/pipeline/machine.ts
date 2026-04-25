import { setup, assign } from 'xstate'
import {
  PIPELINE_STAGES,
  DEFAULT_PIPELINE_SETTINGS,
  DEFAULT_CREDIT_SETTINGS,
} from '@/components/engines/types'
import { isApprovedGuard, isRejectedGuard, hasReachedMaxIterationsGuard } from './guards'
import { reproduceActor } from './actors'
import type {
  PipelineMachineContext,
  PipelineMachineInput,
  PipelineEvent,
  PipelineStage,
  StageResultMap,
} from './machine.types'

const saveStageResult = (stage: PipelineStage) =>
  assign(({ context, event }: { context: PipelineMachineContext; event: unknown }) => {
    const completedAt = new Date().toISOString()
    const eventWithResult = event as Extract<PipelineEvent, { result: unknown }>
    const baseResult = eventWithResult.result as unknown as Record<string, unknown>
    const stageResult =
      stage === 'review'
        ? { ...baseResult, iterationCount: context.iterationCount, completedAt }
        : { ...baseResult, completedAt }
    const stageResults: StageResultMap = {
      ...context.stageResults,
      [stage]: stageResult,
    }
    return { stageResults, lastError: null }
  })

const clearStrictlyAfterEvent = assign({
  stageResults: ({ context, event }: { context: PipelineMachineContext; event: unknown }) => {
    const e = event as Extract<PipelineEvent, { type: 'REDO_FROM' }>
    const fromIndex = PIPELINE_STAGES.indexOf(e.fromStage)
    if (fromIndex === -1) return context.stageResults
    const next: StageResultMap = { ...context.stageResults }
    PIPELINE_STAGES.slice(fromIndex + 1).forEach((s) => {
      delete next[s]
    })
    return next
  },
  iterationCount: ({ context, event }: { context: PipelineMachineContext; event: unknown }) => {
    const e = event as Extract<PipelineEvent, { type: 'REDO_FROM' }>
    const reviewIdx = PIPELINE_STAGES.indexOf('review')
    return PIPELINE_STAGES.indexOf(e.fromStage) < reviewIdx ? 0 : context.iterationCount
  },
})

export const pipelineMachine = setup({
  types: {
    context: {} as PipelineMachineContext,
    events: {} as PipelineEvent,
    input: {} as PipelineMachineInput,
  },
  guards: {
    isApproved: ({ context, event }: any) => isApprovedGuard({ context, event }),
    isRejected: ({ context, event }: any) => isRejectedGuard({ context, event }),
    hasReachedMaxIterations: ({ context }: any) => hasReachedMaxIterationsGuard({ context }),
    isAutoMode: ({ context }: any) => context.mode === 'auto',
    isStepMode: ({ context }: any) => context.mode === 'step',
  },
  actors: { reproduceActor },
  actions: {
    saveBrainstormResult: saveStageResult('brainstorm') as any,
    saveResearchResult: saveStageResult('research') as any,
    saveDraftResult: saveStageResult('draft') as any,
    saveReviewResult: saveStageResult('review') as any,
    saveAssetsResult: saveStageResult('assets') as any,
    savePreviewResult: saveStageResult('preview') as any,
    savePublishResult: saveStageResult('publish') as any,
    mergeStageProgress: assign({
      stageResults: ({ context, event }: { context: PipelineMachineContext; event: unknown }) => {
        const e = event as Extract<PipelineEvent, { type: 'STAGE_PROGRESS' }>
        if (!PIPELINE_STAGES.includes(e.stage)) return context.stageResults
        const existing = (context.stageResults[e.stage] ?? {}) as Record<string, unknown>
        return {
          ...context.stageResults,
          [e.stage]: { ...existing, ...e.partial },
        }
      },
    }) as any,
    clearStrictlyAfter: clearStrictlyAfterEvent as any,
    toggleMode: assign({
      mode: ({ context }: any) => (context.mode === 'auto' ? 'step' : 'auto'),
    }) as any,
    setProjectTitle: assign({
      projectTitle: ({ event }: any) => {
        const e = event as Extract<PipelineEvent, { type: 'SET_PROJECT_TITLE' }>
        return e.title
      },
    }) as any,
    incrementIteration: assign({
      iterationCount: ({ context }: any) => context.iterationCount + 1,
    }) as any,
    recordError: assign({
      lastError: ({ event }: any) => {
        const e = event as Extract<PipelineEvent, { type: 'STAGE_ERROR' }>
        return e.error
      },
    }) as any,
    clearError: assign({ lastError: () => null }) as any,
    recordActorError: assign({
      lastError: ({ event }: any) => {
        const err = (event as { error?: unknown }).error
        if (err instanceof Error) return err.message
        if (typeof err === 'string') return err
        return 'Unknown error'
      },
    }) as any,
  },
}).createMachine({
  id: 'pipeline',
  context: ({ input }) => ({
    projectId: input.projectId,
    channelId: input.channelId,
    projectTitle: input.projectTitle,
    mode: input.mode ?? 'step',
    stageResults: input.initialStageResults ?? {},
    iterationCount: input.initialIterationCount ?? 0,
    lastError: null,
    pipelineSettings: input.pipelineSettings ?? DEFAULT_PIPELINE_SETTINGS,
    creditSettings: input.creditSettings ?? DEFAULT_CREDIT_SETTINGS,
  }),
  initial: 'brainstorm',
  on: {
    TOGGLE_AUTO_PILOT: { actions: 'toggleMode' },
    SET_PROJECT_TITLE: { actions: 'setProjectTitle' },
    STAGE_PROGRESS: { actions: 'mergeStageProgress' },
    NAVIGATE: [
      { guard: ({ event }) => (event as Extract<PipelineEvent, { type: 'NAVIGATE' }>).toStage === 'brainstorm', target: '.brainstorm' },
      { guard: ({ event }) => (event as Extract<PipelineEvent, { type: 'NAVIGATE' }>).toStage === 'research', target: '.research' },
      { guard: ({ event }) => (event as Extract<PipelineEvent, { type: 'NAVIGATE' }>).toStage === 'draft', target: '.draft' },
      { guard: ({ event }) => (event as Extract<PipelineEvent, { type: 'NAVIGATE' }>).toStage === 'review', target: '.review' },
      { guard: ({ event }) => (event as Extract<PipelineEvent, { type: 'NAVIGATE' }>).toStage === 'assets', target: '.assets' },
      { guard: ({ event }) => (event as Extract<PipelineEvent, { type: 'NAVIGATE' }>).toStage === 'preview', target: '.preview' },
      { guard: ({ event }) => (event as Extract<PipelineEvent, { type: 'NAVIGATE' }>).toStage === 'publish', target: '.publish' },
    ],
    REDO_FROM: [
      {
        guard: ({ event }) => (event as Extract<PipelineEvent, { type: 'REDO_FROM' }>).fromStage === 'brainstorm',
        target: '.brainstorm',
        actions: 'clearStrictlyAfter',
      },
      {
        guard: ({ event }) => (event as Extract<PipelineEvent, { type: 'REDO_FROM' }>).fromStage === 'research',
        target: '.research',
        actions: 'clearStrictlyAfter',
      },
      {
        guard: ({ event }) => (event as Extract<PipelineEvent, { type: 'REDO_FROM' }>).fromStage === 'draft',
        target: '.draft',
        actions: 'clearStrictlyAfter',
      },
      {
        guard: ({ event }) => (event as Extract<PipelineEvent, { type: 'REDO_FROM' }>).fromStage === 'review',
        target: '.review',
        actions: 'clearStrictlyAfter',
      },
      {
        guard: ({ event }) => (event as Extract<PipelineEvent, { type: 'REDO_FROM' }>).fromStage === 'assets',
        target: '.assets',
        actions: 'clearStrictlyAfter',
      },
      {
        guard: ({ event }) => (event as Extract<PipelineEvent, { type: 'REDO_FROM' }>).fromStage === 'preview',
        target: '.preview',
        actions: 'clearStrictlyAfter',
      },
    ],
  },
  states: {
    brainstorm: {
      initial: 'idle',
      states: {
        idle: {},
        error: { on: { RETRY: { target: 'idle', actions: 'clearError' } } },
      },
      on: {
        BRAINSTORM_COMPLETE: { target: 'research', actions: 'saveBrainstormResult' },
        STAGE_ERROR: { target: '.error', actions: 'recordError' },
      },
    },
    research: {
      initial: 'idle',
      states: {
        idle: {},
        error: { on: { RETRY: { target: 'idle', actions: 'clearError' } } },
      },
      on: {
        RESEARCH_COMPLETE: { target: 'draft', actions: 'saveResearchResult' },
        STAGE_ERROR: { target: '.error', actions: 'recordError' },
      },
    },
    draft: {
      initial: 'idle',
      states: {
        idle: {},
        error: { on: { RETRY: { target: 'idle', actions: 'clearError' } } },
      },
      on: {
        DRAFT_COMPLETE: { target: 'review', actions: 'saveDraftResult' },
        STAGE_ERROR: { target: '.error', actions: 'recordError' },
      },
    },
    review: {
      initial: 'idle',
      states: {
        idle: { on: { RESUME: { target: 'reviewing' } } },
        reviewing: {
          entry: 'incrementIteration',
          on: {
            REVIEW_COMPLETE: [
              { guard: 'isApproved', target: '#pipeline.assets', actions: 'saveReviewResult' },
              { guard: 'isRejected', target: 'paused', actions: 'saveReviewResult' },
              { guard: 'hasReachedMaxIterations', target: 'paused', actions: 'saveReviewResult' },
              { target: 'reproducing', actions: 'saveReviewResult' },
            ],
            STAGE_ERROR: { target: 'error', actions: 'recordError' },
          },
        },
        reproducing: {
          invoke: {
            src: 'reproduceActor',
            input: ({ context }) => ({
              draftId: context.stageResults.draft?.draftId ?? '',
              feedbackJson: (context.stageResults.review?.feedbackJson ?? {}) as Record<string, unknown>,
            }),
            onDone: [{ guard: 'isAutoMode', target: 'reviewing' }, { target: 'idle' }],
            onError: { target: 'paused', actions: 'recordActorError' },
          },
        },
        paused: { on: { RESUME: { target: 'reviewing' } } },
        done: {},
        error: { on: { RETRY: { target: 'idle', actions: 'clearError' } } },
      },
    },
    assets: {
      initial: 'idle',
      states: {
        idle: {},
        error: { on: { RETRY: { target: 'idle', actions: 'clearError' } } },
      },
      on: {
        ASSETS_COMPLETE: { target: 'preview', actions: 'saveAssetsResult' },
        STAGE_ERROR: { target: '.error', actions: 'recordError' },
      },
    },
    preview: {
      initial: 'idle',
      states: {
        idle: {},
        error: { on: { RETRY: { target: 'idle', actions: 'clearError' } } },
      },
      on: {
        PREVIEW_COMPLETE: { target: 'publish', actions: 'savePreviewResult' },
        STAGE_ERROR: { target: '.error', actions: 'recordError' },
      },
    },
    publish: {
      initial: 'idle',
      states: {
        idle: {},
        done: { type: 'final' },
        error: { on: { RETRY: { target: 'idle', actions: 'clearError' } } },
      },
      on: {
        PUBLISH_COMPLETE: { target: '.done', actions: 'savePublishResult' },
        STAGE_ERROR: { target: '.error', actions: 'recordError' },
      },
    },
  },
})
