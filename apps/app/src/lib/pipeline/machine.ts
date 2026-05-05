import { setup, assign } from 'xstate'
import {
  PIPELINE_STAGES,
  DEFAULT_PIPELINE_SETTINGS,
  DEFAULT_CREDIT_SETTINGS,
} from '@/components/engines/types'
import { isApprovedGuard, isRejectedGuard, hasReachedMaxIterationsGuard, shouldSkipAssetsGuard } from './guards'
import { reproduceActor, abortRequester } from './actors'
import type { ReviewIterationSummary } from '@brighttale/shared'
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
    // Clear transient in-flight status for this stage now that it's complete.
    const stageStatus = { ...(context.stageStatus ?? {}), [stage]: undefined }
    return { stageResults, stageStatus, lastError: null }
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
  stageStatus: ({ context, event }: { context: PipelineMachineContext; event: unknown }) => {
    const e = event as Extract<PipelineEvent, { type: 'REDO_FROM' }>
    const fromIndex = PIPELINE_STAGES.indexOf(e.fromStage)
    if (fromIndex === -1) return context.stageStatus ?? {}
    const next = { ...(context.stageStatus ?? {}) }
    PIPELINE_STAGES.slice(fromIndex + 1).forEach((s) => {
      delete next[s as PipelineStage]
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
    shouldSkipAssets: ({ context }: any) => shouldSkipAssetsGuard({ context }),
    briefsOnly: ({ context }: any) => context.autopilotConfig?.assets?.mode === 'briefs_only',
  },
  actors: { reproduceActor, abortRequester },
  actions: {
    saveBrainstormResult: saveStageResult('brainstorm') as any,
    saveResearchResult: saveStageResult('research') as any,
    saveDraftResult: saveStageResult('draft') as any,
    saveReviewResult: assign(({ context, event }: { context: PipelineMachineContext; event: unknown }) => {
      const e = event as Extract<PipelineEvent, { type: 'REVIEW_COMPLETE' }>
      const result = e.result as { score: number; verdict: 'approved' | 'rejected' | 'needs_revision'; feedbackJson?: Record<string, unknown> }
      const completedAt = new Date().toISOString()
      const oneLineSummary = (result.feedbackJson?.summary as string | undefined)?.slice(0, 120)
        ?? `Score ${result.score}, ${result.verdict}`
      const prevIterations = (context.stageResults.review?.iterations as ReviewIterationSummary[] | undefined) ?? []
      const newIteration: ReviewIterationSummary = {
        iterationNum: context.iterationCount,
        score: result.score,
        verdict: result.verdict,
        oneLineSummary,
        timestamp: completedAt,
      }
      const stageResults: StageResultMap = {
        ...context.stageResults,
        review: {
          score: result.score,
          verdict: result.verdict,
          feedbackJson: result.feedbackJson ?? {},
          iterationCount: context.iterationCount,
          iterations: [...prevIterations, newIteration],
          latestFeedbackJson: result.feedbackJson ?? null,
          completedAt,
        },
      }
      return { stageResults, lastError: null }
    }) as any,
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
    mergeStageStatus: assign({
      stageStatus: ({ context, event }: { context: PipelineMachineContext; event: unknown }) => {
        const e = event as Extract<PipelineEvent, { type: 'STAGE_STATUS' }>
        if (!PIPELINE_STAGES.includes(e.stage)) return context.stageStatus ?? {}
        const existing = (context.stageStatus ?? {})[e.stage] ?? {}
        return {
          ...(context.stageStatus ?? {}),
          [e.stage]: { ...existing, ...e.status },
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
      stageStatus: () => ({}),
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
    setAssetsDrillIn: assign({ pendingDrillIn: () => 'assets' as const }) as any,
    setPreviewDrillIn: assign({ pendingDrillIn: () => 'preview' as const }) as any,
    clearDrillIn: assign({
      pendingDrillIn: () => null as null,
      returnPromptOpen: () => false,
    }) as any,
    openReturnPrompt: assign({ returnPromptOpen: () => true }) as any,
    flipToStepByStep: assign({
      mode: () => 'step-by-step' as const,
      pendingDrillIn: () => null as null,
      returnPromptOpen: () => false,
    }) as any,
    autoCompleteAssets: assign({
      stageResults: ({ context }: { context: PipelineMachineContext; event: unknown }) => ({
        ...context.stageResults,
        assets: {
          assetIds: [],
          skipped: true,
          completedAt: new Date().toISOString(),
        },
      }),
    }) as any,
    recordActorError: assign({
      lastError: ({ event }: any) => {
        const err = (event as { error?: unknown }).error
        if (err instanceof Error) return err.message
        if (typeof err === 'string') return err
        return 'Unknown error'
      },
    }) as any,
    spawnAbortRequester: ({ context, self }: any) => {
      // Fire-and-forget abort request via side effect in action.
      // XState v5 doesn't support spawn() in action handlers, so we use
      // a Promise-based approach that the actor system can observe.
      // The consuming component should set up an effect listener to handle
      // errors and send resumeAuto when the PATCH fails.
      fetch(`/api/projects/${context.projectId}/abort`, { method: 'PATCH' })
        .then((res) => {
          if (!res.ok) {
            // Send error event back to the machine
            const err = new Error('Failed to request abort')
            self.send({ type: 'xstate.error.actor.abortRequester', error: err } as any)
          }
        })
        .catch((err) => {
          // Network error
          self.send({ type: 'xstate.error.actor.abortRequester', error: err } as any)
        })
    },
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
    stageStatus: {},
    iterationCount: input.initialIterationCount ?? 0,
    lastError: null,
    pipelineSettings: input.pipelineSettings ?? DEFAULT_PIPELINE_SETTINGS,
    creditSettings: input.creditSettings ?? DEFAULT_CREDIT_SETTINGS,
    paused: input.initialPaused ?? false,
    pauseReason: input.initialPauseReason ?? null,
    pendingDrillIn: null,
    returnPromptOpen: false,
  }),
  initial: 'setup',
  on: {
    PAUSE: { actions: 'pauseAuto' },
    SET_PROJECT_TITLE: { actions: 'setProjectTitle' },
    STAGE_PROGRESS: { actions: 'mergeStageProgress' },
    STAGE_STATUS: { actions: 'mergeStageStatus' },
    RESET_TO_SETUP: { target: '.setup', actions: 'clearAllResults' },
    GO_AUTOPILOT: { actions: ['setMode', 'setAutopilotConfig'] },
    REQUEST_ABORT: { actions: ['pauseAuto', 'spawnAbortRequester'] },
    'xstate.error.actor.abortRequester': {
      actions: ['recordActorError', 'resumeAuto'],
    },
    ASSETS_GATE_TRIGGERED: { actions: 'setAssetsDrillIn' },
    PREVIEW_GATE_TRIGGERED: { actions: 'setPreviewDrillIn' },
    CONTINUE_AUTOPILOT: { actions: 'clearDrillIn' },
    STOP_AUTOPILOT: { actions: 'flipToStepByStep' },
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
        idle: { on: { RESUME: { actions: 'resumeAuto' } } },
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
        idle: { on: { RESUME: { actions: 'resumeAuto' } } },
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
        idle: { on: { RESUME: { actions: 'resumeAuto' } } },
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
        idle: {
          always: [
            {
              guard: 'shouldSkipAssets',
              target: '#pipeline.preview',
              actions: 'autoCompleteAssets',
            },
          ],
        },
        error: { on: { RETRY: { target: 'idle', actions: 'clearError' } } },
      },
      on: {
        RESUME: { actions: 'resumeAuto' },
        ASSETS_COMPLETE: [
          {
            guard: ({ context }: any) => context.pendingDrillIn === 'assets',
            target: 'preview',
            actions: ['saveAssetsResult', 'openReturnPrompt'],
          },
          { target: 'preview', actions: 'saveAssetsResult' },
        ],
        STAGE_ERROR: { target: '.error', actions: 'recordError' },
      },
    },
    preview: {
      initial: 'idle',
      states: {
        idle: { on: { RESUME: { actions: 'resumeAuto' } } },
        error: { on: { RETRY: { target: 'idle', actions: 'clearError' } } },
      },
      on: {
        PREVIEW_COMPLETE: [
          {
            guard: ({ context }: any) => context.pendingDrillIn === 'preview',
            target: 'publish',
            actions: ['savePreviewResult', 'openReturnPrompt'],
          },
          { target: 'publish', actions: 'savePreviewResult' },
        ],
        STAGE_ERROR: { target: '.error', actions: 'recordError' },
      },
    },
    publish: {
      initial: 'idle',
      states: {
        idle: { on: { RESUME: { actions: 'resumeAuto' } } },
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
