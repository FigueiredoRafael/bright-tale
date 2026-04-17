'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Sparkles, Copy, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { BrainstormEngine } from '@/components/engines/BrainstormEngine';
import { ResearchEngine } from '@/components/engines/ResearchEngine';
import { DraftEngine } from '@/components/engines/DraftEngine';
import { ReviewEngine } from '@/components/engines/ReviewEngine';
import { AssetsEngine } from '@/components/engines/AssetsEngine';
import { PreviewEngine } from '@/components/engines/PreviewEngine';
import { PublishEngine } from '@/components/engines/PublishEngine';
import { ImportPicker } from '@/components/engines/ImportPicker';
import { PipelineStages, type PipelineStep } from './PipelineStages';
import { AutoModeControls } from './AutoModeControls';
import { CompletedStageSummary } from './CompletedStageSummary';

import type {
  PipelineState,
  PipelineContext,
  PipelineStage,
  StageResult,
  ReviewResult,
  DEFAULT_PIPELINE_STATE,
} from '@/components/engines/types';
import { PIPELINE_STAGES, DEFAULT_PIPELINE_STATE as DEFAULT_STATE } from '@/components/engines/types';

interface PipelineOrchestratorProps {
  projectId: string;
  channelId: string;
  projectTitle: string;
  initialPipelineState?: Record<string, unknown>;
}

export function PipelineOrchestrator({
  projectId,
  channelId,
  projectTitle: initialProjectTitle,
  initialPipelineState,
}: PipelineOrchestratorProps) {
  const [pipelineState, setPipelineState] = useState<PipelineState>(() => {
    if (initialPipelineState && Object.keys(initialPipelineState).length > 0) {
      return {
        ...DEFAULT_STATE,
        ...initialPipelineState,
        stageResults: { ...DEFAULT_STATE.stageResults, ...(initialPipelineState as Record<string, unknown>).stageResults as Record<string, unknown> },
        autoConfig: { ...DEFAULT_STATE.autoConfig, ...(initialPipelineState as Record<string, unknown>).autoConfig as Record<string, unknown> },
      } as PipelineState;
    }
    return DEFAULT_STATE;
  });

  const [projectTitle, setProjectTitle] = useState(initialProjectTitle);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(initialProjectTitle);
  const [engineMode, setEngineMode] = useState<'generate' | 'import' | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [draftData, setDraftData] = useState<Record<string, unknown> | null>(null);
  const [researchData, setResearchData] = useState<Record<string, unknown> | null>(null);

  // Build accumulated context from stageResults
  function buildContext(): PipelineContext {
    const ctx: PipelineContext = { projectId, projectTitle, channelId };
    const sr = pipelineState.stageResults;

    if (sr.brainstorm) {
      ctx.ideaId = sr.brainstorm.ideaId;
      ctx.ideaTitle = sr.brainstorm.ideaTitle;
      ctx.ideaVerdict = sr.brainstorm.ideaVerdict;
      ctx.ideaCoreTension = sr.brainstorm.ideaCoreTension;
      ctx.brainstormSessionId = sr.brainstorm.brainstormSessionId;
    }

    if (sr.research) {
      ctx.researchSessionId = sr.research.researchSessionId;
      ctx.approvedCardsCount = sr.research.approvedCardsCount;
      ctx.researchLevel = sr.research.researchLevel;
    }

    if (sr.draft) {
      ctx.draftId = sr.draft.draftId;
      ctx.draftTitle = sr.draft.draftTitle;
    }

    if (sr.review) {
      ctx.reviewScore = sr.review.score;
      ctx.reviewVerdict = sr.review.verdict;
      ctx.iterationCount = sr.review.iterationCount;
    }

    if (sr.assets) {
      ctx.assetIds = sr.assets.assetIds;
      ctx.featuredImageUrl = sr.assets.featuredImageUrl;
    }

    if (sr.preview) {
      ctx.previewImageMap = sr.preview.imageMap;
      ctx.previewAltTexts = sr.preview.altTexts;
      ctx.previewCategories = sr.preview.categories;
      ctx.previewTags = sr.preview.tags;
      ctx.previewSeoOverrides = sr.preview.seoOverrides;
      ctx.previewPublishDate = sr.preview.suggestedPublishDate;
    }

    if (sr.publish) {
      ctx.wordpressPostId = sr.publish.wordpressPostId;
      ctx.publishedUrl = sr.publish.publishedUrl;
    }

    return ctx;
  }

  // Save project title to database
  async function saveProjectTitle(newTitle: string) {
    setProjectTitle(newTitle);
    setTitleDraft(newTitle);
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch {
      // Silent — title is cosmetic
    }
  }

  // Save pipeline state to database
  async function savePipelineState(newState: PipelineState) {
    setPipelineState(newState);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineStateJson: newState }),
      });
      const { error } = await res.json();
      if (error) {
        toast.error(error.message || 'Failed to save pipeline state');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to save pipeline state: ${message}`);
    }
  }

  // Handle stage completion
  async function handleStageComplete(result: StageResult) {
    const stage = pipelineState.currentStage;
    const completedAt = new Date().toISOString();
    const currentIndex = PIPELINE_STAGES.indexOf(stage);

    // Check for downstream stages that will be invalidated
    const downstreamWithResults = PIPELINE_STAGES.slice(currentIndex + 1)
      .filter((s) => pipelineState.stageResults[s]);

    if (downstreamWithResults.length > 0) {
      const names = downstreamWithResults.join(', ');
      if (!window.confirm(
        `Completing "${stage}" will discard results for: ${names}.\n\nContinue?`
      )) {
        return;
      }
    }

    // Auto-update project title from brainstorm idea
    if (stage === 'brainstorm' && 'ideaTitle' in result && result.ideaTitle) {
      void saveProjectTitle(result.ideaTitle);
    }

    // Merge result into stageResults, clearing downstream
    const newStageResults = {
      ...pipelineState.stageResults,
      [stage]: { ...result, completedAt },
    };
    for (const downstream of downstreamWithResults) {
      delete newStageResults[downstream];
    }

    // Find next stage
    const nextStage =
      currentIndex < PIPELINE_STAGES.length - 1
        ? PIPELINE_STAGES[currentIndex + 1]
        : stage;

    const newState: PipelineState = {
      ...pipelineState,
      stageResults: newStageResults,
      currentStage: nextStage,
    };

    // Special handling for review in auto mode
    if (stage === 'review' && pipelineState.mode === 'auto') {
      const reviewResult = result as ReviewResult;
      if (reviewResult.verdict === 'approved') {
        // Normal flow — advance to assets
        await savePipelineState(newState);
        setEngineMode(null);
        toast.success(`Completed ${stage}!`);
      } else if (reviewResult.score < 40) {
        // Rejected — too broken, pause
        toast.warning('Auto-pilot paused — content scored too low for auto-revision');
        const pausedState = {
          ...newState,
          autoConfig: { ...newState.autoConfig, pausedAt: 'review' as PipelineStage },
        };
        await savePipelineState(pausedState);
        setEngineMode(null);
        setIsRunning(false);
        return;
      } else if (reviewResult.iterationCount >= pipelineState.autoConfig.maxReviewIterations) {
        // Max iterations reached — pause
        toast.warning(
          `Auto-pilot paused — reached ${reviewResult.iterationCount} review iterations without approval`
        );
        const pausedState = {
          ...newState,
          autoConfig: { ...newState.autoConfig, pausedAt: 'review' as PipelineStage },
        };
        await savePipelineState(pausedState);
        setEngineMode(null);
        setIsRunning(false);
        return;
      } else {
        // Auto-revise: call reproduce, then re-trigger review
        toast.info(`Auto-revising draft (iteration ${reviewResult.iterationCount + 1})...`);
        try {
          const draftId = pipelineState.stageResults.draft?.draftId;
          if (draftId) {
            const res = await fetch(`/api/content-drafts/${draftId}/reproduce`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ feedbackJson: reviewResult.feedbackJson }),
            });
            const { error } = await res.json();
            if (error) {
              toast.error('Auto-revision failed: ' + error.message);
              const pausedState = {
                ...newState,
                autoConfig: { ...newState.autoConfig, pausedAt: 'review' as PipelineStage },
              };
              await savePipelineState(pausedState);
              setEngineMode(null);
              setIsRunning(false);
              return;
            }
            // Update state with the iteration count and stay on review
            await savePipelineState(newState);
            setEngineMode('generate');
            setIsRunning(true);
            return; // Don't advance — stay on review
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          toast.error(`Auto-revision failed: ${message}`);
          const pausedState = {
            ...newState,
            autoConfig: { ...newState.autoConfig, pausedAt: 'review' as PipelineStage },
          };
          await savePipelineState(pausedState);
          setEngineMode(null);
          setIsRunning(false);
          return;
        }
      }
    }

    // Re-fetch draft after review approval so downstream stages see the fresh status
    const draftId = pipelineState.stageResults.draft?.draftId;
    if (stage === 'review' && (result as ReviewResult).verdict === 'approved' && draftId) {
      try {
        const res = await fetch(`/api/content-drafts/${draftId}`);
        const { data } = await res.json();
        if (data) setDraftData(data as Record<string, unknown>);
      } catch { /* publish gate will fall back to stale draftData */ }
    }

    await savePipelineState(newState);
    setEngineMode(null);

    if (stage !== nextStage) {
      toast.success(`Completed ${stage}!`);
    }

    // Auto mode: auto-advance to next stage
    if (newState.mode === 'auto' && !newState.autoConfig.pausedAt) {
      const nextStageForAuto = newState.currentStage;
      if (nextStageForAuto === 'publish') {
        // Always pause before publish
        const pausedState = {
          ...newState,
          autoConfig: { ...newState.autoConfig, pausedAt: 'publish' as PipelineStage },
        };
        await savePipelineState(pausedState);
        setIsRunning(false);
        toast.info('Auto-pilot paused — publish requires manual confirmation');
      } else {
        // Auto-start next engine in generate mode
        setEngineMode('generate');
        setIsRunning(true);
      }
    }
  }

  // Navigate to a stage without clearing any results.
  // The engine will render with existing data; user can regenerate.
  // Downstream data is only cleared when handleStageComplete fires.
  async function handleNavigate(targetStage: PipelineStage) {
    const newState: PipelineState = {
      ...pipelineState,
      currentStage: targetStage,
    };
    await savePipelineState(newState);
    setEngineMode(null);
  }

  // Compute the furthest stage that has results (or current if none)
  function getFurthestStage(): PipelineStage {
    let furthest = pipelineState.currentStage;
    for (let i = PIPELINE_STAGES.length - 1; i >= 0; i--) {
      if (pipelineState.stageResults[PIPELINE_STAGES[i]]) {
        const next = PIPELINE_STAGES[i + 1];
        furthest = next ?? PIPELINE_STAGES[i];
        break;
      }
    }
    return furthest;
  }

  // Handle mode toggle
  async function handleToggleMode(mode: 'step-by-step' | 'auto') {
    const newState: PipelineState = {
      ...pipelineState,
      mode,
      autoConfig: { ...pipelineState.autoConfig, pausedAt: undefined },
    };
    await savePipelineState(newState);
    if (mode === 'auto') {
      setEngineMode('generate');
      setIsRunning(true);
      toast.info('Auto-pilot activated');
    } else {
      setIsRunning(false);
    }
  }

  // Handle pause
  async function handlePause() {
    const newState: PipelineState = {
      ...pipelineState,
      autoConfig: { ...pipelineState.autoConfig, pausedAt: pipelineState.currentStage },
    };
    await savePipelineState(newState);
    setIsRunning(false);
    toast.info('Auto-pilot paused');
  }

  // Handle resume
  async function handleResume() {
    const newState: PipelineState = {
      ...pipelineState,
      autoConfig: { ...pipelineState.autoConfig, pausedAt: undefined },
    };
    await savePipelineState(newState);
    setEngineMode('generate');
    setIsRunning(true);
    toast.info('Auto-pilot resumed');
  }

  // Fetch draft data for Review and Publish stages
  useEffect(() => {
    const ctx = buildContext();
    const stage = pipelineState.currentStage;

    const needsFresh = stage === 'publish'; // publish gate depends on live draft.status
    if ((stage === 'review' || stage === 'publish' || stage === 'assets' || stage === 'preview') && ctx.draftId && (needsFresh || !draftData)) {
      (async () => {
        try {
          const res = await fetch(`/api/content-drafts/${ctx.draftId}`);
          const { data, error } = await res.json();
          if (error) {
            toast.error(error.message || 'Failed to load draft');
            return;
          }
          setDraftData(data);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          toast.error(`Failed to load draft: ${message}`);
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineState.currentStage, pipelineState.stageResults?.draft, draftData]);

  // Map PipelineStage to PipelineStep
  function getPipelineStep(): PipelineStep {
    const stage = pipelineState.currentStage;
    if (stage === 'publish') return 'published';
    return stage;
  }

  // Render mode picker (Generate vs Import)
  function renderModePicker() {
    const stage = pipelineState.currentStage;
    const isAutoMode = pipelineState.mode === 'auto';

    // Skip picker for review, preview, and publish (always generate)
    if (stage === 'review' || stage === 'preview' || stage === 'publish') {
      return null;
    }

    // In auto mode, default to generate
    if (isAutoMode) {
      return null;
    }

    return (
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Mode for {stage}</p>
              <p className="text-xs text-muted-foreground">
                Generate fresh or import from library?
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEngineMode('generate')}
              >
                <Sparkles className="h-4 w-4 mr-1" /> Generate Fresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEngineMode('import')}
              >
                <Copy className="h-4 w-4 mr-1" /> Import Existing
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render active engine
  function renderActiveEngine() {
    const ctx = buildContext();
    const stage = pipelineState.currentStage;

    // Show mode picker if not in auto mode and no mode selected
    if (!engineMode && pipelineState.mode === 'step-by-step') {
      const picker = renderModePicker();
      if (picker) return picker;
    }

    // Auto-set mode for stages without import
    const mode = engineMode || (stage === 'review' || stage === 'preview' || stage === 'publish' ? 'generate' : 'generate');
    const showBackToOptions = engineMode !== null && stage !== 'review' && stage !== 'preview' && stage !== 'publish';

    const handleBack = (targetStage?: PipelineStage) => {
      if (targetStage) {
        handleNavigate(targetStage);
      } else {
        const currentIndex = PIPELINE_STAGES.indexOf(stage);
        if (currentIndex > 0) {
          handleNavigate(PIPELINE_STAGES[currentIndex - 1]);
        }
      }
    };

    const backBar = showBackToOptions ? (
      <div className="mb-3 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={() => setEngineMode(null)}
        >
          <ArrowLeft className="h-3 w-3 mr-1" /> Back to options
        </Button>
        <Badge variant="outline" className="text-[10px]">
          {engineMode === 'generate' ? 'Generating' : 'Importing'}
        </Badge>
      </div>
    ) : null;

    switch (stage) {
      case 'brainstorm':
        return (
          <>{backBar}<BrainstormEngine
            mode={mode as 'generate' | 'import'}
            channelId={channelId}
            context={ctx}
            onComplete={handleStageComplete}
            onBack={handleBack}
          /></>
        );

      case 'research':
        return (
          <>{backBar}<ResearchEngine
            mode={mode as 'generate' | 'import'}
            channelId={channelId}
            context={ctx}
            onComplete={handleStageComplete}
            onBack={handleBack}
          /></>
        );

      case 'draft':
        return (
          <>{backBar}<DraftEngine
            mode={mode as 'generate' | 'import'}
            channelId={channelId}
            context={ctx}
            onComplete={handleStageComplete}
            onBack={handleBack}
          /></>
        );

      case 'review':
        if (!draftData || !ctx.draftId) {
          return (
            <Card>
              <CardContent className="py-8">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading draft...
                </div>
              </CardContent>
            </Card>
          );
        }
        return (
          <ReviewEngine
            channelId={channelId}
            context={ctx}
            draftId={ctx.draftId}
            draft={draftData as any}
            onComplete={handleStageComplete}
            onBack={handleBack}
            onDraftUpdated={(draft) => setDraftData(draft)}
          />
        );

      case 'assets':
        if (!draftData || !ctx.draftId) {
          return (
            <Card>
              <CardContent className="py-8">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading draft...
                </div>
              </CardContent>
            </Card>
          );
        }
        return (
          <>{backBar}<AssetsEngine
            mode={mode as 'generate' | 'import'}
            channelId={channelId}
            context={ctx}
            draftId={ctx.draftId}
            draftStatus={draftData.status as string}
            onComplete={handleStageComplete}
            onBack={handleBack}
          /></>
        );

      case 'preview':
        if (!ctx.draftId) {
          return (
            <Card>
              <CardContent className="py-8">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading draft...
                </div>
              </CardContent>
            </Card>
          );
        }
        return (
          <PreviewEngine
            channelId={channelId}
            context={ctx}
            draftId={ctx.draftId}
            onComplete={handleStageComplete}
            onBack={handleBack}
          />
        );

      case 'publish':
        if (!draftData || !ctx.draftId) {
          return (
            <Card>
              <CardContent className="py-8">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading draft...
                </div>
              </CardContent>
            </Card>
          );
        }
        return (
          <PublishEngine
            channelId={channelId}
            context={ctx}
            draftId={ctx.draftId}
            draft={draftData as any}
            assetCount={ctx.assetIds?.length ?? 0}
            onComplete={handleStageComplete}
            onBack={handleBack}
          />
        );

      default:
        return null;
    }
  }

  const ctx = buildContext();

  return (
    <div className="space-y-6">
      {/* Project Header */}
      <div>
        {editingTitle ? (
          <input
            autoFocus
            className="text-2xl font-bold bg-transparent border-b-2 border-primary outline-none w-full"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              setEditingTitle(false);
              if (titleDraft.trim() && titleDraft !== projectTitle) {
                void saveProjectTitle(titleDraft.trim());
              } else {
                setTitleDraft(projectTitle);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === 'Escape') {
                setTitleDraft(projectTitle);
                setEditingTitle(false);
              }
            }}
          />
        ) : (
          <h2
            className="text-2xl font-bold cursor-pointer hover:text-primary/80 transition-colors"
            title="Click to edit"
            onClick={() => { setTitleDraft(projectTitle); setEditingTitle(true); }}
          >
            {projectTitle}
          </h2>
        )}
        <p className="text-sm text-muted-foreground mt-1">
          Project ID: <code className="text-xs bg-muted px-2 py-1 rounded">{projectId}</code>
        </p>
      </div>

      {/* Auto Mode Controls */}
      <AutoModeControls
        pipelineState={pipelineState}
        isRunning={isRunning}
        onToggleMode={handleToggleMode}
        onPause={handlePause}
        onResume={handleResume}
      />

      <Separator />

      {/* Pipeline Stepper */}
      <PipelineStages
        currentStep={getPipelineStep()}
        channelId={channelId}
        draftId={ctx.draftId}
        projectId={projectId}
        projectTitle={projectTitle}
        ideaTitle={ctx.ideaTitle}
        brainstormSessionId={ctx.brainstormSessionId}
        researchSessionId={ctx.researchSessionId}
        onStepClick={(step) => {
          const stage: PipelineStage = step === 'published' ? 'publish' : step;
          if (stage !== pipelineState.currentStage && pipelineState.stageResults[stage]) {
            handleNavigate(stage);
          }
        }}
      />

      {/* Completed Stage Summaries */}
      <div className="space-y-2">
        {PIPELINE_STAGES.map((stage) => (
          <CompletedStageSummary
            key={stage}
            stage={stage}
            stageResults={pipelineState.stageResults}
            currentStage={pipelineState.currentStage}
            onNavigate={handleNavigate}
          />
        ))}
      </div>

      <Separator />

      {/* "Continue to furthest" banner when user navigated back */}
      {(() => {
        const furthest = getFurthestStage();
        const furthestIdx = PIPELINE_STAGES.indexOf(furthest);
        const currentIdx = PIPELINE_STAGES.indexOf(pipelineState.currentStage);
        if (furthestIdx > currentIdx) {
          return (
            <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2">
              <span className="text-sm text-amber-600 dark:text-amber-400">
                You have progress up to <strong>{furthest}</strong>. Regenerating here will discard downstream stages.
              </span>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleNavigate(furthest)}>
                Continue to {furthest}
              </Button>
            </div>
          );
        }
        return null;
      })()}

      {/* Active Engine */}
      {renderActiveEngine()}
    </div>
  );
}
