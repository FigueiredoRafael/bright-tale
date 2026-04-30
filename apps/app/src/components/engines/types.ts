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
  // Persona — set by DraftEngine on generation
  personaId?: string;
  personaName?: string;
  personaSlug?: string;
  personaWpAuthorId?: number | null;
  // Research scoring signals — set by ResearchEngine on approval
  researchPrimaryKeyword?: string;
  researchSecondaryKeywords?: string[];
  researchSearchIntent?: string;
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
  primaryKeyword?: string;
  secondaryKeywords?: string[];
  searchIntent?: string;
}

export interface DraftResult {
  draftId: string;
  draftTitle: string;
  draftContent: string;
  personaId?: string;
  personaName?: string;
  personaSlug?: string;
  personaWpAuthorId?: number | null;
}

export interface ReviewResult {
  score: number;
  qualityTier?: string;
  verdict: string;
  feedbackJson: Record<string, unknown>;
  iterationCount: number;
  /** Added in Wave 2 — populated by Task 2.11 iteration history */
  iterations?: import('@brighttale/shared').ReviewIterationSummary[];
  /** Added in Wave 2 — populated by ReviewEngine when storing iteration feedback */
  latestFeedbackJson?: import('@brighttale/shared').ReviewFeedbackJson | null;
}

export interface AssetsResult {
  assetIds: string[];
  featuredImageUrl?: string;
  /** True when assets stage was auto-skipped by the machine (mode='skip'). */
  skipped?: boolean;
  /** Set via STAGE_PROGRESS when generation fails — e.g. 'QUOTA_EXCEEDED'. No assetIds present. */
  errorCode?: string;
  errorMessage?: string;
}

export interface PreviewResult {
  imageMap: Record<string, string>;  // role → assetId
  altTexts: Record<string, string>;  // role → alt text
  categories: string[];
  tags: string[];
  seoOverrides: { title: string; slug: string; metaDescription: string };
  suggestedPublishDate?: string;
  composedHtml: string;  // client-side preview (display only)
  autoDerived?: boolean;
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

export interface PipelineSettings {
  reviewRejectThreshold: number;
  reviewApproveScore: number;
  reviewMaxIterations: number;
  defaultProviders: Record<string, string>;
  defaultModels: Record<string, string>;
}

export const DEFAULT_PIPELINE_SETTINGS: PipelineSettings = {
  reviewRejectThreshold: 40,
  reviewApproveScore: 90,
  reviewMaxIterations: 5,
  defaultProviders: {
    brainstorm: 'gemini',
    research: 'gemini',
    canonicalCore: 'gemini',
    draft: 'gemini',
    review: 'gemini',
    assets: 'gemini',
  },
  defaultModels: {},
};

export interface CreditSettings {
  costBlog: number;
  costVideo: number;
  costShorts: number;
  costPodcast: number;
  costCanonicalCore: number;
  costReview: number;
  costResearchSurface: number;
  costResearchMedium: number;
  costResearchDeep: number;
}

export const DEFAULT_CREDIT_SETTINGS: CreditSettings = {
  costBlog: 200,
  costVideo: 200,
  costShorts: 100,
  costPodcast: 150,
  costCanonicalCore: 80,
  costReview: 20,
  costResearchSurface: 60,
  costResearchMedium: 100,
  costResearchDeep: 180,
};

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
    maxReviewIterations: DEFAULT_PIPELINE_SETTINGS.reviewMaxIterations,
    targetScore: DEFAULT_PIPELINE_SETTINGS.reviewApproveScore,
  },
};
