import { describe, it, expect } from 'vitest';
import { mapProjectFromDb, mapProjectToDb } from '../db';

const dbRow = {
  id: 'proj-1',
  title: 'Test Project',
  research_id: null,
  current_stage: 'brainstorm',
  completed_stages: [],
  status: 'active',
  winner: false,
  video_style_config: null,
  channel_id: null,
  mode: 'step-by-step' as const,
  autopilot_config_json: null,
  autopilot_template_id: null,
  abort_requested_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
};

describe('mapProjectFromDb', () => {
  it('converts snake_case DB row to camelCase Project', () => {
    const result = mapProjectFromDb(dbRow);
    expect(result.id).toBe('proj-1');
    expect(result.title).toBe('Test Project');
    expect(result.currentStage).toBe('brainstorm');
    expect(result.completedStages).toEqual([]);
    expect(result.mode).toBe('step-by-step');
    expect(result.researchId).toBeNull();
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });
});

describe('mapProjectToDb', () => {
  it('converts partial camelCase to snake_case insert shape', () => {
    const result = mapProjectToDb({ title: 'New', currentStage: 'brainstorm', status: 'active' });
    expect(result.title).toBe('New');
    expect(result.current_stage).toBe('brainstorm');
    expect(result.status).toBe('active');
    expect((result as Record<string, unknown>).currentStage).toBeUndefined();
  });
});
