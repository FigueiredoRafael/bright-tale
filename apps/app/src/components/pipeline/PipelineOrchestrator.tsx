'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Sparkles, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { BrainstormEngine } from '@/components/engines/BrainstormEngine';
import { ResearchEngine } from '@/components/engines/ResearchEngine';
import { DraftEngine } from '@/components/engines/DraftEngine';
import { ReviewEngine } from '@/components/engines/ReviewEngine';
import { AssetsEngine } from '@/components/engines/AssetsEngine';
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
  projectTitle,
  initialPipelineState,
}: PipelineOrchestratorProps) {
  const [pipelineState, setPipelineState] = useState<PipelineState>(() => {
    if (initialPipelineState) {
      return initialPipelineState as unknown as PipelineState;
    }
    return DEFAULT_STATE;
  });

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

    if (sr.publish) {
      ctx.wordpressPostId = sr.publish.wordpressPostId;
      ctx.publishedUrl = sr.publish.publishedUrl;
    }

    return ctx;
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

    // Merge result into stageResults
    const newStageResults = {
      ...pipelineState.stageResults,
      [stage]: { ...result, completedAt },
    };

    // Find next stage
    const currentIndex = PIPELINE_STAGES.indexOf(stage);
    const nextStage =
      currentIndex < PIPELINE_STAGES.length - 1
        ? PIPELINE_STAGES[currentIndex + 1]
        : stage;

    const newState: PipelineState = {
      ...pipelineState,
      stageResults: newStageResults,
      currentStage: nextStage,
    };

    await savePipelineState(newState);
    setEngineMode(null);

    if (stage !== nextStage) {
      toast.success(`Completed ${stage}!`);
    }
  }

  // Handle revisit (go back to a stage)
  async function handleRevisit(targetStage: PipelineStage) {
    const targetIndex = PIPELINE_STAGES.indexOf(targetStage);

    // Clear all downstream stageResults
    const newStageResults = { ...pipelineState.stageResults };
    for (let i = targetIndex + 1; i < PIPELINE_STAGES.length; i++) {
      const stage = PIPELINE_STAGES[i];
      delete newStageResults[stage];
    }

    const newState: PipelineState = {
      ...pipelineState,
      currentStage: targetStage,
      stageResults: newStageResults,
    };

    await savePipelineState(newState);
    setEngineMode(null);
    setDraftData(null);
    setResearchData(null);

    toast.info(`Revisiting ${targetStage}`);
  }

  // Fetch draft data for Review and Publish stages
  useEffect(() => {
    const ctx = buildContext();
    const stage = pipelineState.currentStage;

    if ((stage === 'review' || stage === 'publish' || stage === 'assets') && ctx.draftId && !draftData) {
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
  }, [pipelineState.currentStage, pipelineState.stageResults.draft, draftData]);

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

    // Skip picker for review and publish (always generate)
    if (stage === 'review' || stage === 'publish') {
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
    const mode = engineMode || (stage === 'review' || stage === 'publish' ? 'generate' : 'generate');

    const handleBack = (targetStage?: PipelineStage) => {
      if (targetStage) {
        handleRevisit(targetStage);
      } else {
        // Go back to previous stage
        const currentIndex = PIPELINE_STAGES.indexOf(stage);
        if (currentIndex > 0) {
          const prevStage = PIPELINE_STAGES[currentIndex - 1];
          handleRevisit(prevStage);
        }
      }
    };

    switch (stage) {
      case 'brainstorm':
        return (
          <BrainstormEngine
            mode={mode as 'generate' | 'import'}
            channelId={channelId}
            context={ctx}
            onComplete={handleStageComplete}
            onBack={handleBack}
          />
        );

      case 'research':
        return (
          <ResearchEngine
            mode={mode as 'generate' | 'import'}
            channelId={channelId}
            context={ctx}
            onComplete={handleStageComplete}
            onBack={handleBack}
          />
        );

      case 'draft':
        return (
          <DraftEngine
            mode={mode as 'generate' | 'import'}
            channelId={channelId}
            context={ctx}
            onComplete={handleStageComplete}
            onBack={handleBack}
          />
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
          <AssetsEngine
            mode={mode as 'generate' | 'import'}
            channelId={channelId}
            context={ctx}
            draftId={ctx.draftId}
            draftStatus={draftData.status as string}
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
        <h2 className="text-2xl font-bold">{projectTitle}</h2>
        <p className="text-sm text-muted-foreground">
          Project ID: <code className="text-xs bg-muted px-2 py-1 rounded">{projectId}</code>
        </p>
      </div>

      {/* Auto Mode Controls */}
      <AutoModeControls
        pipelineState={pipelineState}
        isRunning={isRunning}
        onToggleMode={(mode) => {
          const newState = { ...pipelineState, mode };
          savePipelineState(newState as PipelineState);
        }}
        onPause={() => {
          const newState = {
            ...pipelineState,
            autoConfig: {
              ...pipelineState.autoConfig,
              pausedAt: pipelineState.currentStage,
            },
          };
          savePipelineState(newState);
        }}
        onResume={() => {
          const newState = {
            ...pipelineState,
            autoConfig: {
              ...pipelineState.autoConfig,
              pausedAt: undefined,
            },
          };
          savePipelineState(newState);
        }}
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
      />

      {/* Completed Stage Summaries */}
      <div className="space-y-2">
        {PIPELINE_STAGES.map((stage) => (
          <CompletedStageSummary
            key={stage}
            stage={stage}
            stageResults={pipelineState.stageResults}
            onRevisit={handleRevisit}
          />
        ))}
      </div>

      <Separator />

      {/* Active Engine */}
      {renderActiveEngine()}
    </div>
  );
}
