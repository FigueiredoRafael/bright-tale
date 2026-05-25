/**
 * Slice 14.3 — useAutoPilotTrigger (ctx-only path) tests.
 *
 * After slice 14.3 the hook reads ONLY from ProjectContextProvider.
 * The xstate actor fallback is removed.
 *
 * Behaviors tested:
 *   1. When mode='supervised' + not paused + canFire() → fires exactly once.
 *   2. When mode='step-by-step' → does NOT fire.
 *   3. When paused=true → does NOT fire.
 *   4. When canFire()=false → does NOT fire.
 *   5. Fires again when rearmKey changes (review-loop re-iteration).
 *   6. Does NOT fire twice for the same rearmKey (idempotent).
 *   7. When ProjectContextProvider is absent → no-op, no crash.
 *   8. Mode 'overview' also triggers auto-fire (same as 'supervised').
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProjectContextProvider } from '@/components/pipeline/ProjectContextProvider';
import { useAutoPilotTrigger } from '../use-auto-pilot-trigger';

// ─── Mock fetch for ProjectContextProvider ───────────────────────────────────

const PROJECT_ID = 'proj-autopilot-test';
const CHANNEL_ID = 'ch-ap';

const BASE_PROJECT_ROW = {
  id: PROJECT_ID,
  channel_id: CHANNEL_ID,
  title: 'AutoPilot Test',
  mode: 'supervised' as const,
  autopilot_config_json: null,
  template_id: null,
  paused: false,
};

const EMPTY_STAGES_RESPONSE = {
  data: { stageRuns: [], tracks: [], project: { mode: 'supervised', paused: false } },
  error: null,
};

function makeFetch(overrides: Partial<typeof BASE_PROJECT_ROW> = {}) {
  return vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes('/stages')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(EMPTY_STAGES_RESPONSE),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({ data: { ...BASE_PROJECT_ROW, ...overrides }, error: null }),
    });
  });
}

let originalFetch: typeof global.fetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

// ─── Wrapper factories ────────────────────────────────────────────────────────

function makeWrapper(overrides: Partial<typeof BASE_PROJECT_ROW> = {}) {
  global.fetch = makeFetch(overrides);
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ProjectContextProvider projectId={PROJECT_ID}>
        {children}
      </ProjectContextProvider>
    );
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useAutoPilotTrigger — Slice 14.3 (ctx-only)', () => {
  it('fires once when mode=supervised, not paused, canFire=true', async () => {
    const fire = vi.fn();
    const wrapper = makeWrapper({ mode: 'supervised', paused: false });

    renderHook(
      () =>
        useAutoPilotTrigger({
          stage: 'brainstorm',
          canFire: () => true,
          fire,
        }),
      { wrapper },
    );

    // Allow the context fetch to resolve
    await act(async () => {
      await Promise.resolve();
    });

    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when mode=step-by-step', async () => {
    const fire = vi.fn();
    const wrapper = makeWrapper({ mode: 'step-by-step' as typeof BASE_PROJECT_ROW.mode, paused: false });

    renderHook(
      () =>
        useAutoPilotTrigger({
          stage: 'brainstorm',
          canFire: () => true,
          fire,
        }),
      { wrapper },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(fire).not.toHaveBeenCalled();
  });

  it('does NOT fire when paused=true', async () => {
    const fire = vi.fn();
    const wrapper = makeWrapper({ mode: 'supervised', paused: true });

    renderHook(
      () =>
        useAutoPilotTrigger({
          stage: 'research',
          canFire: () => true,
          fire,
        }),
      { wrapper },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(fire).not.toHaveBeenCalled();
  });

  it('does NOT fire when canFire() returns false', async () => {
    const fire = vi.fn();
    const wrapper = makeWrapper({ mode: 'supervised', paused: false });

    renderHook(
      () =>
        useAutoPilotTrigger({
          stage: 'research',
          canFire: () => false,
          fire,
        }),
      { wrapper },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(fire).not.toHaveBeenCalled();
  });

  it('fires again when rearmKey changes (review-loop re-iteration)', async () => {
    const fire = vi.fn();
    const wrapper = makeWrapper({ mode: 'supervised', paused: false });

    const { rerender } = renderHook(
      ({ rearmKey }: { rearmKey: number }) =>
        useAutoPilotTrigger({
          stage: 'review',
          canFire: () => true,
          fire,
          rearmKey,
        }),
      { wrapper, initialProps: { rearmKey: 1 } },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(fire).toHaveBeenCalledTimes(1);

    rerender({ rearmKey: 2 });

    await act(async () => {
      await Promise.resolve();
    });

    expect(fire).toHaveBeenCalledTimes(2);
  });

  it('does NOT fire twice for the same rearmKey (idempotent)', async () => {
    const fire = vi.fn();
    const wrapper = makeWrapper({ mode: 'supervised', paused: false });

    const { rerender } = renderHook(
      ({ rearmKey }: { rearmKey: number }) =>
        useAutoPilotTrigger({
          stage: 'brainstorm',
          canFire: () => true,
          fire,
          rearmKey,
        }),
      { wrapper, initialProps: { rearmKey: 1 } },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(fire).toHaveBeenCalledTimes(1);

    rerender({ rearmKey: 1 });

    await act(async () => {
      await Promise.resolve();
    });

    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire and does NOT crash when ProjectContextProvider is absent', () => {
    const fire = vi.fn();

    // No wrapper — no context
    expect(() => {
      renderHook(() =>
        useAutoPilotTrigger({
          stage: 'brainstorm',
          canFire: () => true,
          fire,
        }),
      );
    }).not.toThrow();

    expect(fire).not.toHaveBeenCalled();
  });

  it('fires when mode=overview (same as supervised)', async () => {
    const fire = vi.fn();
    const wrapper = makeWrapper({ mode: 'overview' as typeof BASE_PROJECT_ROW.mode, paused: false });

    renderHook(
      () =>
        useAutoPilotTrigger({
          stage: 'assets',
          canFire: () => true,
          fire,
        }),
      { wrapper },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(fire).toHaveBeenCalledTimes(1);
  });
});
