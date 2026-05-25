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
} from "./discovery.js";

// Production Agent schemas
export {
  productionInputSchema,
  productionOutputSchema,
  validateProductionInput,
  validateProductionOutput,
  type ProductionInput as ProductionSchemaInput,
  type ProductionOutput as ProductionSchemaOutput,
} from "./production.js";

// Review Agent schemas
export {
  qualityTierSchema,
  rubricChecksSchema,
  reviewOutputSchema,
  validateReviewOutput,
  type QualityTier,
  type RubricChecks,
  type ReviewOutput as ReviewSchemaOutput,
} from "./review.js";

// Research API schemas
export {
  createResearchSchema,
  updateResearchSchema,
  listResearchQuerySchema,
  addSourceSchema,
} from "./research.js";

// Projects API schemas
export {
  createProjectSchema,
  updateProjectSchema,
  listProjectsQuerySchema,
  bulkOperationSchema,
  markWinnerSchema,
} from "./projects.js";

// Stages API schemas
export { createStageSchema, createRevisionSchema } from "./stages.js";

// Templates API schemas
export {
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
} from "./templates.js";

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
} from "./wordpress.js";

// Assets API schemas
export {
  searchUnsplashQuerySchema,
  saveAssetSchema,
  validateSearchUnsplashQuery,
  validateSaveAsset,
  type SearchUnsplashQuery,
  type SaveAsset,
} from "./assets.js";

// Video Draft schemas
export {
  createVideoSchema,
  updateVideoSchema,
  videoQuerySchema,
  type CreateVideoInput,
  type UpdateVideoInput,
  type VideoQuery,
} from "./videos.js";

// Shorts Draft schemas
export {
  createShortsSchema,
  updateShortsSchema,
  shortsQuerySchema,
  shortItemSchema,
  type CreateShortsInput,
  type UpdateShortsInput,
  type ShortsQuery,
} from "./shorts.js";

// Podcast Draft schemas
export {
  createPodcastSchema,
  updatePodcastSchema,
  podcastQuerySchema,
  talkingPointSchema,
  type CreatePodcastInput,
  type UpdatePodcastInput,
  type PodcastQuery,
} from "./podcasts.js";

// Content Drafts (cross-medium) schemas
export {
  mediumSchema,
  deriveDraftRequestSchema,
  deriveDraftResponseSchema,
  type Medium,
  type DeriveDraftRequest,
  type DeriveDraftResponse,
} from "./content-drafts.js";

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
} from "./ideas.js";

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
} from "./organizations.js";

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
} from "./channels.js";

// Personas schemas
export {
  createPersonaSchema,
  updatePersonaSchema,
  togglePersonaSchema,
  type CreatePersonaInput,
  type UpdatePersonaInput,
  type TogglePersonaInput,
} from "./personas.js";

// Persona Guardrails schemas
export {
  guardrailCategorySchema,
  createGuardrailSchema,
  updateGuardrailSchema,
  toggleGuardrailSchema,
  type CreateGuardrailInput,
  type UpdateGuardrailInput,
  type ToggleGuardrailInput,
} from "./persona-guardrails.js";

// Persona Archetypes schemas
export {
  createArchetypeSchema,
  updateArchetypeSchema,
  toggleArchetypeSchema,
  type CreateArchetypeInput,
  type UpdateArchetypeInput,
  type ToggleArchetypeInput,
} from "./persona-archetypes.js";

// Channel Personas schemas
export {
  assignChannelPersonaSchema,
  setPrimaryChannelPersonaSchema,
  type AssignChannelPersonaInput,
  type SetPrimaryChannelPersonaInput,
} from "./channel-personas.js";

// Pipeline Settings & Credit Settings schemas
export {
  updatePipelineSettingsSchema,
  pipelineSettingsResponseSchema,
  updateCreditSettingsSchema,
  creditSettingsResponseSchema,
  type UpdatePipelineSettingsInput,
  type PipelineSettingsResponse,
  type UpdateCreditSettingsInput,
  type CreditSettingsResponse,
} from "./pipeline-settings.js";

// Autopilot Config schemas
export * from "./autopilotConfig.js";

// Autopilot Templates schemas
export * from "./autopilotTemplates.js";

// Project Setup schemas
export * from "./projectSetup.js";

// Tracks API schemas
export {
  addTrackSchema,
  updateTrackSchema,
  type AddTrackInput,
  type UpdateTrackInput,
} from "./tracks.js";

// Publish-target schemas
export {
  PUBLISH_TARGET_TYPES,
  publishTargetSchema,
  type PublishTargetType,
  type PublishTarget,
} from "./publishTargets.js";

// Video Asset Bundle schema (issue #216)
export {
  videoAssetBundleSchema,
  type BundleImage,
  type BundleText,
  type VideoAssetBundle,
} from "./videoAssetBundle.js";

// YouTube Publish params schema (issue #222 / S10)
export {
  youtubePublishParams,
  type YouTubePublishParams,
} from "./youtubePublishParams.js";
