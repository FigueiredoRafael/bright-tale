/**
 * T4.2 — FocusPanel unit tests (TDD).
 *
 * Acceptance criteria:
 *   AC1 — Panel composes breadcrumb + attempt tabs + EngineHost + Loop info card
 *   AC2 — Attempt tabs clickable; navigating to a tab loads read-only EngineHost (older attempts are read-only)
 *   AC3 — Loop info card appears only when relevant (attempt_no > 1)
 *   AC4 — URL state preserved on refresh (?stage=...&track=...&target=...&attempt=...)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { StageRun } from '@brighttale/shared/pipeline/inputs';

// ─── next/navigation mock ─────────────────────────────────────────────────────

const replaceMock = vi.fn();
let searchParamsStub = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => searchParamsStub,
  usePathname: () => '/projects/proj-1',
  useParams: () => ({ id: 'proj-1' }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// ─── useProjectStream mock ────────────────────────────────────────────────────

const useProjectStreamMock = vi.fn();
vi.mock('@/hooks/useProjectStream', () => ({
  useProjectStream: (...args: unknown[]) => useProjectStreamMock(...args),
}));

// ─── EngineHost mock — use a stub so we can assert rendering without full deps ─

vi.mock('../EngineHost', () => ({
  EngineHost: ({
    projectId,
    stage,
    attemptNo,
    trackId,
  }: {
    projectId: string;
    stage: string;
    attemptNo: number;
    trackId?: string;
  }) => (
    <div
      data-testid="engine-host"
      data-project-id={projectId}
      data-stage={stage}
      data-attempt-no={String(attemptNo)}
      data-track-id={trackId ?? ''}
    />
  ),
}));

import { FocusPanel } from '../FocusPanel';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<StageRun> = {}): StageRun {
  return {
    id: 'sr-default',
    projectId: 'proj-1',
    stage: 'research',
    status: 'completed',
    awaitingReason: null,
    payloadRef: null,
    attemptNo: 1,
    inputJson: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-05-15T00:00:00Z',
    updatedAt: '2026-05-15T00:00:00Z',
    outcomeJson: null,
    ...overrides,
  };
}

const EMPTY_STAGE_RUNS: Record<string, StageRun | null> = {
  brainstorm: null,
  research: null,
  canonical: null,
  production: null,
  review: null,
  assets: null,
  preview: null,
  publish: null,
};

function mockStream(
  stageRuns = EMPTY_STAGE_RUNS,
  allAttempts: StageRun[] = [],
) {
  useProjectStreamMock.mockReturnValue({
    stageRuns,
    liveEvent: null,
    isConnected: true,
    project: { mode: 'autopilot', paused: false },
    refresh: vi.fn(async () => undefined),
    allAttempts,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  searchParamsStub = new URLSearchParams();
  mockStream();
});

// ── Scaffold / smoke ──────────────────────────────────────────────────────────

describe('FocusPanel — scaffold', () => {
  it('renders without crashing when no stage is selected', () => {
    searchParamsStub = new URLSearchParams();
    mockStream();
    render(<FocusPanel projectId="proj-1" />);
    expect(screen.getByTestId('focus-panel')).toBeInTheDocument();
  });

  it('renders the empty-selection placeholder when no stage URL param is set', () => {
    searchParamsStub = new URLSearchParams();
    mockStream();
    render(<FocusPanel projectId="proj-1" />);
    expect(screen.getByTestId('focus-panel-empty')).toBeInTheDocument();
  });

  it('renders the engine area when a stage is selected', () => {
    searchParamsStub = new URLSearchParams('stage=research');
    mockStream({ ...EMPTY_STAGE_RUNS, research: makeRun() });
    render(<FocusPanel projectId="proj-1" />);
    expect(screen.getByTestId('focus-panel-content')).toBeInTheDocument();
  });
});

// ── AC1: Breadcrumb derives from URL + stage_run ──────────────────────────────

describe('FocusPanel — AC1: breadcrumb derives from URL + stage_run', () => {
  it('renders a breadcrumb when a stage is selected', () => {
    searchParamsStub = new URLSearchParams('stage=research');
    mockStream({ ...EMPTY_STAGE_RUNS, research: makeRun() });
    render(<FocusPanel projectId="proj-1" />);
    expect(screen.getByTestId('focus-panel-breadcrumb')).toBeInTheDocument();
  });

  it('breadcrumb includes "Shared" for shared stages (no track param)', () => {
    searchParamsStub = new URLSearchParams('stage=research');
    mockStream({ ...EMPTY_STAGE_RUNS, research: makeRun({ stage: 'research' }) });
    render(<FocusPanel projectId="proj-1" />);
    const crumb = screen.getByTestId('focus-panel-breadcrumb');
    expect(crumb.textContent).toContain('Shared');
  });

  it('breadcrumb includes the stage label', () => {
    searchParamsStub = new URLSearchParams('stage=research');
    mockStream({ ...EMPTY_STAGE_RUNS, research: makeRun({ stage: 'research' }) });
    render(<FocusPanel projectId="proj-1" />);
    const crumb = screen.getByTestId('focus-panel-breadcrumb');
    expect(crumb.textContent).toContain('Research');
  });

  it('breadcrumb shows "confidence loop" for research stage with attempt_no > 1', () => {
    searchParamsStub = new URLSearchParams('stage=research&attempt=3');
    const run3 = makeRun({ stage: 'research', attemptNo: 3 });
    mockStream(
      { ...EMPTY_STAGE_RUNS, research: run3 },
      [
        makeRun({ stage: 'research', attemptNo: 1 }),
        makeRun({ stage: 'research', attemptNo: 2 }),
        run3,
      ],
    );
    render(<FocusPanel projectId="proj-1" />);
    const crumb = screen.getByTestId('focus-panel-breadcrumb');
    expect(crumb.textContent).toContain('confidence loop');
  });

  it('breadcrumb shows "revision loop" for review stage with attempt_no > 1', () => {
    searchParamsStub = new URLSearchParams('stage=review&attempt=2');
    const run2 = makeRun({ stage: 'review', attemptNo: 2 });
    mockStream(
      { ...EMPTY_STAGE_RUNS, review: run2 },
      [makeRun({ stage: 'review', attemptNo: 1 }), run2],
    );
    render(<FocusPanel projectId="proj-1" />);
    const crumb = screen.getByTestId('focus-panel-breadcrumb');
    expect(crumb.textContent).toContain('revision loop');
  });

  it('breadcrumb shows the attempt number', () => {
    searchParamsStub = new URLSearchParams('stage=research&attempt=3');
    const run3 = makeRun({ stage: 'research', attemptNo: 3 });
    mockStream(
      { ...EMPTY_STAGE_RUNS, research: run3 },
      [
        makeRun({ stage: 'research', attemptNo: 1 }),
        makeRun({ stage: 'research', attemptNo: 2 }),
        run3,
      ],
    );
    render(<FocusPanel projectId="proj-1" />);
    const crumb = screen.getByTestId('focus-panel-breadcrumb');
    expect(crumb.textContent).toContain('attempt 3');
  });

  it('breadcrumb does NOT show loop segment when attempt_no is 1', () => {
    searchParamsStub = new URLSearchParams('stage=research&attempt=1');
    mockStream({ ...EMPTY_STAGE_RUNS, research: makeRun({ stage: 'research', attemptNo: 1 }) });
    render(<FocusPanel projectId="proj-1" />);
    const crumb = screen.getByTestId('focus-panel-breadcrumb');
    expect(crumb.textContent).not.toContain('confidence loop');
    expect(crumb.textContent).not.toContain('revision loop');
  });
});

// ── AC1: EngineHost composition ───────────────────────────────────────────────

describe('FocusPanel — AC1: EngineHost composition', () => {
  it('renders EngineHost with the selected stage and attempt', () => {
    searchParamsStub = new URLSearchParams('stage=research&attempt=1');
    mockStream({ ...EMPTY_STAGE_RUNS, research: makeRun() });
    render(<FocusPanel projectId="proj-1" />);
    const host = screen.getByTestId('engine-host');
    expect(host).toBeInTheDocument();
    expect(host).toHaveAttribute('data-stage', 'research');
    expect(host).toHaveAttribute('data-attempt-no', '1');
  });

  it('passes trackId to EngineHost when track param is set', () => {
    searchParamsStub = new URLSearchParams('stage=review&track=track-1&attempt=1');
    mockStream({ ...EMPTY_STAGE_RUNS, review: makeRun({ stage: 'review', trackId: 'track-1' }) });
    render(<FocusPanel projectId="proj-1" />);
    const host = screen.getByTestId('engine-host');
    expect(host).toHaveAttribute('data-track-id', 'track-1');
  });

  it('defaults to attempt 1 when no attempt param in URL', () => {
    searchParamsStub = new URLSearchParams('stage=brainstorm');
    mockStream({ ...EMPTY_STAGE_RUNS, brainstorm: makeRun({ stage: 'brainstorm', attemptNo: 1 }) });
    render(<FocusPanel projectId="proj-1" />);
    const host = screen.getByTestId('engine-host');
    expect(host).toHaveAttribute('data-attempt-no', '1');
  });
});

// ── AC2: Attempt tabs + click navigation ─────────────────────────────────────

describe('FocusPanel — AC2: attempt tabs + click navigation', () => {
  it('renders one attempt tab per attempt when multiple attempts exist', () => {
    searchParamsStub = new URLSearchParams('stage=research&attempt=3');
    const run3 = makeRun({ stage: 'research', attemptNo: 3, status: 'running' });
    mockStream(
      { ...EMPTY_STAGE_RUNS, research: run3 },
      [
        makeRun({ stage: 'research', attemptNo: 1, status: 'failed' }),
        makeRun({ stage: 'research', attemptNo: 2, status: 'completed' }),
        run3,
      ],
    );
    render(<FocusPanel projectId="proj-1" />);
    expect(screen.getByTestId('attempt-tab-1')).toBeInTheDocument();
    expect(screen.getByTestId('attempt-tab-2')).toBeInTheDocument();
    expect(screen.getByTestId('attempt-tab-3')).toBeInTheDocument();
  });

  it('attempt tab shows the attempt_no', () => {
    searchParamsStub = new URLSearchParams('stage=research&attempt=1');
    mockStream({ ...EMPTY_STAGE_RUNS, research: makeRun({ attemptNo: 1 }) }, [
      makeRun({ attemptNo: 1 }),
    ]);
    render(<FocusPanel projectId="proj-1" />);
    expect(screen.getByTestId('attempt-tab-1').textContent).toContain('#1');
  });

  it('attempt tab shows the status', () => {
    searchParamsStub = new URLSearchParams('stage=research&attempt=1');
    const run = makeRun({ stage: 'research', attemptNo: 1, status: 'failed' });
    mockStream({ ...EMPTY_STAGE_RUNS, research: run }, [run]);
    render(<FocusPanel projectId="proj-1" />);
    const tab = screen.getByTestId('attempt-tab-1');
    expect(tab).toHaveAttribute('data-status', 'failed');
  });

  it('attempt tab shows score from outcomeJson when present (review stage)', () => {
    searchParamsStub = new URLSearchParams('stage=review&attempt=1');
    const run = makeRun({
      stage: 'review',
      status: 'completed',
      attemptNo: 1,
      outcomeJson: { score: 78 },
    });
    mockStream({ ...EMPTY_STAGE_RUNS, review: run }, [run]);
    render(<FocusPanel projectId="proj-1" />);
    const tab = screen.getByTestId('attempt-tab-1');
    expect(tab.textContent).toContain('78');
  });

  it('marks the currently selected attempt tab as active', () => {
    searchParamsStub = new URLSearchParams('stage=research&attempt=2');
    const run1 = makeRun({ stage: 'research', attemptNo: 1, status: 'failed' });
    const run2 = makeRun({ stage: 'research', attemptNo: 2, status: 'running' });
    mockStream({ ...EMPTY_STAGE_RUNS, research: run2 }, [run1, run2]);
    render(<FocusPanel projectId="proj-1" />);
    expect(screen.getByTestId('attempt-tab-2')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('attempt-tab-1')).toHaveAttribute('data-active', 'false');
  });

  it('clicking an attempt tab updates the URL ?attempt param', () => {
    searchParamsStub = new URLSearchParams('stage=research&attempt=2');
    const run1 = makeRun({ stage: 'research', attemptNo: 1, status: 'completed' });
    const run2 = makeRun({ stage: 'research', attemptNo: 2, status: 'running' });
    mockStream({ ...EMPTY_STAGE_RUNS, research: run2 }, [run1, run2]);
    render(<FocusPanel projectId="proj-1" />);
    fireEvent.click(screen.getByTestId('attempt-tab-1'));
    expect(replaceMock).toHaveBeenCalled();
    const url = replaceMock.mock.calls[0][0] as string;
    expect(url).toContain('attempt=1');
    expect(url).toContain('stage=research');
  });

  it('clicking an attempt tab preserves other URL params (stage, track)', () => {
    searchParamsStub = new URLSearchParams('stage=review&track=track-1&attempt=2&v=focus');
    const run1 = makeRun({ stage: 'review', attemptNo: 1, status: 'completed', trackId: 'track-1' });
    const run2 = makeRun({ stage: 'review', attemptNo: 2, status: 'running', trackId: 'track-1' });
    mockStream({ ...EMPTY_STAGE_RUNS, review: run2 }, [run1, run2]);
    render(<FocusPanel projectId="proj-1" />);
    fireEvent.click(screen.getByTestId('attempt-tab-1'));
    const url = replaceMock.mock.calls[0][0] as string;
    expect(url).toContain('stage=review');
    expect(url).toContain('track=track-1');
    expect(url).toContain('v=focus');
    expect(url).toContain('attempt=1');
  });

  it('renders a single tab when only one attempt exists (no multi-attempt header clutter)', () => {
    searchParamsStub = new URLSearchParams('stage=brainstorm&attempt=1');
    const run = makeRun({ stage: 'brainstorm', attemptNo: 1, status: 'completed' });
    mockStream({ ...EMPTY_STAGE_RUNS, brainstorm: run }, [run]);
    render(<FocusPanel projectId="proj-1" />);
    expect(screen.getByTestId('attempt-tab-1')).toBeInTheDocument();
    expect(screen.queryByTestId('attempt-tab-2')).not.toBeInTheDocument();
  });
});

// ── AC3: Loop info card gated on attempt_no > 1 ──────────────────────────────

describe('FocusPanel — AC3: loop info card gated on attempt_no > 1', () => {
  it('does NOT show the loop info card when attempt_no is 1', () => {
    searchParamsStub = new URLSearchParams('stage=research&attempt=1');
    const run = makeRun({ stage: 'research', attemptNo: 1 });
    mockStream({ ...EMPTY_STAGE_RUNS, research: run }, [run]);
    render(<FocusPanel projectId="proj-1" />);
    expect(screen.queryByTestId('loop-info-card')).not.toBeInTheDocument();
  });

  it('shows the loop info card when attempt_no > 1', () => {
    searchParamsStub = new URLSearchParams('stage=research&attempt=3');
    const run1 = makeRun({ stage: 'research', attemptNo: 1, status: 'failed' });
    const run2 = makeRun({ stage: 'research', attemptNo: 2, status: 'failed' });
    const run3 = makeRun({ stage: 'research', attemptNo: 3, status: 'running' });
    mockStream({ ...EMPTY_STAGE_RUNS, research: run3 }, [run1, run2, run3]);
    render(<FocusPanel projectId="proj-1" />);
    expect(screen.getByTestId('loop-info-card')).toBeInTheDocument();
  });

  it('loop info card lists prior attempts in iteration history', () => {
    searchParamsStub = new URLSearchParams('stage=research&attempt=3');
    const run1 = makeRun({ stage: 'research', attemptNo: 1, status: 'failed', outcomeJson: { confidence: 0.42 } });
    const run2 = makeRun({ stage: 'research', attemptNo: 2, status: 'failed', outcomeJson: { confidence: 0.62 } });
    const run3 = makeRun({ stage: 'research', attemptNo: 3, status: 'running' });
    mockStream({ ...EMPTY_STAGE_RUNS, research: run3 }, [run1, run2, run3]);
    render(<FocusPanel projectId="proj-1" />);
    const card = screen.getByTestId('loop-info-card');
    expect(card.textContent).toContain('attempt 1');
    expect(card.textContent).toContain('attempt 2');
  });

  it('loop info card shows score for review stage prior attempts', () => {
    searchParamsStub = new URLSearchParams('stage=review&attempt=2');
    const run1 = makeRun({ stage: 'review', attemptNo: 1, status: 'completed', outcomeJson: { score: 78 } });
    const run2 = makeRun({ stage: 'review', attemptNo: 2, status: 'running' });
    mockStream({ ...EMPTY_STAGE_RUNS, review: run2 }, [run1, run2]);
    render(<FocusPanel projectId="proj-1" />);
    const card = screen.getByTestId('loop-info-card');
    expect(card.textContent).toContain('78');
  });

  it('loop info card shows confidence for research stage prior attempts', () => {
    searchParamsStub = new URLSearchParams('stage=research&attempt=2');
    const run1 = makeRun({ stage: 'research', attemptNo: 1, status: 'failed', outcomeJson: { confidence: 0.42 } });
    const run2 = makeRun({ stage: 'research', attemptNo: 2, status: 'running' });
    mockStream({ ...EMPTY_STAGE_RUNS, research: run2 }, [run1, run2]);
    render(<FocusPanel projectId="proj-1" />);
    const card = screen.getByTestId('loop-info-card');
    expect(card.textContent).toContain('0.42');
  });
});

// ── AC4: URL state preservation on refresh ────────────────────────────────────

describe('FocusPanel — AC4: URL state preserved on refresh', () => {
  it('reads stage from ?stage URL param and renders matching engine', () => {
    searchParamsStub = new URLSearchParams('stage=canonical');
    mockStream({ ...EMPTY_STAGE_RUNS, canonical: makeRun({ stage: 'canonical' }) });
    render(<FocusPanel projectId="proj-1" />);
    expect(screen.getByTestId('engine-host')).toHaveAttribute('data-stage', 'canonical');
  });

  it('reads track from ?track URL param and passes to EngineHost', () => {
    searchParamsStub = new URLSearchParams('stage=production&track=track-99');
    mockStream({ ...EMPTY_STAGE_RUNS, production: makeRun({ stage: 'production', trackId: 'track-99' }) });
    render(<FocusPanel projectId="proj-1" />);
    expect(screen.getByTestId('engine-host')).toHaveAttribute('data-track-id', 'track-99');
  });

  it('reads attempt from ?attempt URL param and passes to EngineHost', () => {
    searchParamsStub = new URLSearchParams('stage=research&attempt=2');
    const run = makeRun({ stage: 'research', attemptNo: 2 });
    mockStream({ ...EMPTY_STAGE_RUNS, research: run }, [makeRun({ attemptNo: 1 }), run]);
    render(<FocusPanel projectId="proj-1" />);
    expect(screen.getByTestId('engine-host')).toHaveAttribute('data-attempt-no', '2');
  });

  it('selecting a tab updates ?attempt in URL without losing other params', () => {
    searchParamsStub = new URLSearchParams('stage=research&attempt=3&view=focus&locale=en');
    const run1 = makeRun({ stage: 'research', attemptNo: 1, status: 'failed' });
    const run2 = makeRun({ stage: 'research', attemptNo: 2, status: 'failed' });
    const run3 = makeRun({ stage: 'research', attemptNo: 3, status: 'running' });
    mockStream({ ...EMPTY_STAGE_RUNS, research: run3 }, [run1, run2, run3]);
    render(<FocusPanel projectId="proj-1" />);
    fireEvent.click(screen.getByTestId('attempt-tab-1'));
    const url = replaceMock.mock.calls[0][0] as string;
    expect(url).toContain('view=focus');
    expect(url).toContain('locale=en');
    expect(url).toContain('stage=research');
    expect(url).toContain('attempt=1');
  });
});
