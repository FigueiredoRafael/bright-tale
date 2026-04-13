/**
 * Mappers between Supabase snake_case DB rows and camelCase domain types.
 * The DB is snake_case (Postgres convention). Our BC_* contracts are camelCase.
 * Mappers are the ONLY place where this translation happens.
 */

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
  level: string;
  focus_tags: string[];
  input_json: Record<string, unknown>;
  cards_json: unknown | null;
  approved_cards_json: unknown | null;
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
  level: string;
  focusTags: string[];
  inputJson: Record<string, unknown>;
  cardsJson: unknown | null;
  approvedCardsJson: unknown | null;
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
    level: row.level,
    focusTags: row.focus_tags,
    inputJson: row.input_json,
    cardsJson: row.cards_json,
    approvedCardsJson: row.approved_cards_json,
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
  type: string;
  title: string | null;
  canonical_core_json: unknown | null;
  draft_json: unknown | null;
  review_feedback_json: unknown | null;
  status: string;
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
  type: string;
  title: string | null;
  canonicalCoreJson: unknown | null;
  draftJson: unknown | null;
  reviewFeedbackJson: unknown | null;
  status: string;
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
    type: row.type,
    title: row.title,
    canonicalCoreJson: row.canonical_core_json,
    draftJson: row.draft_json,
    reviewFeedbackJson: row.review_feedback_json,
    status: row.status,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
