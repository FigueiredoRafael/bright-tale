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
