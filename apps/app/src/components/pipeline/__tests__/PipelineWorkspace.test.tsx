/**
 * T4.4 — PipelineWorkspace unit tests (TDD).
 *
 * Slices covered:
 *   1. Scaffold: renders ViewToggle in header
 *   2. When ?view=focus (or no view param), renders FocusSidebar + FocusPanel
 *   3. When ?view=graph, renders GraphView
 *   4. Does NOT render GraphView when in focus mode
 *   5. Does NOT render FocusSidebar/FocusPanel when in graph mode
 *   6. Passes projectId to all child components
 *   7. F2/F3: Awaiting banner at project scope (relocated from FocusPanel)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { StageRun } from '@brighttale/shared/pipeline/inputs';

// ── Router / navigation mock ──────────────────────────────────────────────────

let searchParamsStub = new URLSearchParams();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  useSearchParams: () => searchParamsStub,
  usePathname: () => '/projects/proj-1',
  useParams: () => ({ id: 'proj-1' }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// ── FocusSidebar mock ─────────────────────────────────────────────────────────

vi.mock('../FocusSidebar', () => ({
  FocusSidebar: ({ projectId }: { projectId: string }) => (
    <div data-testid="focus-sidebar" data-project-id={projectId} />
  ),
}));

// ── FocusPanel mock ───────────────────────────────────────────────────────────

vi.mock('../FocusPanel', () => ({
  FocusPanel: ({ projectId }: { projectId: string }) => (
    <div data-testid="focus-panel" data-project-id={projectId} />
  ),
}));

// ── GraphView mock ────────────────────────────────────────────────────────────

vi.mock('../GraphView', () => ({
  GraphView: ({ projectId }: { projectId: string }) => (
    <div data-testid="graph-view" data-project-id={projectId} />
  ),
}));

// ── ViewToggle mock ───────────────────────────────────────────────────────────

vi.mock('../ViewToggle', () => ({
  ViewToggle: () => <div data-testid="view-toggle" />,
}));

// ── useProjectStream mock ─────────────────────────────────────────────────────

const useProjectStreamMock = vi.fn();
vi.mock('@/hooks/useProjectStream', () => ({
  useProjectStream: (...args: unknown[]) => useProjectStreamMock(...args),
}));

import { PipelineWorkspace } from '../PipelineWorkspace';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function makeRun(overrides: Partial<StageRun> = {}): StageRun {
  return {
    id: 'sr-default',
    projectId: 'proj-abc',
    stage: 'research',
    status: 'completed',
    awaitingReason: null,
    payloadRef: null,
    attemptNo: 1,
    inputJson: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-05-17T00:00:00Z',
    updatedAt: '2026-05-17T00:00:00Z',
    outcomeJson: null,
    ...overrides,
  };
}

function mockStream(
  stageRuns = EMPTY_STAGE_RUNS,
  projectMeta = { mode: 'autopilot' as const, paused: false },
  refreshMock = vi.fn(async () => undefined),
) {
  useProjectStreamMock.mockReturnValue({
    stageRuns,
    liveEvent: null,
    isConnected: true,
    project: projectMeta,
    tracks: [],
    refresh: refreshMock,
  });
  return refreshMock;
}

const PROJECT_ID = 'proj-abc';

beforeEach(() => {
  vi.clearAllMocks();
  searchParamsStub = new URLSearchParams();
  mockStream();
});

// ── Cold-start auto-route to brainstorm ───────────────────────────────────────

describe('PipelineWorkspace — cold-start auto-route to brainstorm', () => {
  function routedUrls(): string[] {
    return mockReplace.mock.calls.map((c) => String(c[0]));
  }

  it('routes to ?stage=brainstorm (no attempt) when no brainstorm run exists — step-by-step lands on the Generate CTA', () => {
    searchParamsStub = new URLSearchParams();
    mockStream(EMPTY_STAGE_RUNS); // brainstorm: null
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(mockReplace).toHaveBeenCalled();
    const urls = routedUrls();
    expect(urls.some((u) => u.includes('stage=brainstorm'))).toBe(true);
    expect(urls.every((u) => !u.includes('attempt='))).toBe(true);
  });

  it('routes to ?stage=brainstorm&attempt=N when the wizard auto-dispatched a brainstorm run (autopilot)', () => {
    searchParamsStub = new URLSearchParams();
    mockStream({
      ...EMPTY_STAGE_RUNS,
      brainstorm: makeRun({ stage: 'brainstorm', status: 'running', attemptNo: 1 }),
    });
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    const urls = routedUrls();
    expect(urls.some((u) => u.includes('stage=brainstorm') && u.includes('attempt=1'))).toBe(true);
  });

  it('does NOT auto-route when a ?stage= param is already present', () => {
    searchParamsStub = new URLSearchParams('stage=research');
    mockStream(EMPTY_STAGE_RUNS);
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does NOT auto-route in graph view', () => {
    searchParamsStub = new URLSearchParams('view=graph');
    mockStream(EMPTY_STAGE_RUNS);
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

// ── Slice 1: Scaffold — ViewToggle in header ──────────────────────────────────

describe('PipelineWorkspace — scaffold', () => {
  it('renders the ViewToggle in the header', () => {
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.getByTestId('view-toggle')).toBeInTheDocument();
  });

  it('renders a container with data-testid="pipeline-workspace"', () => {
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.getByTestId('pipeline-workspace')).toBeInTheDocument();
  });
});

// ── Slice 2: Focus mode — FocusSidebar + FocusPanel ──────────────────────────

describe('PipelineWorkspace — focus mode', () => {
  it('renders FocusSidebar when ?view=focus', () => {
    searchParamsStub = new URLSearchParams('view=focus');
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.getByTestId('focus-sidebar')).toBeInTheDocument();
  });

  it('renders FocusPanel when ?view=focus', () => {
    searchParamsStub = new URLSearchParams('view=focus');
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.getByTestId('focus-panel')).toBeInTheDocument();
  });

  it('defaults to focus layout when no ?view= param', () => {
    searchParamsStub = new URLSearchParams();
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.getByTestId('focus-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('focus-panel')).toBeInTheDocument();
  });
});

// ── Slice 3: Graph mode — GraphView ──────────────────────────────────────────

describe('PipelineWorkspace — graph mode', () => {
  it('renders GraphView when ?view=graph', () => {
    searchParamsStub = new URLSearchParams('view=graph');
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.getByTestId('graph-view')).toBeInTheDocument();
  });
});

// ── Slice 4: Graph mode does NOT render Focus components ──────────────────────

describe('PipelineWorkspace — focus components absent in graph mode', () => {
  it('does NOT render FocusSidebar when ?view=graph', () => {
    searchParamsStub = new URLSearchParams('view=graph');
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.queryByTestId('focus-sidebar')).not.toBeInTheDocument();
  });

  it('does NOT render FocusPanel when ?view=graph', () => {
    searchParamsStub = new URLSearchParams('view=graph');
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.queryByTestId('focus-panel')).not.toBeInTheDocument();
  });
});

// ── Slice 5: Focus mode does NOT render Graph component ───────────────────────

describe('PipelineWorkspace — graph absent in focus mode', () => {
  it('does NOT render GraphView when ?view=focus', () => {
    searchParamsStub = new URLSearchParams('view=focus');
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.queryByTestId('graph-view')).not.toBeInTheDocument();
  });

  it('does NOT render GraphView when no ?view= param (default focus)', () => {
    searchParamsStub = new URLSearchParams();
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.queryByTestId('graph-view')).not.toBeInTheDocument();
  });
});

// ── Slice 6: projectId passed to children ─────────────────────────────────────

describe('PipelineWorkspace — projectId prop forwarding', () => {
  it('passes projectId to FocusSidebar', () => {
    searchParamsStub = new URLSearchParams('view=focus');
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.getByTestId('focus-sidebar')).toHaveAttribute('data-project-id', PROJECT_ID);
  });

  it('passes projectId to FocusPanel', () => {
    searchParamsStub = new URLSearchParams('view=focus');
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.getByTestId('focus-panel')).toHaveAttribute('data-project-id', PROJECT_ID);
  });

  it('passes projectId to GraphView', () => {
    searchParamsStub = new URLSearchParams('view=graph');
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.getByTestId('graph-view')).toHaveAttribute('data-project-id', PROJECT_ID);
  });
});

// ── Slice 7 (F2): Awaiting banner at project scope ────────────────────────────

describe('PipelineWorkspace — F2: awaiting banner at project scope', () => {
  it('renders the awaiting-banner when a stage run is awaiting_user', () => {
    const awaitingRun = makeRun({ status: 'awaiting_user', awaitingReason: 'manual_advance' });
    mockStream({ ...EMPTY_STAGE_RUNS, research: awaitingRun });
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.getByTestId('awaiting-banner')).toBeInTheDocument();
  });

  it('renders the awaiting-banner when project.paused is true (even without awaiting_user run)', () => {
    mockStream(EMPTY_STAGE_RUNS, { mode: 'autopilot', paused: true });
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.getByTestId('awaiting-banner')).toBeInTheDocument();
  });

  it('does NOT render the awaiting-banner when project is not paused and no run is awaiting', () => {
    const run = makeRun({ status: 'running' });
    mockStream({ ...EMPTY_STAGE_RUNS, research: run }, { mode: 'autopilot', paused: false });
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.queryByTestId('awaiting-banner')).not.toBeInTheDocument();
  });

  it('sets data-reason on the banner to the awaitingReason of the awaiting run', () => {
    const awaitingRun = makeRun({ status: 'awaiting_user', awaitingReason: 'provider_quota_exhausted' });
    mockStream({ ...EMPTY_STAGE_RUNS, research: awaitingRun });
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.getByTestId('awaiting-banner')).toHaveAttribute('data-reason', 'provider_quota_exhausted');
  });

  it('shows quota-specific copy for provider_quota_exhausted reason', () => {
    const awaitingRun = makeRun({ status: 'awaiting_user', awaitingReason: 'provider_quota_exhausted' });
    mockStream({ ...EMPTY_STAGE_RUNS, research: awaitingRun });
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.getByTestId('awaiting-banner').textContent).toContain('Provider quota exhausted');
  });

  it('shows generic copy for manual_advance reason', () => {
    const awaitingRun = makeRun({ status: 'awaiting_user', awaitingReason: 'manual_advance' });
    mockStream({ ...EMPTY_STAGE_RUNS, research: awaitingRun });
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.getByTestId('awaiting-banner').textContent).toContain('manual_advance');
  });

  it('renders exactly one banner even when multiple stage runs exist', () => {
    const run1 = makeRun({ stage: 'research', status: 'awaiting_user', awaitingReason: 'manual_advance' });
    const run2 = makeRun({ stage: 'review', status: 'awaiting_user', awaitingReason: 'manual_advance' });
    mockStream({ ...EMPTY_STAGE_RUNS, research: run1, review: run2 });
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.getAllByTestId('awaiting-banner')).toHaveLength(1);
  });

  it('does NOT render awaiting-banner inside FocusPanel (single-banner guarantee)', () => {
    const awaitingRun = makeRun({ status: 'awaiting_user', awaitingReason: 'manual_advance' });
    mockStream({ ...EMPTY_STAGE_RUNS, research: awaitingRun });
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    // The FocusPanel mock renders a plain div with data-testid="focus-panel" —
    // no awaiting-banner inside it. This confirms the banner is project-scoped.
    const focusPanel = screen.getByTestId('focus-panel');
    expect(focusPanel.querySelector('[data-testid="awaiting-banner"]')).toBeNull();
  });
});

// ── Slice 7 (F3): Resume button posts to project-scope endpoint ───────────────

describe('PipelineWorkspace — F3: Resume button posts to project endpoint', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the resume-track-btn inside the awaiting-banner', () => {
    const awaitingRun = makeRun({ status: 'awaiting_user', awaitingReason: 'manual_advance' });
    mockStream({ ...EMPTY_STAGE_RUNS, research: awaitingRun });
    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    expect(screen.getByTestId('resume-track-btn')).toBeInTheDocument();
  });

  it('clicking resume-track-btn POSTs to /api/projects/:id/resume and calls refresh', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ok: true }, error: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const refreshMock = vi.fn(async () => undefined);
    const awaitingRun = makeRun({ status: 'awaiting_user', awaitingReason: 'manual_advance' });
    mockStream({ ...EMPTY_STAGE_RUNS, research: awaitingRun }, { mode: 'autopilot', paused: false }, refreshMock);

    render(<PipelineWorkspace projectId={PROJECT_ID} />);
    fireEvent.click(screen.getByTestId('resume-track-btn'));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/projects/${PROJECT_ID}/resume`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await vi.waitFor(() => {
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it('resume-track-btn is disabled while fetch is in flight', async () => {
    let resolveResume!: (value: unknown) => void;
    const inflightFetch = vi.fn().mockReturnValue(
      new Promise((res) => { resolveResume = res; }),
    );
    vi.stubGlobal('fetch', inflightFetch);

    const awaitingRun = makeRun({ status: 'awaiting_user', awaitingReason: 'manual_advance' });
    mockStream({ ...EMPTY_STAGE_RUNS, research: awaitingRun });
    render(<PipelineWorkspace projectId={PROJECT_ID} />);

    const btn = screen.getByTestId('resume-track-btn');
    fireEvent.click(btn);
    expect(btn).toBeDisabled();

    resolveResume({ ok: true, json: async () => ({}) });
  });
});
