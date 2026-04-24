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
  type ProductionInput as ProductionSchemaInput,
  type ProductionOutput as ProductionSchemaOutput,
} from "./production";

// Review Agent schemas
export {
  qualityTierSchema,
  rubricChecksSchema,
  reviewOutputSchema,
  validateReviewOutput,
  type QualityTier,
  type RubricChecks,
  type ReviewOutput as ReviewSchemaOutput,
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

// Organizations schemas
export {
  orgRoleSchema,
  planSchema,
  updateOrgSchema,
  createInviteSchema,
  updateMemberRoleSchema,
  updateMemberCreditLimitSchema,
  type OrgRole,
  type Plan,
  type UpdateOrg,
  type CreateInvite,
  type UpdateMemberRole,
  type UpdateMemberCreditLimit,
} from "./organizations";

// Channels schemas
export {
  channelTypeSchema,
  mediaTypeSchema,
  videoStyleSchema,
  modelTierSchema,
  createChannelSchema,
  updateChannelSchema,
  listChannelsQuerySchema,
  type ChannelType,
  type MediaType,
  type VideoStyle,
  type ModelTier,
  type CreateChannel,
  type UpdateChannel,
  type ListChannelsQuery,
} from "./channels";

// Personas schemas
export {
  createPersonaSchema,
  updatePersonaSchema,
  togglePersonaSchema,
  type CreatePersonaInput,
  type UpdatePersonaInput,
  type TogglePersonaInput,
} from "./personas";

// Persona Guardrails schemas
export {
  guardrailCategorySchema,
  createGuardrailSchema,
  updateGuardrailSchema,
  toggleGuardrailSchema,
  type CreateGuardrailInput,
  type UpdateGuardrailInput,
  type ToggleGuardrailInput,
} from "./persona-guardrails";

// Persona Archetypes schemas
export {
  createArchetypeSchema,
  updateArchetypeSchema,
  toggleArchetypeSchema,
  type CreateArchetypeInput,
  type UpdateArchetypeInput,
  type ToggleArchetypeInput,
} from "./persona-archetypes";

// Channel Personas schemas
export {
  assignChannelPersonaSchema,
  setPrimaryChannelPersonaSchema,
  type AssignChannelPersonaInput,
  type SetPrimaryChannelPersonaInput,
} from "./channel-personas";
