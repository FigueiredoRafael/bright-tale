'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { useAnalytics } from '@/hooks/use-analytics'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { usePipelineSettings } from '@/providers/PipelineSettingsProvider'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import {
  mapLegacyPipelineState,
  mapLegacyToSnapshot,
} from '@/lib/pipeline/legacy-state-migration'
import { PipelineStages, type PipelineStep } from './PipelineStages'
import { AutoModeControls } from './AutoModeControls'
import { CompletedStageSummary } from './CompletedStageSummary'
import { PipelineWizard } from './PipelineWizard'
import { PipelineOverview } from './PipelineOverview'
import type { ActivityEntry } from './LiveActivityLog'
import { MiniWizardSheet } from './MiniWizardSheet'
import { ConfirmReturnDialog } from './ConfirmReturnDialog'
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
  const router = useRouter()
  const snapshot = useMemo(
    () => mapLegacyToSnapshot(initialPipelineState, { projectId, channelId, projectTitle }),
    [initialPipelineState, projectId, channelId, projectTitle]
  )
  const legacy = useMemo(
    () => (snapshot ? null : mapLegacyPipelineState(initialPipelineState)),
    [initialPipelineState, snapshot]
  )
  const { track } = useAnalytics()

  const inspectFn =
    process.env.NODE_ENV === 'development'
      ? (ev: any) => {
          if (ev.type === '@xstate.event') {
            console.debug('[pipeline]', (ev as any).event?.type, (ev as any).event)
          }
        }
      : undefined

  const options = snapshot
    ? { snapshot, inspect: inspectFn }
    : {
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
        inspect: inspectFn,
      }

  const [state, send, actorRef] = useMachine(pipelineMachine, options as any)

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
  // Display the idea title once brainstorm picks one; fall back to the project title.
  const displayTitle = ctx.stageResults.brainstorm?.ideaTitle ?? ctx.projectTitle ?? 'New Project'
  const stateValue = state.value
  const currentStage = (
    typeof stateValue === 'string' ? stateValue : Object.keys(stateValue)[0]
  ) as PipelineStage
  const subState =
    typeof stateValue === 'string'
      ? 'idle'
      : ((stateValue as Record<string, string>)[currentStage] ?? 'idle')

  // ── Activity log — lifted here so it persists across reloads via pipeline_state_json ──
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>(() => {
    if (!initialPipelineState || typeof initialPipelineState !== 'object') return []
    const raw = (initialPipelineState as Record<string, unknown>).activityLog
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (e): e is ActivityEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as Record<string, unknown>).timestamp === 'string' &&
        typeof (e as Record<string, unknown>).text === 'string',
    )
  })

  const handleActivityLogChange = useCallback((entries: ActivityEntry[]) => {
    setActivityLog(entries)
  }, [])

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
      activityLog,
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
            activityLog,
          },
        }),
      }).catch(() => {
        toast.error('Failed to persist pipeline state')
      })
    }, 150)
    return () => clearTimeout(t)
  }, [ctx.mode, ctx.stageResults, ctx.iterationCount, currentStage, ctx.paused, ctx.pauseReason, activityLog, projectId])

  useEffect(() => {
    if (ctx.lastError) toast.error(ctx.lastError)
  }, [ctx.lastError])

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(ctx.projectTitle)
  useEffect(() => {
    if (!editingTitle) {
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
  const [showEngine, setShowEngine] = useState<PipelineStage | null>(null)
  const [miniWizardOpen, setMiniWizardOpen] = useState(false)
  const [redoModalOpen, setRedoModalOpen] = useState(false)
  const [cloning, setCloning] = useState(false)

  // Drill-in: when the machine sets pendingDrillIn, open that engine in the UI.
  useEffect(() => {
    if (ctx.pendingDrillIn) setShowEngine(ctx.pendingDrillIn as PipelineStage)
  }, [ctx.pendingDrillIn])

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

  function handleRedoWipe() {
    send({ type: 'RESET_TO_SETUP' })
    setRedoModalOpen(false)
    setEngineMode(null)
  }

  async function handleRedoClone() {
    setCloning(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${ctx.projectTitle} (clone)`.slice(0, 200),
          current_stage: 'brainstorm',
          status: 'active',
          mode: ctx.mode ?? 'step-by-step',
          channelId,
          autopilotConfigJson: ctx.autopilotConfig ?? undefined,
        }),
      })
      const { data, error } = await res.json()
      if (error) {
        toast.error((error as { message?: string }).message ?? 'Failed to clone project')
        return
      }
      setRedoModalOpen(false)
      router.push(`/projects/${(data as { id: string }).id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to clone project')
    } finally {
      setCloning(false)
    }
  }

  function handleRedoNew() {
    setRedoModalOpen(false)
    router.push('/projects/new')
  }

  function pipelineStep(): PipelineStep {
    return currentStage === 'publish' ? 'published' : currentStage
  }

  function renderEngine(stage: PipelineStage = currentStage) {
    const needsDraftPrefetch = ['review', 'assets', 'preview', 'publish'].includes(stage)
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

    const canImport = IMPORTABLE_STAGES.includes(stage)
    const mode: 'generate' | 'import' = engineMode ?? 'generate'
    const onModeChange = (canImport && !ctx.stageResults[stage])
      ? setEngineMode
      : undefined

    switch (stage) {
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

  // ── Render branch: setup state ────────────────────────────────────────────
  if (state.matches('setup')) {
    return (
      <PipelineActorProvider value={actorRef}>
        <PipelineWizard />
      </PipelineActorProvider>
    )
  }

  // ── Render branch: overview mode (no engine drilled into) ─────────────────
  // Derived top stage for the engine selection when showEngine is set
  const topStage: PipelineStage =
    typeof stateValue === 'string'
      ? (stateValue as PipelineStage)
      : (Object.keys(stateValue as Record<string, unknown>)[0] as PipelineStage)
  const stageToRender: PipelineStage = showEngine ?? topStage

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
              data-testid="project-display-title"
              onClick={() => {
                setTitleDraft(ctx.projectTitle)
                setEditingTitle(true)
              }}
            >
              {displayTitle}
            </h2>
          )}
          <p className="text-sm text-muted-foreground mt-1">
            Project ID: <code className="text-xs bg-muted px-2 py-1 rounded">{projectId}</code>
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <AutoModeControls
            mode={ctx.mode}
            isPaused={ctx.paused || subState === 'paused'}
            isWorking={isWorking}
            pauseReason={ctx.pauseReason}
            onPause={() => send({ type: 'PAUSE' })}
            onResume={() => {
              setPendingAssetsConfirm(false)
              send({ type: 'RESUME' })
            }}
          />
          <Button
            variant="outline"
            size="sm"
            data-testid="mini-wizard-trigger"
            onClick={() => setMiniWizardOpen(true)}
          >
            {ctx.mode === 'step-by-step' || ctx.mode === null
              ? 'Go autopilot'
              : 'Reconfigure autopilot'}
          </Button>
          <MiniWizardSheet isOpen={miniWizardOpen} onClose={() => setMiniWizardOpen(false)} />
          <Button
            variant="ghost"
            size="sm"
            data-testid="redo-from-start-trigger"
            onClick={() => setRedoModalOpen(true)}
          >
            Redo from start
          </Button>
        </div>

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

        {ctx.mode === 'overview' && !showEngine ? (
          <>
            <PipelineOverview
              setShowEngine={(stage) => setShowEngine(stage as PipelineStage)}
              onRedoFrom={handleRedoFrom}
              activityLog={activityLog}
              onActivityLogChange={handleActivityLogChange}
            />
            <div data-testid="hidden-engine-wrapper" style={{ display: 'none' }} aria-hidden="true">
              {renderEngine(stageToRender)}
            </div>
          </>
        ) : (
          <>
            {showEngine && ctx.mode === 'overview' && (
              <Button
                variant="ghost"
                size="sm"
                className="mb-2"
                data-testid="back-to-overview"
                onClick={() => setShowEngine(null)}
              >
                ← Back to overview
              </Button>
            )}
            {renderEngine(stageToRender)}
          </>
        )}

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

        <Dialog open={redoModalOpen} onOpenChange={setRedoModalOpen}>
          <DialogContent data-testid="redo-modal">
            <DialogHeader>
              <DialogTitle>Redo from start</DialogTitle>
              <DialogDescription>
                Choose how you would like to restart this pipeline run.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-lg border p-4 space-y-1">
                <p className="font-medium text-sm">Wipe and restart</p>
                <p className="text-sm text-muted-foreground">
                  Clears all stage results and returns to the setup wizard for this project. The
                  project is preserved.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  className="mt-2"
                  data-testid="redo-wipe-btn"
                  onClick={handleRedoWipe}
                >
                  Wipe
                </Button>
              </div>
              <div className="rounded-lg border p-4 space-y-1">
                <p className="font-medium text-sm">Clone to new project</p>
                <p className="text-sm text-muted-foreground">
                  Creates a fresh project with the same channel and autopilot configuration,
                  then navigates you there.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  data-testid="redo-clone-btn"
                  disabled={cloning}
                  onClick={() => { void handleRedoClone() }}
                >
                  {cloning ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Cloning…</> : 'Clone'}
                </Button>
              </div>
              <div className="rounded-lg border p-4 space-y-1">
                <p className="font-medium text-sm">Start a new project</p>
                <p className="text-sm text-muted-foreground">
                  Navigates to the new-project flow without changing anything here.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  data-testid="redo-new-btn"
                  onClick={handleRedoNew}
                >
                  Start new
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setRedoModalOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmReturnDialog
          open={ctx.returnPromptOpen}
          onContinue={() => {
            send({ type: 'CONTINUE_AUTOPILOT' })
            setShowEngine(null)
          }}
          onStop={() => {
            send({ type: 'STOP_AUTOPILOT' })
            // showEngine stays set — engine remains visible, now in step-by-step mode
          }}
        />
      </div>
    </PipelineActorProvider>
  )
}

