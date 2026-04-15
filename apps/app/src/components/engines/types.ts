export type PipelineStage =
  | 'brainstorm'
  | 'research'
  | 'draft'
  | 'review'
  | 'assets'
  | 'publish';

export const PIPELINE_STAGES: PipelineStage[] = [
  'brainstorm', 'research', 'draft', 'review', 'assets', 'publish',
];

export interface PipelineContext {
  ideaId?: string;
  ideaTitle?: string;
  ideaVerdict?: string;
  ideaCoreTension?: string;
  brainstormSessionId?: string;
  researchSessionId?: string;
  approvedCardsCount?: number;
  researchLevel?: string;
  draftId?: string;
  draftTitle?: string;
  draftType?: string;
  canonicalCoreJson?: Record<string, unknown>;
  reviewScore?: number;
  reviewVerdict?: string;
  iterationCount?: number;
  feedbackJson?: Record<string, unknown>;
  assetIds?: string[];
  featuredImageUrl?: string;
  wordpressPostId?: number;
  publishedUrl?: string;
  projectId?: string;
  projectTitle?: string;
  channelId?: string;
}

export interface BrainstormResult {
  ideaId: string;
  ideaTitle: string;
  ideaVerdict: string;
  ideaCoreTension: string;
  brainstormSessionId?: string;
}

export interface ResearchResult {
  researchSessionId: string;
  approvedCardsCount: number;
  researchLevel: string;
}

export interface DraftResult {
  draftId: string;
  draftTitle: string;
  draftContent: string;
}

export interface ReviewResult {
  score: number;
  verdict: string;
  feedbackJson: Record<string, unknown>;
  iterationCount: number;
}

export interface AssetsResult {
  assetIds: string[];
  featuredImageUrl?: string;
}

export interface PublishResult {
  wordpressPostId: number;
  publishedUrl: string;
}

export type StageResult =
  | BrainstormResult
  | ResearchResult
  | DraftResult
  | ReviewResult
  | AssetsResult
  | PublishResult;

export interface BaseEngineProps {
  mode: 'generate' | 'import';
  channelId: string;
  context: PipelineContext;
  onComplete: (result: StageResult) => void;
  onBack?: (targetStage?: PipelineStage) => void;
}

export interface PipelineState {
  mode: 'step-by-step' | 'auto';
  currentStage: PipelineStage;
  stageResults: {
    brainstorm?: BrainstormResult & { completedAt: string };
    research?: ResearchResult & { completedAt: string };
    draft?: DraftResult & { completedAt: string };
    review?: ReviewResult & { completedAt: string };
    assets?: AssetsResult & { completedAt: string };
    publish?: PublishResult & { completedAt: string };
  };
  autoConfig: {
    maxReviewIterations: number;
    targetScore: number;
    pausedAt?: PipelineStage;
  };
}

export const DEFAULT_PIPELINE_STATE: PipelineState = {
  mode: 'step-by-step',
  currentStage: 'brainstorm',
  stageResults: {},
  autoConfig: {
    maxReviewIterations: 5,
    targetScore: 90,
  },
};
