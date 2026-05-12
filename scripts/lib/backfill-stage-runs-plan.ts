/**
 * Pure planning logic for the pipeline_state_json → stage_runs backfill.
 *
 * Returns a structured plan from a Project row + the prior payload rows the
 * caller has already loaded. No DB calls here — keeps the algorithm
 * testable against fixtures.
 */

export type Stage =
  | 'brainstorm'
  | 'research'
  | 'draft'
  | 'review'
  | 'assets'
  | 'preview'
  | 'publish';

const STAGES: readonly Stage[] = [
  'brainstorm',
  'research',
  'draft',
  'review',
  'assets',
  'preview',
  'publish',
];

export interface ProjectRow {
  id: string;
  current_stage: string | null;
  mode: string | null;
  paused: boolean | null;
  pipeline_state_json: Record<string, unknown> | null;
}

export interface PayloadIndex {
  brainstorm: { id: string; session_id: string | null; created_at: string } | null;
  research: { id: string; status?: string | null; created_at: string; completed_at?: string | null } | null;
  draft: {
    id: string;
    status?: string | null;
    created_at: string;
    updated_at: string;
    published_url?: string | null;
  } | null;
}

export interface StageRunInsert {
  project_id: string;
  stage: Stage;
  status: 'queued' | 'running' | 'awaiting_user' | 'completed' | 'skipped';
  awaiting_reason: 'manual_paste' | 'manual_advance' | null;
  payload_ref: { kind: string; id: string } | null;
  attempt_no: number;
  started_at: string | null;
  finished_at: string | null;
}

export type BackfillPlan =
  | { kind: 'apply'; mode: 'autopilot' | 'manual'; paused: boolean; stageRuns: StageRunInsert[] }
  | { kind: 'quarantine'; reason: string }
  | { kind: 'skip'; reason: string };

export function planProjectBackfill(project: ProjectRow, payloads: PayloadIndex): BackfillPlan {
  const psj = project.pipeline_state_json;
  if (!psj || typeof psj !== 'object') {
    return { kind: 'skip', reason: 'pipeline_state_json is null/empty — nothing to migrate' };
  }

  const currentStageDb = project.current_stage as Stage | null;
  const currentStagePsj = (psj.currentStage as Stage | undefined) ?? undefined;

  if (currentStagePsj && currentStageDb && currentStagePsj !== currentStageDb) {
    return {
      kind: 'quarantine',
      reason: `drift: projects.current_stage=${currentStageDb} but pipeline_state_json.currentStage=${currentStagePsj}`,
    };
  }
  const currentStage: Stage | null = currentStagePsj ?? currentStageDb ?? null;
  if (currentStage && !STAGES.includes(currentStage)) {
    return { kind: 'quarantine', reason: `unknown currentStage ${String(currentStage)}` };
  }

  const stageResults = (psj.stageResults ?? {}) as Record<string, unknown>;

  const stageRuns: StageRunInsert[] = [];
  for (const stage of STAGES) {
    const completedHere = !!stageResults[stage];
    if (!completedHere) continue;

    const payloadRef = resolvePayloadRef(stage, payloads);
    if (payloadRef === 'orphaned') {
      return {
        kind: 'quarantine',
        reason: `stage ${stage} reports completed in pipeline_state_json but the corresponding payload row is missing`,
      };
    }

    const timestamps = resolveTimestamps(stage, payloads);

    stageRuns.push({
      project_id: project.id,
      stage,
      status: 'completed',
      awaiting_reason: null,
      payload_ref: payloadRef,
      attempt_no: 1,
      started_at: timestamps.startedAt,
      finished_at: timestamps.finishedAt,
    });
  }

  if (currentStage && !stageResults[currentStage]) {
    const inFlightHasFindings = hasInFlightFindings(currentStage, payloads);
    stageRuns.push({
      project_id: project.id,
      stage: currentStage,
      status: inFlightHasFindings ? 'awaiting_user' : 'queued',
      awaiting_reason: inFlightHasFindings ? 'manual_advance' : null,
      payload_ref: null,
      attempt_no: 1,
      started_at: null,
      finished_at: null,
    });
  }

  if (stageRuns.length === 0) {
    return { kind: 'skip', reason: 'no derivable Stage Runs from pipeline_state_json' };
  }

  const mode = deriveMode((psj.mode as string | undefined) ?? project.mode ?? null);
  const paused = Boolean(psj.paused ?? project.paused ?? false);

  return { kind: 'apply', mode, paused, stageRuns };
}

function resolvePayloadRef(
  stage: Stage,
  payloads: PayloadIndex,
): { kind: string; id: string } | 'orphaned' | null {
  switch (stage) {
    case 'brainstorm':
      if (payloads.brainstorm?.id) return { kind: 'brainstorm_draft', id: payloads.brainstorm.id };
      return 'orphaned';
    case 'research':
      if (payloads.research?.id) return { kind: 'research_session', id: payloads.research.id };
      return 'orphaned';
    case 'draft':
    case 'review':
    case 'assets':
    case 'preview':
    case 'publish':
      if (payloads.draft?.id) return { kind: 'content_draft', id: payloads.draft.id };
      return 'orphaned';
    default:
      return null;
  }
}

function resolveTimestamps(
  stage: Stage,
  payloads: PayloadIndex,
): { startedAt: string | null; finishedAt: string | null } {
  if (stage === 'brainstorm' && payloads.brainstorm) {
    return { startedAt: payloads.brainstorm.created_at, finishedAt: payloads.brainstorm.created_at };
  }
  if (stage === 'research' && payloads.research) {
    return {
      startedAt: payloads.research.created_at,
      finishedAt: payloads.research.completed_at ?? payloads.research.created_at,
    };
  }
  if (payloads.draft) {
    return { startedAt: payloads.draft.created_at, finishedAt: payloads.draft.updated_at };
  }
  return { startedAt: null, finishedAt: null };
}

function hasInFlightFindings(stage: Stage, payloads: PayloadIndex): boolean {
  if (stage === 'research') return payloads.research?.status === 'completed';
  if (stage === 'draft' || stage === 'review' || stage === 'assets' || stage === 'preview') {
    return Boolean(payloads.draft?.status && payloads.draft.status !== 'draft');
  }
  if (stage === 'publish') return Boolean(payloads.draft?.published_url);
  return false;
}

function deriveMode(legacy: string | null): 'autopilot' | 'manual' {
  // Legacy taxonomy: 'overview' | 'supervised' | 'step-by-step'.
  if (legacy === 'step-by-step' || legacy === 'manual') return 'manual';
  return 'autopilot';
}
