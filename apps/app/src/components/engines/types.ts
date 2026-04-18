export type PipelineStage =
  | 'brainstorm'
  | 'research'
  | 'draft'
  | 'review'
  | 'assets'
  | 'preview'
  | 'publish';

export const PIPELINE_STAGES: PipelineStage[] = [
  'brainstorm', 'research', 'draft', 'review', 'assets', 'preview', 'publish',
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
  // From preview stage
  previewImageMap?: Record<string, string>;
  previewAltTexts?: Record<string, string>;
  previewCategories?: string[];
  previewTags?: string[];
  previewSeoOverrides?: { title: string; slug: string; metaDescription: string };
  previewPublishDate?: string;
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

export interface PreviewResult {
  imageMap: Record<string, string>;  // role → assetId
  altTexts: Record<string, string>;  // role → alt text
  categories: string[];
  tags: string[];
  seoOverrides: { title: string; slug: string; metaDescription: string };
  suggestedPublishDate?: string;
  composedHtml: string;  // client-side preview (display only)
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
  | PreviewResult
  | PublishResult;

export interface BaseEngineProps {
  mode: 'generate' | 'import';
  channelId: string;
  context: PipelineContext;
  onComplete: (result: StageResult) => void;
  onBack?: (targetStage?: PipelineStage) => void;
  onStageProgress?: (partial: Partial<StageResult>) => void;
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
    preview?: PreviewResult & { completedAt: string };
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
