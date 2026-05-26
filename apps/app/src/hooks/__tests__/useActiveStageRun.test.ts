/**
 * useActiveStageRun — hook unit tests (TDD, Refs #242)
 *
 * Covers the 8 scenarios from PRD § Testing Decisions § Module 1.
 * Mocks useProjectStream via vi.mock so no Supabase/fetch setup needed.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StageRun } from '@brighttale/shared/pipeline/inputs';

// ─── Mock useProjectStream ─────────────────────────────────────────────────────

let streamStageRuns: Record<string, StageRun | null> = {};

vi.mock('@/hooks/useProjectStream', () => ({
  useProjectStream: () => ({
    stageRuns: streamStageRuns,
    liveEvent: null,
    isConnected: true,
    project: { mode: 'autopilot', rawMode: null, paused: false },
    tracks: [],
    refresh: vi.fn(async () => undefined),
    optimisticPatchStageRun: vi.fn(),
  }),
}));

// Import AFTER vi.mock so the mock is in place
import { useActiveStageRun } from '../useActiveStageRun';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const PROJECT_ID = 'proj-test';

function makeRun(overrides: Partial<StageRun> = {}): StageRun {
  return {
    id: 'sr-1',
    projectId: PROJECT_ID,
    stage: 'production',
    status: 'completed',
    awaitingReason: null,
    payloadRef: null,
    attemptNo: 1,
    inputJson: null,
    errorMessage: null,
    startedAt: '2026-05-26T00:00:00Z',
    finishedAt: '2026-05-26T00:05:00Z',
    createdAt: '2026-05-26T00:00:00Z',
    updatedAt: '2026-05-26T00:05:00Z',
    outcomeJson: null,
    trackId: 'track-1',
    ...overrides,
  };
}

function setStream(runs: Record<string, StageRun | null>) {
  streamStageRuns = runs;
}

const EMPTY = {
  brainstorm: null,
  research: null,
  canonical: null,
  production: null,
  review: null,
  assets: null,
  preview: null,
  publish: null,
};

beforeEach(() => {
  streamStageRuns = { ...EMPTY };
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('useActiveStageRun', () => {
  // Scenario 1: No matching stage_run in context
  it('returns null fields and false flags when no stage_run exists for (stage, trackId)', () => {
    setStream({ ...EMPTY, production: null });
    const { result } = renderHook(() =>
      useActiveStageRun(PROJECT_ID, 'production', 'track-1'),
    );
    expect(result.current.runId).toBeNull();
    expect(result.current.status).toBeNull();
    expect(result.current.startedAt).toBeNull();
    expect(result.current.isActive).toBe(false);
    expect(result.current.isFresh).toBe(false);
  });

  // Scenario 2: Matching queued run with a new ID
  it('returns isActive=true, isFresh=true for a queued run with a new runId', () => {
    setStream({
      ...EMPTY,
      production: makeRun({ id: 'sr-new', status: 'queued', trackId: 'track-1' }),
    });
    const { result } = renderHook(() =>
      useActiveStageRun(PROJECT_ID, 'production', 'track-1'),
    );
    expect(result.current.runId).toBe('sr-new');
    expect(result.current.status).toBe('queued');
    expect(result.current.isActive).toBe(true);
    expect(result.current.isFresh).toBe(true);
  });

  // Scenario 3: Matching running run with the same ID as last seen as active
  it('returns isActive=true, isFresh=false for a running run whose ID was already seen as active', () => {
    setStream({
      ...EMPTY,
      production: makeRun({ id: 'sr-active', status: 'queued', trackId: 'track-1' }),
    });
    const { result, rerender } = renderHook(() =>
      useActiveStageRun(PROJECT_ID, 'production', 'track-1'),
    );
    // First render: queued → isFresh true (hook has never seen this ID)
    expect(result.current.isFresh).toBe(true);
    expect(result.current.isActive).toBe(true);
    expect(result.current.runId).toBe('sr-active');

    // Transition to running (same ID). The hook has already recorded sr-active
    // as "last seen active", so isFresh flips to false on the next render.
    act(() => {
      setStream({
        ...EMPTY,
        production: makeRun({ id: 'sr-active', status: 'running', trackId: 'track-1' }),
      });
    });
    rerender();

    expect(result.current.isActive).toBe(true);
    expect(result.current.isFresh).toBe(false);
    expect(result.current.runId).toBe('sr-active');
  });

  // Scenario 4: Status transitions from running to completed
  it('flips isActive=false when status transitions to completed; same runId persists', () => {
    setStream({
      ...EMPTY,
      production: makeRun({ id: 'sr-done', status: 'running', trackId: 'track-1' }),
    });
    const { result, rerender } = renderHook(() =>
      useActiveStageRun(PROJECT_ID, 'production', 'track-1'),
    );
    expect(result.current.isActive).toBe(true);

    // Transition to completed
    act(() => {
      setStream({
        ...EMPTY,
        production: makeRun({ id: 'sr-done', status: 'completed', trackId: 'track-1' }),
      });
    });
    rerender();

    expect(result.current.isActive).toBe(false);
    expect(result.current.runId).toBe('sr-done');
    expect(result.current.isFresh).toBe(false);
  });

  // Scenario 5: A second new run inserted after the first completes
  it('flips isFresh=true again when a second new run is inserted after first completes', () => {
    // Start with first run completed
    setStream({
      ...EMPTY,
      production: makeRun({ id: 'sr-first', status: 'completed', trackId: 'track-1' }),
    });
    const { result, rerender } = renderHook(() =>
      useActiveStageRun(PROJECT_ID, 'production', 'track-1'),
    );
    expect(result.current.isFresh).toBe(false);

    // Second new run queued
    act(() => {
      setStream({
        ...EMPTY,
        production: makeRun({ id: 'sr-second', status: 'queued', trackId: 'track-1' }),
      });
    });
    rerender();

    expect(result.current.runId).toBe('sr-second');
    expect(result.current.isFresh).toBe(true);
    expect(result.current.isActive).toBe(true);
  });

  // Scenario 6: trackId mismatch — run exists for a different track
  it('returns isActive=false when run exists but for a different trackId', () => {
    setStream({
      ...EMPTY,
      production: makeRun({ id: 'sr-other', status: 'queued', trackId: 'track-OTHER' }),
    });
    const { result } = renderHook(() =>
      useActiveStageRun(PROJECT_ID, 'production', 'track-1'),
    );
    expect(result.current.isActive).toBe(false);
    expect(result.current.runId).toBeNull();
  });

  // Scenario 7: Shared stage (trackId null) — falls back to project-level latest run
  it('returns run data for shared stages when trackId is null', () => {
    setStream({
      ...EMPTY,
      brainstorm: makeRun({
        id: 'sr-bs',
        stage: 'brainstorm',
        status: 'running',
        trackId: null,
      }),
    });
    const { result } = renderHook(() =>
      useActiveStageRun(PROJECT_ID, 'brainstorm', null),
    );
    expect(result.current.runId).toBe('sr-bs');
    expect(result.current.isActive).toBe(true);
    expect(result.current.isFresh).toBe(true);
  });

  // Scenario 8: Wrong stage — run exists for a different stage, should not match
  it('returns null fields when a run exists for a different stage', () => {
    setStream({
      ...EMPTY,
      review: makeRun({ id: 'sr-review', stage: 'review', status: 'running', trackId: 'track-1' }),
    });
    const { result } = renderHook(() =>
      useActiveStageRun(PROJECT_ID, 'production', 'track-1'),
    );
    expect(result.current.runId).toBeNull();
    expect(result.current.isActive).toBe(false);
  });
});
