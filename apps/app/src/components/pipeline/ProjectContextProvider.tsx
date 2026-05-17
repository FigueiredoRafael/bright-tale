'use client';

/**
 * Slice 14.1 — ProjectContextProvider
 *
 * Server-driven replacement for the xstate actor context seam.
 * Fetches GET /api/projects/:id + GET /api/projects/:id/stages,
 * builds a PipelineMachineContext-shaped object, and exposes it
 * via useProjectContext().
 *
 * Session-local fields (stageStatus, pendingDrillIn, returnPromptOpen,
 * pauseReason) live in local useState — they have no server source yet.
 * Downstream slices (14.2-14.7) will decide persistence strategy.
 *
 * IMPORTANT: pipelineMachine, PipelineActorProvider, and
 * StandaloneEngineHost are NOT touched in this slice.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type {
  PipelineMachineContext,
  StageResultMap,
  PauseReason,
} from '@/lib/pipeline/machine.types';
import type { PipelineStage } from '@/components/engines/types';
import type {
  BrainstormResult,
  ResearchResult,
  DraftResult,
  ReviewResult,
  AssetsResult,
  PreviewResult,
  PublishResult,
  PipelineSettings,
  CreditSettings,
} from '@/components/engines/types';
import {
  DEFAULT_PIPELINE_SETTINGS,
  DEFAULT_CREDIT_SETTINGS,
} from '@/components/engines/types';
import type { AutopilotConfig } from '@brighttale/shared';

// ─── Context shape ────────────────────────────────────────────────────────────

export interface ProjectContextValue {
  context: PipelineMachineContext;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  /** Update transient per-stage in-flight metadata */
  setStageStatus: (stage: PipelineStage, status: Record<string, unknown>) => void;
  setPendingDrillIn: (value: 'assets' | 'preview' | null) => void;
  setReturnPromptOpen: (value: boolean) => void;
  setPauseReason: (value: PauseReason | null) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useProjectContext(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error(
      'useProjectContext must be used inside <ProjectContextProvider>. ' +
        'Wrap the engine with ProjectContextProvider or ensure EngineHost supplies it.',
    );
  }
  return ctx;
}

/**
 * Returns the ProjectContextValue if a ProjectContextProvider is present in
 * the tree, or null otherwise. Used by hooks that need to support both the
 * legacy actor path and the new server-driven path without throwing.
 */
export function useOptionalProjectContext(): ProjectContextValue | null {
  return useContext(ProjectContext);
}

// ─── Types for API payloads ───────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  channel_id: string | null;
  title: string;
  mode: 'step-by-step' | 'supervised' | 'overview' | null;
  autopilot_config_json: AutopilotConfig | null;
  template_id: string | null;
  paused: boolean;
}

interface StageRunPayload {
  id: string;
  projectId: string;
  stage: string;
  status: string;
  attemptNo: number;
  finishedAt: string | null;
  errorMessage: string | null;
  outcomeJson: Record<string, unknown> | null;
  trackId: string | null;
  publishTargetId: string | null;
}

// ─── Derivation helpers ───────────────────────────────────────────────────────

function deriveStageResults(stageRuns: StageRunPayload[]): StageResultMap {
  const results: StageResultMap = {};

  for (const run of stageRuns) {
    if (run.status !== 'completed' || !run.outcomeJson) continue;
    const completedAt = run.finishedAt ?? new Date().toISOString();
    const o = run.outcomeJson as Record<string, unknown>;

    switch (run.stage) {
      case 'brainstorm':
        results.brainstorm = {
          ideaId: (o.ideaId as string) ?? '',
          ideaTitle: (o.ideaTitle as string) ?? '',
          ideaVerdict: (o.ideaVerdict as string) ?? '',
          ideaCoreTension: (o.ideaCoreTension as string) ?? '',
          brainstormSessionId: o.brainstormSessionId as string | undefined,
          completedAt,
        } satisfies BrainstormResult & { completedAt: string };
        break;

      case 'research':
        results.research = {
          researchSessionId: (o.researchSessionId as string) ?? '',
          approvedCardsCount: (o.approvedCardsCount as number) ?? 0,
          researchLevel: (o.researchLevel as string) ?? '',
          primaryKeyword: o.primaryKeyword as string | undefined,
          secondaryKeywords: o.secondaryKeywords as string[] | undefined,
          searchIntent: o.searchIntent as string | undefined,
          confidenceScore: o.confidenceScore as number | undefined,
          evidenceStrength: o.evidenceStrength as string | undefined,
          sourceCount: o.sourceCount as number | undefined,
          expertQuoteCount: o.expertQuoteCount as number | undefined,
          researchSummary: o.researchSummary as string | undefined,
          pivotRecommendation: o.pivotRecommendation as string | undefined,
          completedAt,
        } satisfies ResearchResult & { completedAt: string };
        break;

      case 'draft':
      case 'canonical':
      case 'production':
        // canonical/production stage runs carry draft outcomes in this shape
        if (o.draftId) {
          results.draft = {
            draftId: (o.draftId as string),
            draftTitle: (o.draftTitle as string) ?? '',
            draftContent: (o.draftContent as string) ?? '',
            personaId: o.personaId as string | undefined,
            personaName: o.personaName as string | undefined,
            personaSlug: o.personaSlug as string | undefined,
            personaWpAuthorId: o.personaWpAuthorId as number | null | undefined,
            completedAt,
          } satisfies DraftResult & { completedAt: string };
        }
        break;

      case 'review':
        results.review = {
          score: (o.score as number) ?? 0,
          qualityTier: o.qualityTier as string | undefined,
          verdict: (o.verdict as string) ?? '',
          feedbackJson: (o.feedbackJson as Record<string, unknown>) ?? {},
          iterationCount: (o.iterationCount as number) ?? run.attemptNo,
          completedAt,
        } satisfies ReviewResult & { completedAt: string };
        break;

      case 'assets':
        results.assets = {
          assetIds: (o.assetIds as string[]) ?? [],
          featuredImageUrl: o.featuredImageUrl as string | undefined,
          skipped: o.skipped as boolean | undefined,
          errorCode: o.errorCode as string | undefined,
          errorMessage: o.errorMessage as string | undefined,
          completedAt,
        } satisfies AssetsResult & { completedAt: string };
        break;

      case 'preview':
        results.preview = {
          imageMap: (o.imageMap as Record<string, string>) ?? {},
          altTexts: (o.altTexts as Record<string, string>) ?? {},
          categories: (o.categories as string[]) ?? [],
          tags: (o.tags as string[]) ?? [],
          seoOverrides: (o.seoOverrides as { title: string; slug: string; metaDescription: string }) ?? { title: '', slug: '', metaDescription: '' },
          suggestedPublishDate: o.suggestedPublishDate as string | undefined,
          composedHtml: (o.composedHtml as string) ?? '',
          autoDerived: o.autoDerived as boolean | undefined,
          completedAt,
        } satisfies PreviewResult & { completedAt: string };
        break;

      case 'publish':
        results.publish = {
          wordpressPostId: (o.wordpressPostId as number) ?? 0,
          publishedUrl: (o.publishedUrl as string) ?? '',
          completedAt,
        } satisfies PublishResult & { completedAt: string };
        break;
    }
  }

  return results;
}

function deriveIterationCount(stageRuns: StageRunPayload[]): number {
  const reviewRuns = stageRuns.filter((r) => r.stage === 'review');
  if (reviewRuns.length === 0) return 0;
  return Math.max(...reviewRuns.map((r) => r.attemptNo));
}

function deriveLastError(stageRuns: StageRunPayload[]): string | null {
  const failed = stageRuns.filter((r) => r.status === 'failed' && r.errorMessage);
  if (failed.length === 0) return null;
  // Return the most recent failure (runs come sorted desc by created_at from API)
  return failed[0].errorMessage ?? null;
}

// ─── Default context (used while loading) ─────────────────────────────────────

function buildDefaultContext(projectId: string): PipelineMachineContext {
  return {
    projectId,
    channelId: null,
    projectTitle: '',
    mode: null,
    autopilotConfig: null,
    templateId: null,
    stageResults: {},
    stageStatus: {},
    iterationCount: 0,
    lastError: null,
    pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
    creditSettings: DEFAULT_CREDIT_SETTINGS,
    paused: false,
    pauseReason: null,
    pendingDrillIn: null,
    returnPromptOpen: false,
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  children: React.ReactNode;
  /** Optional overrides for pipelineSettings / creditSettings (e.g. from channel config) */
  pipelineSettings?: PipelineSettings;
  creditSettings?: CreditSettings;
}

export function ProjectContextProvider({
  projectId,
  children,
  pipelineSettings = DEFAULT_PIPELINE_SETTINGS,
  creditSettings = DEFAULT_CREDIT_SETTINGS,
}: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [context, setContext] = useState<PipelineMachineContext>(() => buildDefaultContext(projectId));

  // Session-local state (no server source in 14.1)
  const [stageStatus, setStageStatusState] = useState<Partial<Record<PipelineStage, Record<string, unknown>>>>({});
  const [pendingDrillIn, setPendingDrillInState] = useState<'assets' | 'preview' | null>(null);
  const [returnPromptOpen, setReturnPromptOpenState] = useState(false);
  const [pauseReason, setPauseReasonState] = useState<PauseReason | null>(null);

  // Increment to trigger re-fetch
  const [fetchSeq, setFetchSeq] = useState(0);
  const refetch = useCallback(() => setFetchSeq((n) => n + 1), []);

  // Track active fetch so cleanup can cancel
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    setIsLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json() as Promise<{ data: ProjectRow | null; error: { message: string } | null }>),
      fetch(`/api/projects/${projectId}/stages`).then((r) => r.json() as Promise<{ data: { stageRuns: StageRunPayload[]; project: { mode: string | null; paused: boolean } } | null; error: { message: string } | null }>),
    ])
      .then(([projectRes, stagesRes]) => {
        if (!activeRef.current) return;

        if (projectRes.error) throw new Error(projectRes.error.message);
        if (stagesRes.error) throw new Error(stagesRes.error.message);

        const project = projectRes.data;
        if (!project) throw new Error('Project not found');

        const stageRuns = stagesRes.data?.stageRuns ?? [];

        const derived = deriveStageResults(stageRuns);
        const iterationCount = deriveIterationCount(stageRuns);
        const lastError = deriveLastError(stageRuns);

        setContext({
          projectId: project.id,
          channelId: project.channel_id,
          projectTitle: project.title,
          mode: project.mode,
          autopilotConfig: project.autopilot_config_json,
          templateId: project.template_id,
          stageResults: derived,
          stageStatus,
          iterationCount,
          lastError,
          pipelineSettings,
          creditSettings,
          paused: project.paused,
          pauseReason,
          pendingDrillIn,
          returnPromptOpen,
        });

        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!activeRef.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });

    return () => {
      activeRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, fetchSeq]);

  // Keep context in sync when session-local state changes (after initial load)
  useEffect(() => {
    if (isLoading) return;
    setContext((prev) => ({
      ...prev,
      stageStatus,
      pendingDrillIn,
      returnPromptOpen,
      pauseReason,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageStatus, pendingDrillIn, returnPromptOpen, pauseReason]);

  const setStageStatus = useCallback(
    (stage: PipelineStage, status: Record<string, unknown>) => {
      setStageStatusState((prev) => ({ ...prev, [stage]: status }));
    },
    [],
  );
  const setPendingDrillIn = useCallback((value: 'assets' | 'preview' | null) => setPendingDrillInState(value), []);
  const setReturnPromptOpen = useCallback((value: boolean) => setReturnPromptOpenState(value), []);
  const setPauseReason = useCallback((value: PauseReason | null) => setPauseReasonState(value), []);

  const value: ProjectContextValue = {
    context,
    isLoading,
    error,
    refetch,
    setStageStatus,
    setPendingDrillIn,
    setReturnPromptOpen,
    setPauseReason,
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}
