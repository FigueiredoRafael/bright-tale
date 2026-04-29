'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMachine } from '@xstate/react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2 } from 'lucide-react'
import { useAnalytics } from '@/hooks/use-analytics'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { usePipelineSettings } from '@/providers/PipelineSettingsProvider'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { mapLegacyPipelineState } from '@/lib/pipeline/legacy-state-migration'
import { PipelineStages, type PipelineStep } from './PipelineStages'
import { AutoModeControls } from './AutoModeControls'
import { CompletedStageSummary } from './CompletedStageSummary'
import { BrainstormEngine } from '@/components/engines/BrainstormEngine'
import { ResearchEngine } from '@/components/engines/ResearchEngine'
import { DraftEngine } from '@/components/engines/DraftEngine'
import { ReviewEngine } from '@/components/engines/ReviewEngine'
import { AssetsEngine } from '@/components/engines/AssetsEngine'
import { PreviewEngine } from '@/components/engines/PreviewEngine'
import { PublishEngine } from '@/components/engines/PublishEngine'
import { PIPELINE_STAGES } from '@/components/engines/types'
import type { PipelineStage, PipelineSettings, CreditSettings } from '@/components/engines/types'

interface Props {
  projectId: string
  channelId: string
  projectTitle: string
  initialPipelineState?: Record<string, unknown>
}

const IMPORTABLE_STAGES: PipelineStage[] = ['brainstorm', 'research', 'draft', 'assets']

export function PipelineOrchestrator({
  projectId,
  channelId,
  projectTitle: initialProjectTitle,
  initialPipelineState,
}: Props) {
  const { pipelineSettings, creditSettings, isLoaded } = usePipelineSettings()

  if (!isLoaded) {
    return (
      <Card>
        <CardContent className="py-8" data-testid="pipeline-loading">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading pipeline settings…
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <OrchestratorInner
      projectId={projectId}
      channelId={channelId}
      projectTitle={initialProjectTitle}
      initialPipelineState={initialPipelineState}
      pipelineSettings={pipelineSettings!}
      creditSettings={creditSettings!}
    />
  )
}

interface InnerProps extends Props {
  pipelineSettings: PipelineSettings
  creditSettings: CreditSettings
}

type PublishEngineDraft = {
  id: string
  title: string | null
  status: string
  wordpress_post_id: number | null
  published_url: string | null
}

function OrchestratorInner({
  projectId,
  channelId,
  projectTitle,
  initialPipelineState,
  pipelineSettings,
  creditSettings,
}: InnerProps) {
  const legacy = useMemo(() => mapLegacyPipelineState(initialPipelineState), [initialPipelineState])
  const { track } = useAnalytics()

  const [state, send, actorRef] = useMachine(pipelineMachine, {
    input: {
      projectId,
      channelId,
      projectTitle,
      pipelineSettings,
      creditSettings,
      mode: legacy?.mode,
      initialStageResults: legacy?.initialStageResults,
      initialIterationCount: legacy?.initialIterationCount,
      initialPaused: legacy?.initialPaused,
      initialPauseReason: legacy?.initialPauseReason,
    },
    inspect:
      process.env.NODE_ENV === 'development'
        ? (ev) => {
            if (ev.type === '@xstate.event') {
              console.debug('[pipeline]', (ev as any).event?.type, (ev as any).event)
            }
          }
        : undefined,
  })

  const didRestoreRef = useRef(false)
  const restoredRef = useRef(false)
  useEffect(() => {
    if (didRestoreRef.current) return
    didRestoreRef.current = true
    if (legacy?.initialStage && legacy.initialStage !== 'brainstorm') {
      send({ type: 'NAVIGATE', toStage: legacy.initialStage })
    }
    queueMicrotask(() => {
      restoredRef.current = true
    })
  }, [legacy?.initialStage, send])

  const ctx = state.context
  const stateValue = state.value
  const currentStage = (
    typeof stateValue === 'string' ? stateValue : Object.keys(stateValue)[0]
  ) as PipelineStage
  const subState =
    typeof stateValue === 'string'
      ? 'idle'
      : ((stateValue as Record<string, string>)[currentStage] ?? 'idle')

  const lastPersistedRef = useRef<string>('')
  useEffect(() => {
    if (!restoredRef.current) return
    const snapshot = JSON.stringify({
      mode: ctx.mode,
      stageResults: ctx.stageResults,
      iterationCount: ctx.iterationCount,
      currentStage,
      paused: ctx.paused,
      pauseReason: ctx.pauseReason,
    })
    if (snapshot === lastPersistedRef.current) return
    const t = setTimeout(() => {
      lastPersistedRef.current = snapshot
      void fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipelineStateJson: {
            mode: ctx.mode,
            stageResults: ctx.stageResults,
            iterationCount: ctx.iterationCount,
            currentStage,
            paused: ctx.paused,
            pauseReason: ctx.pauseReason,
          },
        }),
      }).catch(() => {
        toast.error('Failed to persist pipeline state')
      })
    }, 150)
    return () => clearTimeout(t)
  }, [ctx.mode, ctx.stageResults, ctx.iterationCount, currentStage, ctx.paused, ctx.pauseReason, projectId])

  useEffect(() => {
    if (ctx.lastError) toast.error(ctx.lastError)
  }, [ctx.lastError])

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(ctx.projectTitle)
  useEffect(() => {
    if (!editingTitle) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitleDraft(ctx.projectTitle)
    }
  }, [ctx.projectTitle, editingTitle])

  async function saveTitle(newTitle: string) {
    send({ type: 'SET_PROJECT_TITLE', title: newTitle })
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      })
    } catch {
      // title is cosmetic; ignore
    }
  }

  const [engineMode, setEngineMode] = useState<'generate' | 'import' | null>(null)
  const [pendingAssetsConfirm, setPendingAssetsConfirm] = useState(false)
  const [assetsConfirmed, setAssetsConfirmed] = useState(false)

  useEffect(() => {
    if (ctx.mode !== 'supervised' && ctx.mode !== 'overview') return
    if (ctx.paused) return
    if (currentStage === 'publish') return
    if (currentStage === 'review' && subState === 'idle') {
      send({ type: 'RESUME' })
      return
    }
    if (subState === 'idle' && !ctx.stageResults[currentStage]) {
      // Assets stage costs credits — gate behind explicit user confirmation.
      if (currentStage === 'assets' && !assetsConfirmed) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPendingAssetsConfirm(true)
        return
      }
      setEngineMode('generate')
    }
  }, [ctx.mode, ctx.paused, currentStage, subState, ctx.stageResults, assetsConfirmed, send])

  const isWorking = subState === 'reviewing' || subState === 'reproducing'

  const [draftData, setDraftData] = useState<Record<string, unknown> | null>(null)
  useEffect(() => {
    const draftId = ctx.stageResults.draft?.draftId
    const needsDraft = ['review', 'assets', 'preview', 'publish'].includes(currentStage) && !!draftId
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftData(null)
    if (!needsDraft) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/content-drafts/${draftId}`)
        const { data, error } = await res.json()
        if (cancelled) return
        if (error) toast.error((error as any).message ?? 'Failed to load draft')
        if (data) setDraftData(data as Record<string, unknown>)
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load draft')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentStage, ctx.stageResults.draft?.draftId])

  function handleNavigate(toStage: PipelineStage) {
    track('pipeline.stage.navigated', { projectId, channelId, from: currentStage, to: toStage })
    send({ type: 'NAVIGATE', toStage })
    setEngineMode(null)
    if (toStage !== 'assets') setAssetsConfirmed(false)
    setPendingAssetsConfirm(false)
  }

  const [pendingRedo, setPendingRedo] = useState<{
    fromStage: PipelineStage
    discarded: PipelineStage[]
  } | null>(null)

  function handleRedoFrom(fromStage: PipelineStage) {
    const fromIndex = PIPELINE_STAGES.indexOf(fromStage)
    const discarded = PIPELINE_STAGES.slice(fromIndex + 1).filter((s) => ctx.stageResults[s])
    if (discarded.length === 0) {
      send({ type: 'REDO_FROM', fromStage })
      setEngineMode(null)
      return
    }
    setPendingRedo({ fromStage, discarded })
  }

  function confirmRedo() {
    if (!pendingRedo) return
    track('pipeline.stage.redone', {
      projectId,
      channelId,
      fromStage: pendingRedo.fromStage,
      discardedStages: pendingRedo.discarded,
    })
    send({ type: 'REDO_FROM', fromStage: pendingRedo.fromStage })
    setEngineMode(null)
    setPendingRedo(null)
  }

  function handleToggleMode() {
    // TODO(T-8.4): wizard-driven mode change replaces inline toggle
    // Inline mode toggle removed in favor of setup-driven wizard flow.
    // This handler is deprecated and will be removed when AutoModeControls is refactored.
  }

  function pipelineStep(): PipelineStep {
    return currentStage === 'publish' ? 'published' : currentStage
  }

  function renderEngine() {
    const needsDraftPrefetch = ['review', 'assets', 'preview', 'publish'].includes(currentStage)
    if (needsDraftPrefetch && ctx.stageResults.draft?.draftId && !draftData) {
      return (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading draft…
            </div>
          </CardContent>
        </Card>
      )
    }

    const canImport = IMPORTABLE_STAGES.includes(currentStage)
    const mode: 'generate' | 'import' = engineMode ?? 'generate'
    const onModeChange = (canImport && !ctx.stageResults[currentStage])
      ? setEngineMode
      : undefined

    switch (currentStage) {
      case 'brainstorm':
        return <BrainstormEngine mode={mode} onModeChange={onModeChange} />
      case 'research':
        return <ResearchEngine mode={mode} onModeChange={onModeChange} />
      case 'draft':
        return <DraftEngine mode={mode} onModeChange={onModeChange} />
      case 'review':
        return <ReviewEngine draft={draftData} />
      case 'assets':
        return <AssetsEngine mode={mode} onModeChange={onModeChange} draft={draftData} />
      case 'preview':
        return <PreviewEngine />
      case 'publish':
        return <PublishEngine draft={draftData as PublishEngineDraft} />
      default:
        return null
    }
  }

  return (
    <PipelineActorProvider value={actorRef}>
      <div className="space-y-6">
        <div>
          {editingTitle ? (
            <input
              autoFocus
              className="text-2xl font-bold bg-transparent border-b-2 border-primary outline-none w-full"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                setEditingTitle(false)
                if (titleDraft.trim() && titleDraft !== ctx.projectTitle)
                  void saveTitle(titleDraft.trim())
                else setTitleDraft(ctx.projectTitle)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') {
                  setTitleDraft(ctx.projectTitle)
                  setEditingTitle(false)
                }
              }}
            />
          ) : (
            <h2
              className="text-2xl font-bold cursor-pointer hover:text-primary/80 transition-colors"
              title="Click to edit"
              onClick={() => {
                setTitleDraft(ctx.projectTitle)
                setEditingTitle(true)
              }}
            >
              {ctx.projectTitle}
            </h2>
          )}
          <p className="text-sm text-muted-foreground mt-1">
            Project ID: <code className="text-xs bg-muted px-2 py-1 rounded">{projectId}</code>
          </p>
        </div>

        <AutoModeControls
          mode={ctx.mode}
          isPaused={ctx.paused || subState === 'paused'}
          isWorking={isWorking}
          pauseReason={ctx.pauseReason}
          onToggle={handleToggleMode}
          onPause={() => send({ type: 'PAUSE' })}
          onResume={() => {
            setPendingAssetsConfirm(false)
            send({ type: 'RESUME' })
          }}
        />

        <Separator />

        <PipelineStages
          currentStep={pipelineStep()}
          channelId={channelId}
          draftId={ctx.stageResults.draft?.draftId}
          projectId={projectId}
          projectTitle={ctx.projectTitle}
          ideaTitle={ctx.stageResults.brainstorm?.ideaTitle}
          brainstormSessionId={ctx.stageResults.brainstorm?.brainstormSessionId}
          researchSessionId={ctx.stageResults.research?.researchSessionId}
          onStepClick={(step) => {
            const stage: PipelineStage =
              step === 'published' ? 'publish' : (step as PipelineStage)
            if (stage !== currentStage && ctx.stageResults[stage]) handleNavigate(stage)
          }}
        />

        <div className="space-y-2">
          {PIPELINE_STAGES.map((stage) => (
            <CompletedStageSummary
              key={stage}
              stage={stage}
              stageResults={ctx.stageResults}
              currentStage={currentStage}
              onNavigate={handleNavigate}
              onRedoFrom={handleRedoFrom}
            />
          ))}
        </div>

        <Separator />

        {renderEngine()}

        <AlertDialog open={!!pendingRedo} onOpenChange={(o) => !o && setPendingRedo(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Redo from "{pendingRedo?.fromStage}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This will discard the following completed stages:{' '}
                <strong>{pendingRedo?.discarded.join(', ')}</strong>. The
                "{pendingRedo?.fromStage}" result itself is preserved until you
                re-complete it. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmRedo}>Discard and redo</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={pendingAssetsConfirm}
          onOpenChange={(o) => !o && setPendingAssetsConfirm(false)}
        >
          <AlertDialogContent data-testid="assets-confirm-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>Generate images for this draft?</AlertDialogTitle>
              <AlertDialogDescription>
                Auto-pilot is about to generate visual assets, which consumes
                image-generation credits. You can skip this stage and supply
                images manually instead.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setPendingAssetsConfirm(false)
                  send({ type: 'PAUSE' })
                }}
              >
                Skip — pause auto-pilot
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setAssetsConfirmed(true)
                  setPendingAssetsConfirm(false)
                  setEngineMode('generate')
                }}
              >
                Generate images
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PipelineActorProvider>
  )
}

