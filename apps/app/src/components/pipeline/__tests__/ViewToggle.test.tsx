/**
 * T4.4 — ViewToggle unit tests (TDD).
 *
 * Slices covered:
 *   1. Scaffold: pill renders two buttons (Focus | Graph)
 *   2. Active state reflects ?view= param from URL
 *   3. Clicking Focus button calls router.replace with view=focus
 *   4. Clicking Graph button calls router.replace with view=graph
 *   5. Other query params are preserved when switching
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Router mock ──────────────────────────────────────────────────────────────

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

import { ViewToggle } from '../ViewToggle';

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  searchParamsStub = new URLSearchParams();
});

// ── Slice 1: Scaffold — pill renders both buttons ─────────────────────────────

describe('ViewToggle — scaffold', () => {
  it('renders a Focus button', () => {
    render(<ViewToggle />);
    expect(screen.getByTestId('view-toggle-focus')).toBeInTheDocument();
    expect(screen.getByTestId('view-toggle-focus')).toHaveTextContent('Focus');
  });

  it('renders a Graph button', () => {
    render(<ViewToggle />);
    expect(screen.getByTestId('view-toggle-graph')).toBeInTheDocument();
    expect(screen.getByTestId('view-toggle-graph')).toHaveTextContent('Graph');
  });

  it('renders both buttons inside a container with data-testid="view-toggle"', () => {
    render(<ViewToggle />);
    expect(screen.getByTestId('view-toggle')).toBeInTheDocument();
  });
});

// ── Slice 2: Active state ─────────────────────────────────────────────────────

describe('ViewToggle — active state', () => {
  it('marks Focus as active when ?view=focus', () => {
    searchParamsStub = new URLSearchParams('view=focus');
    render(<ViewToggle />);
    expect(screen.getByTestId('view-toggle-focus')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('view-toggle-graph')).toHaveAttribute('data-active', 'false');
  });

  it('marks Graph as active when ?view=graph', () => {
    searchParamsStub = new URLSearchParams('view=graph');
    render(<ViewToggle />);
    expect(screen.getByTestId('view-toggle-graph')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('view-toggle-focus')).toHaveAttribute('data-active', 'false');
  });

  it('defaults to Focus active when no ?view= param is present', () => {
    searchParamsStub = new URLSearchParams();
    render(<ViewToggle />);
    expect(screen.getByTestId('view-toggle-focus')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('view-toggle-graph')).toHaveAttribute('data-active', 'false');
  });
});

// ── Slice 3: Clicking Focus ───────────────────────────────────────────────────

describe('ViewToggle — clicking Focus', () => {
  it('calls router.replace with view=focus in the URL', () => {
    searchParamsStub = new URLSearchParams('view=graph');
    render(<ViewToggle />);
    fireEvent.click(screen.getByTestId('view-toggle-focus'));
    expect(replaceMock).toHaveBeenCalledWith(expect.stringContaining('view=focus'));
  });

  it('does not call router.replace if Focus is already active', () => {
    searchParamsStub = new URLSearchParams('view=focus');
    render(<ViewToggle />);
    fireEvent.click(screen.getByTestId('view-toggle-focus'));
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

// ── Slice 4: Clicking Graph ───────────────────────────────────────────────────

describe('ViewToggle — clicking Graph', () => {
  it('calls router.replace with view=graph in the URL', () => {
    searchParamsStub = new URLSearchParams('view=focus');
    render(<ViewToggle />);
    fireEvent.click(screen.getByTestId('view-toggle-graph'));
    expect(replaceMock).toHaveBeenCalledWith(expect.stringContaining('view=graph'));
  });

  it('does not call router.replace if Graph is already active', () => {
    searchParamsStub = new URLSearchParams('view=graph');
    render(<ViewToggle />);
    fireEvent.click(screen.getByTestId('view-toggle-graph'));
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

// ── Slice 5: Preserves other query params ─────────────────────────────────────

describe('ViewToggle — preserves other query params', () => {
  it('keeps stage= param when switching to graph', () => {
    searchParamsStub = new URLSearchParams('view=focus&stage=brainstorm');
    render(<ViewToggle />);
    fireEvent.click(screen.getByTestId('view-toggle-graph'));
    const url = replaceMock.mock.calls[0][0] as string;
    expect(url).toContain('stage=brainstorm');
    expect(url).toContain('view=graph');
  });

  it('keeps track= param when switching to focus', () => {
    searchParamsStub = new URLSearchParams('view=graph&track=track-1');
    render(<ViewToggle />);
    fireEvent.click(screen.getByTestId('view-toggle-focus'));
    const url = replaceMock.mock.calls[0][0] as string;
    expect(url).toContain('track=track-1');
    expect(url).toContain('view=focus');
  });
});
