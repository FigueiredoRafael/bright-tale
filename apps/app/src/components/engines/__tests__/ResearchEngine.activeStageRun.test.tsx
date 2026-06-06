/**
 * ResearchEngine — issue #242 Module 6: progress modal driven by useActiveStageRun.
 *
 * 4 scenarios:
 *   (a) modal mounts when a fresh queued run is detected
 *   (b) modal stays mounted while status='running'
 *   (c) modal unmounts when status flips to 'completed'
 *   (d) modal does NOT mount when no active run exists
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { StandaloneProjectContextProvider } from '@/components/pipeline/ProjectContextProvider';
import { ResearchEngine } from '../ResearchEngine';
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types';
import type { ActiveStageRunResult } from '@/hooks/useActiveStageRun';

// ── useActiveStageRun mock — controlled per test ──────────────────────────────
const INACTIVE_RUN: ActiveStageRunResult = {
  runId: null, status: null, startedAt: null, isActive: false, isFresh: false,
};
let activeRunResult: ActiveStageRunResult = INACTIVE_RUN;
function setActiveRun(result: Partial<ActiveStageRunResult>) {
  activeRunResult = { ...INACTIVE_RUN, ...result };
}
vi.mock('@/hooks/useActiveStageRun', () => ({
  useActiveStageRun: () => activeRunResult,
}));

// ── GenerationProgressFloat mock — thin stub so SSE setup is not needed ───────
vi.mock('@/components/generation/GenerationProgressFloat', () => ({
  GenerationProgressFloat: ({ open, sessionId, onComplete, onFailed, onClose }: {
    open: boolean; sessionId: string;
    onComplete?: () => void; onFailed?: (msg: string) => void; onClose: () => void;
  }) =>
    open ? (
      <div
        data-testid="generation-progress-float"
        data-session-id={sessionId}
        onClick={onClose}
      >
        <button data-testid="gpf-complete" onClick={onComplete}>complete</button>
        <button data-testid="gpf-failed" onClick={() => onFailed?.('err')}>fail</button>
      </div>
    ) : null,
}));

vi.mock('@/hooks/use-analytics', () => ({ useAnalytics: () => ({ track: vi.fn() }) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/components/pipeline/PipelineAbortProvider', () => ({
  usePipelineAbort: () => null,
}));
vi.mock('@/hooks/use-auto-pilot-trigger', () => ({ useAutoPilotTrigger: vi.fn() }));
vi.mock('@/hooks/use-pipeline-tracker', () => ({
  usePipelineTracker: () => ({
    trackStarted: vi.fn(),
    trackCompleted: vi.fn(),
    trackFailed: vi.fn(),
    trackAction: vi.fn(),
  }),
}));

const SESSION_ID = 'rs-test-session-1';

function makeFetch() {
  return vi.fn().mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes('/api/agents')) {
      return { ok: true, json: async () => ({ data: { agents: [] }, error: null }) };
    }
    if (u.includes('/api/ideas/library')) {
      return { ok: true, json: async () => ({ data: { ideas: [] }, error: null }) };
    }
    if (u.includes(`/api/research-sessions/${SESSION_ID}`)) {
      return { ok: true, json: async () => ({ data: { session: { id: SESSION_ID } }, error: null }) };
    }
    return { ok: true, json: async () => ({ data: null, error: null }) };
  });
}

function wrap(sessionId?: string) {
  return (
    <StandaloneProjectContextProvider
      projectId="proj-1"
      channelId="ch-1"
      mode="step-by-step"
      pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
      creditSettings={DEFAULT_CREDIT_SETTINGS}
    >
      <ResearchEngine
        mode="generate"
        initialSession={sessionId ? { id: sessionId } as Record<string, unknown> : undefined}
        initialIdeaId="idea-1"
      />
    </StandaloneProjectContextProvider>
  );
}

let originalFetch: typeof global.fetch;
beforeEach(() => {
  originalFetch = global.fetch;
  activeRunResult = INACTIVE_RUN;
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

describe('ResearchEngine — issue #242: progress modal driven by stage_run status', () => {
  // Scenario (a): modal mounts when useActiveStageRun returns isActive=true (queued)
  it('mounts GenerationProgressFloat when a fresh queued run is detected', async () => {
    global.fetch = makeFetch();

    setActiveRun({
      runId: 'sr-research-1',
      status: 'queued',
      startedAt: '2026-05-26T10:00:00Z',
      isActive: true,
      isFresh: true,
    });

    render(wrap(SESSION_ID));

    await waitFor(() =>
      expect(screen.queryByTestId('generation-progress-float')).not.toBeNull(),
    );
  });

  // Scenario (b): modal stays mounted while status='running'
  it('keeps GenerationProgressFloat mounted while status transitions to running', async () => {
    global.fetch = makeFetch();

    setActiveRun({
      runId: 'sr-research-1',
      status: 'running',
      startedAt: '2026-05-26T10:00:00Z',
      isActive: true,
      isFresh: false,
    });

    render(wrap(SESSION_ID));

    await waitFor(() =>
      expect(screen.queryByTestId('generation-progress-float')).not.toBeNull(),
    );
  });

  // Scenario (c): modal unmounts when status flips to 'completed'
  it('unmounts GenerationProgressFloat when stage_run reaches completed status', async () => {
    global.fetch = makeFetch();

    setActiveRun({
      runId: 'sr-research-1',
      status: 'running',
      startedAt: '2026-05-26T10:00:00Z',
      isActive: true,
      isFresh: false,
    });

    const { rerender } = render(wrap(SESSION_ID));

    await waitFor(() =>
      expect(screen.queryByTestId('generation-progress-float')).not.toBeNull(),
    );

    // Transition to completed
    act(() => {
      setActiveRun({ runId: 'sr-research-1', status: 'completed', isActive: false, isFresh: false });
    });
    rerender(wrap(SESSION_ID));

    await waitFor(() =>
      expect(screen.queryByTestId('generation-progress-float')).toBeNull(),
    );
  });

  // Scenario (d): modal does NOT mount when no active run exists
  it('does not mount GenerationProgressFloat when no active run exists', async () => {
    global.fetch = makeFetch();
    // activeRunResult is INACTIVE_RUN by default (reset in beforeEach)

    render(wrap(SESSION_ID));
    await waitFor(() => expect(document.querySelector('[data-testid]')).toBeDefined());

    expect(screen.queryByTestId('generation-progress-float')).toBeNull();
  });
});
