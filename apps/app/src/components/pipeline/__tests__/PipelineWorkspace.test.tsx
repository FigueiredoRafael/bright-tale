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
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Router / navigation mock ──────────────────────────────────────────────────

let searchParamsStub = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
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

import { PipelineWorkspace } from '../PipelineWorkspace';

const PROJECT_ID = 'proj-abc';

beforeEach(() => {
  vi.clearAllMocks();
  searchParamsStub = new URLSearchParams();
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
