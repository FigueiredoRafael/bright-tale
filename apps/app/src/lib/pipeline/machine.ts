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

const STAGE_TARGETS: Record<PipelineStage, string> = {
  brainstorm: 'brainstorm',
  research: 'research',
  draft: 'draft',
  review: 'review',
  assets: 'assets',
  preview: 'preview',
  publish: 'publish',
}

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
    isAutoMode: ({ context }: any) => context.mode === 'supervised' || context.mode === 'overview',
    startsAtBrainstorm: ({ event }: any) => event.startStage === 'brainstorm',
    startsAtResearch: ({ event }: any) => event.startStage === 'research',
    startsAtDraft: ({ event }: any) => event.startStage === 'draft',
    startsAtReview: ({ event }: any) => event.startStage === 'review',
    startsAtAssets: ({ event }: any) => event.startStage === 'assets',
    startsAtPreview: ({ event }: any) => event.startStage === 'preview',
    startsAtPublish: ({ event }: any) => event.startStage === 'publish',
    shouldSkipReview: ({ context }: any) => context.autopilotConfig?.review.maxIterations === 0,
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
    applySetup: assign(({ event }: any) => ({
      mode: event.mode,
      autopilotConfig: event.autopilotConfig,
      templateId: event.templateId,
    })) as any,
    setMode: assign({ mode: ({ event }: any) => event.mode }) as any,
    setAutopilotConfig: assign({ autopilotConfig: ({ event }: any) => event.autopilotConfig }) as any,
    clearAllResults: assign({
      stageResults: () => ({}),
      iterationCount: 0,
      mode: () => null,
      autopilotConfig: () => null,
      templateId: () => null,
      paused: () => false,
      pauseReason: () => null,
    }) as any,
    pauseAuto: assign({
      paused: () => true,
      pauseReason: ({ context }: any) =>
        (context.pauseReason ?? 'user_paused') as
          | 'user_paused'
          | 'max_iterations'
          | 'rejected'
          | 'reproduce_error',
    }) as any,
    resumeAuto: assign({
      paused: () => false,
      pauseReason: () => null,
    }) as any,
    setPauseReasonRejected: assign({
      paused: () => true,
      pauseReason: () => 'rejected' as const,
    }) as any,
    setPauseReasonMaxIter: assign({
      paused: () => true,
      pauseReason: () => 'max_iterations' as const,
    }) as any,
    setPauseReasonReproduceError: assign({
      paused: () => true,
      pauseReason: () => 'reproduce_error' as const,
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
    channelId: input.channelId ?? null,
    projectTitle: input.projectTitle,
    mode: input.mode ?? null,
    autopilotConfig: input.autopilotConfig ?? null,
    templateId: input.templateId ?? null,
    stageResults: input.initialStageResults ?? {},
    iterationCount: input.initialIterationCount ?? 0,
    lastError: null,
    pipelineSettings: input.pipelineSettings ?? DEFAULT_PIPELINE_SETTINGS,
    creditSettings: input.creditSettings ?? DEFAULT_CREDIT_SETTINGS,
    paused: input.initialPaused ?? false,
    pauseReason: input.initialPauseReason ?? null,
  }),
  initial: 'setup',
  on: {
    PAUSE: { actions: 'pauseAuto' },
    SET_PROJECT_TITLE: { actions: 'setProjectTitle' },
    STAGE_PROGRESS: { actions: 'mergeStageProgress' },
    RESET_TO_SETUP: { target: '.setup', actions: 'clearAllResults' },
    GO_AUTOPILOT: { actions: ['setMode', 'setAutopilotConfig'] },
    REQUEST_ABORT: { actions: 'pauseAuto' },
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
    setup: {
      on: {
        SETUP_COMPLETE: [
          { guard: 'startsAtBrainstorm', target: 'brainstorm', actions: 'applySetup' },
          { guard: 'startsAtResearch', target: 'research', actions: 'applySetup' },
          { guard: 'startsAtDraft', target: 'draft', actions: 'applySetup' },
          { guard: 'startsAtReview', target: 'review', actions: 'applySetup' },
          { guard: 'startsAtAssets', target: 'assets', actions: 'applySetup' },
          { guard: 'startsAtPreview', target: 'preview', actions: 'applySetup' },
          { guard: 'startsAtPublish', target: 'publish', actions: 'applySetup' },
        ],
      },
    },
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
        DRAFT_COMPLETE: [
          { guard: 'shouldSkipReview', target: 'assets', actions: 'saveDraftResult' },
          { target: 'review', actions: 'saveDraftResult' },
        ],
        STAGE_ERROR: { target: '.error', actions: 'recordError' },
      },
    },
    review: {
      initial: 'idle',
      states: {
        idle: { on: { RESUME: { target: 'reviewing', actions: 'resumeAuto' } } },
        reviewing: {
          entry: 'incrementIteration',
          on: {
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
            onError: {
              target: 'paused',
              actions: ['recordActorError', 'setPauseReasonReproduceError'],
            },
          },
        },
        paused: {
          on: { RESUME: { target: 'reviewing', actions: 'resumeAuto' } },
        },
        done: {},
        error: { on: { RETRY: { target: 'idle', actions: 'clearError' } } },
      },
      on: {
        REVIEW_COMPLETE: [
          { guard: 'isApproved', target: '#pipeline.assets', actions: 'saveReviewResult' },
          {
            guard: 'isRejected',
            target: '#pipeline.review.paused',
            actions: ['saveReviewResult', 'setPauseReasonRejected'],
          },
          {
            guard: 'hasReachedMaxIterations',
            target: '#pipeline.review.paused',
            actions: ['saveReviewResult', 'setPauseReasonMaxIter'],
          },
          { target: '#pipeline.review.reproducing', actions: 'saveReviewResult' },
        ],
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
