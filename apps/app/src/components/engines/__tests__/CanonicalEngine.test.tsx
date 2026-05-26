import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { ProjectContextProvider } from '@/components/pipeline/ProjectContextProvider';
import { CanonicalEngine } from '../CanonicalEngine';
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

vi.mock('@/hooks/use-auto-pilot-trigger', () => ({
  useAutoPilotTrigger: vi.fn(),
}));

vi.mock('@/components/pipeline/PipelineAbortProvider', () => ({
  usePipelineAbort: () => null,
}));

vi.mock('@/hooks/use-pipeline-tracker', () => ({
  usePipelineTracker: () => ({
    trackStarted: vi.fn(),
    trackCompleted: vi.fn(),
    trackFailed: vi.fn(),
    trackAction: vi.fn(),
  }),
}));

vi.mock('@/components/billing/UpgradeProvider', () => ({
  useUpgrade: () => ({ handleMaybeCreditsError: vi.fn(() => false) }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}));

vi.mock('../PersonaCarousel', () => ({
  PersonaCarousel: () => <div data-testid="persona-carousel" />,
}));

const PROJECT_ID = 'p1';
const CHANNEL_ID = 'c1';

const PROJECT_ROW = {
  id: PROJECT_ID,
  channel_id: CHANNEL_ID,
  title: 'Test Project',
  mode: 'step-by-step',
  autopilot_config_json: null,
  template_id: null,
  paused: false,
};

const EMPTY_STAGES_RESPONSE = {
  data: { stageRuns: [], tracks: [], project: { mode: 'step-by-step', paused: false } },
  error: null,
};

/** A draft ID used in fetch mock responses. */
const DRAFT_ID = 'draft-canonical-1';

let originalFetch: typeof global.fetch;
beforeEach(() => {
  originalFetch = global.fetch;
  activeRunResult = INACTIVE_RUN;
});
afterEach(() => { global.fetch = originalFetch; vi.clearAllMocks(); });

function makeFetch() {
  return vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes('/stages')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_STAGES_RESPONSE) });
    }
    if ((url as string).includes('/api/agents')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { agents: [] }, error: null }) });
    }
    if ((url as string).includes('/api/personas')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [], error: null }) });
    }
    if ((url as string).includes(`/api/content-drafts/${DRAFT_ID}`)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { id: DRAFT_ID, canonical_core_json: null }, error: null }) });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: PROJECT_ROW, error: null }),
    });
  });
}

function wrap() {
  return (
    <ProjectContextProvider projectId={PROJECT_ID}>
      <CanonicalEngine projectId={PROJECT_ID} />
    </ProjectContextProvider>
  );
}

describe('CanonicalEngine', () => {
  it('mounts without crashing', () => {
    global.fetch = makeFetch();
    const { container } = render(wrap());
    expect(container).toBeTruthy();
  });
});

// ── issue #242 Module 3: progress modal driven by useActiveStageRun ───────────
describe('CanonicalEngine — issue #242: progress modal driven by stage_run status', () => {
  // Scenario (a): modal mounts when useActiveStageRun returns isActive=true (queued)
  it('mounts GenerationProgressFloat when a fresh queued run is detected', async () => {
    global.fetch = makeFetch();

    setActiveRun({
      runId: 'sr-canonical-1',
      status: 'queued',
      startedAt: '2026-05-26T10:00:00Z',
      isActive: true,
      isFresh: true,
    });

    render(wrap());

    await waitFor(() =>
      expect(screen.queryByTestId('generation-progress-float')).not.toBeNull(),
    );
  });

  // Scenario (b): modal stays mounted while status='running'
  it('keeps GenerationProgressFloat mounted while status transitions to running', async () => {
    global.fetch = makeFetch();

    setActiveRun({
      runId: 'sr-canonical-1',
      status: 'running',
      startedAt: '2026-05-26T10:00:00Z',
      isActive: true,
      isFresh: false,
    });

    render(wrap());

    await waitFor(() =>
      expect(screen.queryByTestId('generation-progress-float')).not.toBeNull(),
    );
  });

  // Scenario (c): modal unmounts when status flips to 'completed'
  it('unmounts GenerationProgressFloat when stage_run reaches completed status', async () => {
    global.fetch = makeFetch();

    setActiveRun({
      runId: 'sr-canonical-1',
      status: 'running',
      startedAt: '2026-05-26T10:00:00Z',
      isActive: true,
      isFresh: false,
    });

    const { rerender } = render(wrap());

    await waitFor(() =>
      expect(screen.queryByTestId('generation-progress-float')).not.toBeNull(),
    );

    // Transition to completed
    act(() => {
      setActiveRun({ runId: 'sr-canonical-1', status: 'completed', isActive: false, isFresh: false });
    });
    rerender(wrap());

    await waitFor(() =>
      expect(screen.queryByTestId('generation-progress-float')).toBeNull(),
    );
  });

  // Scenario (d): modal does NOT mount when no active run exists
  it('does not mount GenerationProgressFloat when no active run exists', async () => {
    global.fetch = makeFetch();
    // activeRunResult is INACTIVE_RUN by default

    render(wrap());
    await waitFor(() => expect(document.querySelector('[data-testid]')).toBeDefined());

    expect(screen.queryByTestId('generation-progress-float')).toBeNull();
  });
});
