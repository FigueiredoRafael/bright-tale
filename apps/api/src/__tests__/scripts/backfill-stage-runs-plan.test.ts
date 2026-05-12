/**
 * Slice 13 (#21) — pure planning logic for the backfill script.
 *
 * Tests verify the algorithm against fixture pipeline_state_json + payload
 * combinations. The script itself (DB calls + CLI) is exercised manually
 * against a snapshot.
 */
import { describe, it, expect } from 'vitest';
import {
  planProjectBackfill,
  type PayloadIndex,
  type ProjectRow,
} from '../../../../../scripts/lib/backfill-stage-runs-plan';

function emptyPayloads(overrides: Partial<PayloadIndex> = {}): PayloadIndex {
  return {
    brainstorm: null,
    research: null,
    draft: null,
    ...overrides,
  };
}

function project(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 'proj-1',
    current_stage: 'brainstorm',
    mode: 'autopilot',
    paused: false,
    pipeline_state_json: { currentStage: 'brainstorm', stageResults: {} },
    ...overrides,
  };
}

describe('planProjectBackfill', () => {
  it('skips when pipeline_state_json is null/empty', () => {
    const plan = planProjectBackfill(project({ pipeline_state_json: null }), emptyPayloads());
    expect(plan.kind).toBe('skip');
  });

  it('quarantines when projects.current_stage drifts from pipeline_state_json.currentStage', () => {
    const plan = planProjectBackfill(
      project({
        current_stage: 'research',
        pipeline_state_json: { currentStage: 'brainstorm', stageResults: {} },
      }),
      emptyPayloads(),
    );
    expect(plan.kind).toBe('quarantine');
    if (plan.kind === 'quarantine') expect(plan.reason).toContain('drift');
  });

  it('quarantines when a completed stage in pipeline_state_json has no payload row', () => {
    const plan = planProjectBackfill(
      project({
        current_stage: 'research',
        pipeline_state_json: {
          currentStage: 'research',
          stageResults: { brainstorm: { ideas: [] } },
        },
      }),
      emptyPayloads(), // brainstorm payload missing → orphaned
    );
    expect(plan.kind).toBe('quarantine');
    if (plan.kind === 'quarantine') expect(plan.reason).toContain('missing');
  });

  it('produces a completed brainstorm Stage Run when payload exists', () => {
    const plan = planProjectBackfill(
      project({
        current_stage: 'research',
        pipeline_state_json: { currentStage: 'research', stageResults: { brainstorm: {} } },
      }),
      emptyPayloads({
        brainstorm: { id: 'bd-1', session_id: 'sess-1', created_at: '2026-05-11T10:00:00Z' },
      }),
    );
    expect(plan.kind).toBe('apply');
    if (plan.kind === 'apply') {
      const completed = plan.stageRuns.filter((s) => s.status === 'completed');
      expect(completed).toHaveLength(1);
      expect(completed[0].stage).toBe('brainstorm');
      expect(completed[0].payload_ref).toEqual({ kind: 'brainstorm_draft', id: 'bd-1' });
    }
  });

  it('inserts queued Stage Run for the in-flight currentStage when no findings exist yet', () => {
    const plan = planProjectBackfill(
      project({
        current_stage: 'research',
        pipeline_state_json: { currentStage: 'research', stageResults: { brainstorm: {} } },
      }),
      emptyPayloads({
        brainstorm: { id: 'bd-1', session_id: null, created_at: '2026-05-11T10:00:00Z' },
        research: { id: 'rs-1', status: 'queued', created_at: '2026-05-11T10:30:00Z' },
      }),
    );
    expect(plan.kind).toBe('apply');
    if (plan.kind === 'apply') {
      const inflight = plan.stageRuns.find((s) => s.stage === 'research');
      expect(inflight?.status).toBe('queued');
    }
  });

  it('inserts awaiting_user(manual_advance) for in-flight research when findings already exist', () => {
    const plan = planProjectBackfill(
      project({
        current_stage: 'research',
        pipeline_state_json: { currentStage: 'research', stageResults: { brainstorm: {} } },
      }),
      emptyPayloads({
        brainstorm: { id: 'bd-1', session_id: null, created_at: '2026-05-11T10:00:00Z' },
        research: { id: 'rs-1', status: 'completed', created_at: '2026-05-11T10:30:00Z' },
      }),
    );
    if (plan.kind === 'apply') {
      const inflight = plan.stageRuns.find((s) => s.stage === 'research');
      expect(inflight?.status).toBe('awaiting_user');
      expect(inflight?.awaiting_reason).toBe('manual_advance');
    }
  });

  it("maps legacy mode 'step-by-step' → 'manual' and 'overview'/'supervised' → 'autopilot'", () => {
    const stepByStep = planProjectBackfill(
      project({
        pipeline_state_json: {
          currentStage: 'brainstorm',
          stageResults: {},
          mode: 'step-by-step',
        },
      }),
      emptyPayloads(),
    );
    if (stepByStep.kind === 'apply') expect(stepByStep.mode).toBe('manual');

    const overview = planProjectBackfill(
      project({
        pipeline_state_json: { currentStage: 'brainstorm', stageResults: {}, mode: 'overview' },
      }),
      emptyPayloads(),
    );
    if (overview.kind === 'apply') expect(overview.mode).toBe('autopilot');
  });

  it('carries paused from pipeline_state_json to the column', () => {
    const plan = planProjectBackfill(
      project({
        pipeline_state_json: { currentStage: 'brainstorm', stageResults: {}, paused: true },
      }),
      emptyPayloads(),
    );
    if (plan.kind === 'apply') expect(plan.paused).toBe(true);
  });

  it('skips when stageResults is empty AND there is no useful currentStage transition', () => {
    const plan = planProjectBackfill(
      project({ current_stage: null, pipeline_state_json: { stageResults: {} } }),
      emptyPayloads(),
    );
    expect(plan.kind).toBe('skip');
  });
});
