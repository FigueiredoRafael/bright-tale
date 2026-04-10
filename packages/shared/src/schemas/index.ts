/**
 * Central export point for all Zod schemas
 * Used for validating agent YAML inputs and outputs
 */

// Discovery Agent schemas
export {
  discoveryInputSchema,
  discoveryOutputSchema,
  validateDiscoveryInput,
  validateDiscoveryOutput,
  type DiscoveryInput,
  type DiscoveryOutput,
} from "./discovery";

// Production Agent schemas
export {
  productionInputSchema,
  productionOutputSchema,
  validateProductionInput,
  validateProductionOutput,
  type ProductionInput,
  type ProductionOutput,
} from "./production";

// Review Agent schemas
export {
  reviewInputSchema,
  reviewOutputSchema,
  reviewOutputBlogVideoSchema,
  reviewOutputPublicationSchema,
  validateReviewInput,
  validateReviewOutput,
  validateReviewOutputBlogVideo,
  validateReviewOutputPublication,
  type ReviewInput,
  type ReviewOutput,
  type ReviewOutputBlogVideo,
  type ReviewOutputPublication,
} from "./review";

// Research API schemas
export {
  createResearchSchema,
  updateResearchSchema,
  listResearchQuerySchema,
  addSourceSchema,
} from "./research";

// Projects API schemas
export {
  createProjectSchema,
  updateProjectSchema,
  listProjectsQuerySchema,
  bulkOperationSchema,
  markWinnerSchema,
} from "./projects";

// Stages API schemas
export { createStageSchema, createRevisionSchema } from "./stages";

// Templates API schemas
export {
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
} from "./templates";

// WordPress API schemas
export {
  testWordPressConnectionSchema,
  publishToWordPressSchema,
  fetchCategoriesQuerySchema,
  fetchTagsQuerySchema,
  validateTestConnection,
  validatePublishToWordPress,
  validateFetchCategoriesQuery,
  validateFetchTagsQuery,
  type TestWordPressConnection,
  type PublishToWordPress,
  type FetchCategoriesQuery,
  type FetchTagsQuery,
} from "./wordpress";

// Assets API schemas
export {
  searchUnsplashQuerySchema,
  saveAssetSchema,
  validateSearchUnsplashQuery,
  validateSaveAsset,
  type SearchUnsplashQuery,
  type SaveAsset,
} from "./assets";

// Video Draft schemas
export {
  createVideoSchema,
  updateVideoSchema,
  videoQuerySchema,
  type CreateVideoInput,
  type UpdateVideoInput,
  type VideoQuery,
} from "./videos";

// Shorts Draft schemas
export {
  createShortsSchema,
  updateShortsSchema,
  shortsQuerySchema,
  shortItemSchema,
  type CreateShortsInput,
  type UpdateShortsInput,
  type ShortsQuery,
} from "./shorts";

// Podcast Draft schemas
export {
  createPodcastSchema,
  updatePodcastSchema,
  podcastQuerySchema,
  talkingPointSchema,
  type CreatePodcastInput,
  type UpdatePodcastInput,
  type PodcastQuery,
} from "./podcasts";

// Ideas Library schemas
export {
  listIdeasQuerySchema,
  createIdeaSchema,
  updateIdeaSchema,
  importIdeasSchema,
  calculateSimilarity,
  ideaSourceTypes,
  ideaVerdicts,
  type IdeaSourceType,
  type IdeaVerdict,
  type ListIdeasQuery,
  type CreateIdeaInput,
  type UpdateIdeaInput,
  type ImportIdeasInput,
  type SimilarityWarning,
  type CreateIdeaResponse,
} from "./ideas";
