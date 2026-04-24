/**
 * Mappers between Supabase snake_case DB rows and camelCase domain types.
 * The DB is snake_case (Postgres convention). Our BC_* contracts are camelCase.
 * Mappers are the ONLY place where this translation happens.
 */

import type { Json } from "../types/database.js"
import type { Persona } from "../types/agents.js";

// ─── Project ──────────────────────────────────────────────────────────────────

export type DbProject = {
  id: string;
  title: string;
  research_id: string | null;
  current_stage: string;
  completed_stages: string[];
  auto_advance: boolean;
  status: string;
  winner: boolean;
  video_style_config: string | null;
  created_at: string;
  updated_at: string;
};

export type DomainProject = {
  id: string;
  title: string;
  researchId: string | null;
  currentStage: string;
  completedStages: string[];
  autoAdvance: boolean;
  status: string;
  winner: boolean;
  videoStyleConfig: string | null;
  createdAt: string;
  updatedAt: string;
};

export function mapProjectFromDb(row: DbProject): DomainProject {
  return {
    id: row.id,
    title: row.title,
    researchId: row.research_id,
    currentStage: row.current_stage,
    completedStages: row.completed_stages,
    autoAdvance: row.auto_advance,
    status: row.status,
    winner: row.winner,
    videoStyleConfig: row.video_style_config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProjectToDb(
  input: Partial<DomainProject>
): Partial<DbProject> {
  const out: Partial<DbProject> = {};
  if (input.title !== undefined) out.title = input.title;
  if (input.researchId !== undefined) out.research_id = input.researchId;
  if (input.currentStage !== undefined) out.current_stage = input.currentStage;
  if (input.completedStages !== undefined) out.completed_stages = input.completedStages;
  if (input.autoAdvance !== undefined) out.auto_advance = input.autoAdvance;
  if (input.status !== undefined) out.status = input.status;
  if (input.winner !== undefined) out.winner = input.winner;
  if (input.videoStyleConfig !== undefined) out.video_style_config = input.videoStyleConfig;
  return out;
}

// ─── Stage ────────────────────────────────────────────────────────────────────

export type DbStage = {
  id: string;
  project_id: string;
  stage_type: string;
  yaml_artifact: string;
  version: number;
  created_at: string;
};

export type DomainStage = {
  id: string;
  projectId: string;
  stageType: string;
  yamlArtifact: string;
  version: number;
  createdAt: string;
};

export function mapStageFromDb(row: DbStage): DomainStage {
  return {
    id: row.id,
    projectId: row.project_id,
    stageType: row.stage_type,
    yamlArtifact: row.yaml_artifact,
    version: row.version,
    createdAt: row.created_at,
  };
}

export function mapStageToDb(input: Partial<DomainStage>): Partial<DbStage> {
  const out: Partial<DbStage> = {};
  if (input.projectId !== undefined) out.project_id = input.projectId;
  if (input.stageType !== undefined) out.stage_type = input.stageType;
  if (input.yamlArtifact !== undefined) out.yaml_artifact = input.yamlArtifact;
  if (input.version !== undefined) out.version = input.version;
  return out;
}

// ─── ResearchArchive ──────────────────────────────────────────────────────────

export type DbResearchArchive = {
  id: string;
  title: string;
  theme: string;
  research_content: string;
  projects_count: number;
  winners_count: number;
  created_at: string;
  updated_at: string;
};

export type DomainResearchArchive = {
  id: string;
  title: string;
  theme: string;
  researchContent: string;
  projectsCount: number;
  winnersCount: number;
  createdAt: string;
  updatedAt: string;
};

export function mapResearchArchiveFromDb(row: DbResearchArchive): DomainResearchArchive {
  return {
    id: row.id,
    title: row.title,
    theme: row.theme,
    researchContent: row.research_content,
    projectsCount: row.projects_count,
    winnersCount: row.winners_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapResearchArchiveToDb(input: Partial<DomainResearchArchive>): Partial<DbResearchArchive> {
  const out: Partial<DbResearchArchive> = {};
  if (input.title !== undefined) out.title = input.title;
  if (input.theme !== undefined) out.theme = input.theme;
  if (input.researchContent !== undefined) out.research_content = input.researchContent;
  if (input.projectsCount !== undefined) out.projects_count = input.projectsCount;
  if (input.winnersCount !== undefined) out.winners_count = input.winnersCount;
  return out;
}

// ─── AgentPrompt ──────────────────────────────────────────────────────────────

export type DbAgentPrompt = {
  id: string;
  name: string;
  slug: string;
  stage: string;
  instructions: string;
  input_schema: string | null;
  output_schema: string | null;
  created_at: string;
  updated_at: string;
};

export type DomainAgentPrompt = {
  id: string;
  name: string;
  slug: string;
  stage: string;
  instructions: string;
  inputSchema: string | null;
  outputSchema: string | null;
  createdAt: string;
  updatedAt: string;
};

export function mapAgentPromptFromDb(row: DbAgentPrompt): DomainAgentPrompt {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    stage: row.stage,
    instructions: row.instructions,
    inputSchema: row.input_schema,
    outputSchema: row.output_schema,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Phase 2.5 pipeline ────────────────────────────────────────────────────
// F2-015: brainstorm_sessions, research_sessions, content_drafts, content_assets

export type DbBrainstormSession = {
  id: string;
  org_id: string;
  user_id: string;
  channel_id: string | null;
  project_id: string | null;
  input_mode: string;
  input_json: Record<string, unknown>;
  model_tier: string;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type DomainBrainstormSession = {
  id: string;
  orgId: string;
  userId: string;
  channelId: string | null;
  projectId: string | null;
  inputMode: string;
  inputJson: Record<string, unknown>;
  modelTier: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export function mapBrainstormSessionFromDb(row: DbBrainstormSession): DomainBrainstormSession {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    channelId: row.channel_id,
    projectId: row.project_id,
    inputMode: row.input_mode,
    inputJson: row.input_json,
    modelTier: row.model_tier,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type DbResearchSession = {
  id: string;
  org_id: string;
  user_id: string;
  channel_id: string | null;
  idea_id: string | null;
  project_id: string | null;
  level: string;
  focus_tags: string[];
  input_json: Record<string, unknown>;
  cards_json: unknown | null;
  approved_cards_json: unknown | null;
  refined_angle_json: unknown | null;
  pivot_applied: boolean;
  model_tier: string;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type DomainResearchSession = {
  id: string;
  orgId: string;
  userId: string;
  channelId: string | null;
  ideaId: string | null;
  projectId: string | null;
  level: string;
  focusTags: string[];
  inputJson: Record<string, unknown>;
  cardsJson: unknown | null;
  approvedCardsJson: unknown | null;
  refinedAngleJson: unknown | null;
  pivotApplied: boolean;
  modelTier: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export function mapResearchSessionFromDb(row: DbResearchSession): DomainResearchSession {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    channelId: row.channel_id,
    ideaId: row.idea_id,
    projectId: row.project_id,
    level: row.level,
    focusTags: row.focus_tags,
    inputJson: row.input_json,
    cardsJson: row.cards_json,
    approvedCardsJson: row.approved_cards_json,
    refinedAngleJson: row.refined_angle_json,
    pivotApplied: row.pivot_applied,
    modelTier: row.model_tier,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type DbContentDraft = {
  id: string;
  org_id: string;
  user_id: string;
  channel_id: string | null;
  idea_id: string | null;
  research_session_id: string | null;
  project_id: string | null;
  persona_id: string | null;
  type: string;
  title: string | null;
  canonical_core_json: unknown | null;
  draft_json: unknown | null;
  review_feedback_json: unknown | null;
  production_settings_json: unknown | null;
  status: string;
  review_score: number | null;
  review_verdict: string;
  iteration_count: number;
  approved_at: string | null;
  wordpress_post_id: number | null;
  scheduled_at: string | null;
  published_at: string | null;
  published_url: string | null;
  created_at: string;
  updated_at: string;
};

export type DomainContentDraft = {
  id: string;
  orgId: string;
  userId: string;
  channelId: string | null;
  ideaId: string | null;
  researchSessionId: string | null;
  projectId: string | null;
  personaId: string | null;
  type: string;
  title: string | null;
  canonicalCoreJson: unknown | null;
  draftJson: unknown | null;
  reviewFeedbackJson: unknown | null;
  productionSettingsJson: unknown | null;
  status: string;
  reviewScore: number | null;
  reviewVerdict: string;
  iterationCount: number;
  approvedAt: string | null;
  wordpressPostId: number | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  publishedUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export function mapContentDraftFromDb(row: DbContentDraft): DomainContentDraft {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    channelId: row.channel_id,
    ideaId: row.idea_id,
    researchSessionId: row.research_session_id,
    projectId: row.project_id,
    personaId: row.persona_id,
    type: row.type,
    title: row.title,
    canonicalCoreJson: row.canonical_core_json,
    draftJson: row.draft_json,
    reviewFeedbackJson: row.review_feedback_json,
    productionSettingsJson: row.production_settings_json,
    status: row.status,
    reviewScore: row.review_score,
    reviewVerdict: row.review_verdict,
    iterationCount: row.iteration_count,
    approvedAt: row.approved_at,
    wordpressPostId: row.wordpress_post_id,
    scheduledAt: row.scheduled_at,
    publishedAt: row.published_at,
    publishedUrl: row.published_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type DbContentAsset = {
  id: string;
  org_id: string;
  user_id: string;
  draft_id: string;
  type: string;
  url: string;
  provider: string | null;
  meta_json: Record<string, unknown>;
  credits_used: number;
  position: number | null;
  role: string | null;
  alt_text: string | null;
  webp_url: string | null;
  source_type: string;
  created_at: string;
  updated_at: string;
};

export type DomainContentAsset = {
  id: string;
  orgId: string;
  userId: string;
  draftId: string;
  type: string;
  url: string;
  provider: string | null;
  metaJson: Record<string, unknown>;
  creditsUsed: number;
  position: number | null;
  role: string | null;
  altText: string | null;
  webpUrl: string | null;
  sourceType: string;
  createdAt: string;
  updatedAt: string;
};

export function mapContentAssetFromDb(row: DbContentAsset): DomainContentAsset {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    draftId: row.draft_id,
    type: row.type,
    url: row.url,
    provider: row.provider,
    metaJson: row.meta_json,
    creditsUsed: row.credits_used,
    position: row.position,
    role: row.role,
    altText: row.alt_text,
    webpUrl: row.webp_url,
    sourceType: row.source_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Review Iteration ────────────────────────────────────────────────────────

export type DbReviewIteration = {
  id: string;
  draft_id: string;
  iteration: number;
  score: number | null;
  verdict: string | null;
  feedback_json: unknown | null;
  created_at: string;
};

export type DomainReviewIteration = {
  id: string;
  draftId: string;
  iteration: number;
  score: number | null;
  verdict: string | null;
  feedbackJson: unknown | null;
  createdAt: string;
};

export function mapReviewIterationFromDb(row: DbReviewIteration): DomainReviewIteration {
  return {
    id: row.id,
    draftId: row.draft_id,
    iteration: row.iteration,
    score: row.score,
    verdict: row.verdict,
    feedbackJson: row.feedback_json,
    createdAt: row.created_at,
  };
}

// ─── Persona ──────────────────────────────────────────────────────────────────

export interface DbPersona {
  id: string;
  slug: string;
  name: string;
  avatar_url: string | null;
  bio_short: string;
  bio_long: string;
  primary_domain: string;
  domain_lens: string;
  approved_categories: string[];
  writing_voice_json: Json;
  eeat_signals_json: Json;
  soul_json: Json;
  wp_author_id: number | null;
  archetype_slug: string | null;
  avatar_params_json: Json | null | undefined;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function mapPersonaFromDb(row: DbPersona): Persona {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    avatarUrl: row.avatar_url,
    bioShort: row.bio_short,
    bioLong: row.bio_long,
    primaryDomain: row.primary_domain,
    domainLens: row.domain_lens,
    approvedCategories: row.approved_categories,
    writingVoiceJson: (row.writing_voice_json ?? {}) as unknown as Persona['writingVoiceJson'],
    eeatSignalsJson: (row.eeat_signals_json ?? {}) as unknown as Persona['eeatSignalsJson'],
    soulJson: (row.soul_json ?? {}) as unknown as Persona['soulJson'],
    wpAuthorId: row.wp_author_id,
    archetypeSlug: row.archetype_slug,
    avatarParamsJson: (row.avatar_params_json ?? null) as unknown as Persona['avatarParamsJson'],
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPersonaToDb(input: Partial<Persona>): Partial<DbPersona> {
  const out: Partial<DbPersona> = {};
  if (input.slug !== undefined) out.slug = input.slug;
  if (input.name !== undefined) out.name = input.name;
  if (input.avatarUrl !== undefined) out.avatar_url = input.avatarUrl;
  if (input.bioShort !== undefined) out.bio_short = input.bioShort;
  if (input.bioLong !== undefined) out.bio_long = input.bioLong;
  if (input.primaryDomain !== undefined) out.primary_domain = input.primaryDomain;
  if (input.domainLens !== undefined) out.domain_lens = input.domainLens;
  if (input.approvedCategories !== undefined) out.approved_categories = input.approvedCategories;
  if (input.writingVoiceJson !== undefined) out.writing_voice_json = input.writingVoiceJson as unknown as Json;
  if (input.eeatSignalsJson !== undefined) out.eeat_signals_json = input.eeatSignalsJson as unknown as Json;
  if (input.soulJson !== undefined) out.soul_json = input.soulJson as unknown as Json;
  if (input.wpAuthorId !== undefined) out.wp_author_id = input.wpAuthorId;
  if (input.archetypeSlug !== undefined) out.archetype_slug = input.archetypeSlug;
  if (input.avatarParamsJson !== undefined) out.avatar_params_json = input.avatarParamsJson as unknown as Json;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  return out;
}

// ─── PersonaGuardrail ─────────────────────────────────────────────────────────

export type GuardrailCategory =
  | 'content_boundaries'
  | 'tone_constraints'
  | 'factual_rules'
  | 'behavioral_rules'

export interface DbPersonaGuardrail {
  id: string;
  category: GuardrailCategory;
  label: string;
  rule_text: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DomainPersonaGuardrail {
  id: string;
  category: GuardrailCategory;
  label: string;
  ruleText: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export function mapPersonaGuardrailFromDb(row: DbPersonaGuardrail): DomainPersonaGuardrail {
  return {
    id: row.id,
    category: row.category,
    label: row.label,
    ruleText: row.rule_text,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPersonaGuardrailToDb(input: Partial<DomainPersonaGuardrail>): Partial<DbPersonaGuardrail> {
  const out: Partial<DbPersonaGuardrail> = {};
  if (input.category !== undefined) out.category = input.category;
  if (input.label !== undefined) out.label = input.label;
  if (input.ruleText !== undefined) out.rule_text = input.ruleText;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  if (input.sortOrder !== undefined) out.sort_order = input.sortOrder;
  return out;
}

// ─── PersonaArchetype ─────────────────────────────────────────────────────────

export interface ArchetypeOverlay {
  constraints: string[];
  behavioralAdditions: string[];
}

export interface DbPersonaArchetype {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  default_fields_json: Json;
  behavioral_overlay_json: Json;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Public variant — behavioral_overlay_json excluded
export interface DomainPersonaArchetypePublic {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  defaultFieldsJson: Record<string, unknown>;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Admin variant — includes overlay
export interface DomainPersonaArchetypeAdmin extends DomainPersonaArchetypePublic {
  behavioralOverlayJson: ArchetypeOverlay;
}

export function mapPersonaArchetypePublic(row: DbPersonaArchetype): DomainPersonaArchetypePublic {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon,
    defaultFieldsJson: (row.default_fields_json ?? {}) as unknown as Record<string, unknown>,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPersonaArchetypeAdmin(row: DbPersonaArchetype): DomainPersonaArchetypeAdmin {
  const overlay = row.behavioral_overlay_json as { constraints?: string[]; behavioralAdditions?: string[] } | null;
  return {
    ...mapPersonaArchetypePublic(row),
    behavioralOverlayJson: {
      constraints: overlay?.constraints ?? [],
      behavioralAdditions: overlay?.behavioralAdditions ?? [],
    },
  };
}

export function mapPersonaArchetypeToDb(
  input: Partial<DomainPersonaArchetypeAdmin>
): Partial<DbPersonaArchetype> {
  const out: Partial<DbPersonaArchetype> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.description !== undefined) out.description = input.description;
  if (input.icon !== undefined) out.icon = input.icon;
  if (input.defaultFieldsJson !== undefined) out.default_fields_json = input.defaultFieldsJson as unknown as Json;
  if (input.behavioralOverlayJson !== undefined) out.behavioral_overlay_json = input.behavioralOverlayJson as unknown as Json;
  if (input.sortOrder !== undefined) out.sort_order = input.sortOrder;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  return out;
}

// ─── ChannelPersona ───────────────────────────────────────────────────────────

export interface DbChannelPersona {
  channel_id: string;
  persona_id: string;
  is_primary: boolean;
  created_at: string;
}

export interface DomainChannelPersona {
  channelId: string;
  personaId: string;
  isPrimary: boolean;
  createdAt: string;
}

export function mapChannelPersonaFromDb(row: DbChannelPersona): DomainChannelPersona {
  return {
    channelId: row.channel_id,
    personaId: row.persona_id,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
  };
}
