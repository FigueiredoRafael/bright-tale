/**
 * Slice 11 (#19) — PipelineView overview variant.
 *
 * Read-only mirror of a Project's Stage Runs via useProjectStream. The
 * hook itself is covered by useProjectStream.test.tsx; here we stub it
 * out and assert the visual reducer (7 stage cards, badges, live event).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { StageRun } from '@brighttale/shared/pipeline/inputs';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const useProjectStreamMock = vi.fn();
vi.mock('@/hooks/useProjectStream', () => ({
  useProjectStream: (...args: unknown[]) => useProjectStreamMock(...args),
}));

import { PipelineView } from '../PipelineView';

function run(overrides: Partial<StageRun> = {}): StageRun {
  return {
    id: 'sr-x',
    projectId: 'proj-1',
    stage: 'brainstorm',
    status: 'completed',
    awaitingReason: null,
    payloadRef: null,
    attemptNo: 1,
    inputJson: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-05-11T00:00:00Z',
    updatedAt: '2026-05-11T00:00:00Z',
    ...overrides,
  };
}

const PROJECT_ID = 'proj-1';

beforeEach(() => {
  vi.clearAllMocks();
  useProjectStreamMock.mockReturnValue({
    stageRuns: {
      brainstorm: null,
      research: null,
      draft: null,
      review: null,
      assets: null,
      preview: null,
      publish: null,
    },
    liveEvent: null,
    isConnected: false,
    refresh: vi.fn(async () => undefined),
      project: { mode: 'autopilot', paused: false },
  });
});

describe('<PipelineView variant="overview" />', () => {
  it('renders one card per Stage (7 total)', () => {
    render(<PipelineView projectId={PROJECT_ID} />);
    const cards = screen.getAllByTestId(/^stage-card-/);
    expect(cards).toHaveLength(7);
  });

  it('renders status badges from the useProjectStream snapshot, with gating for downstream stages', () => {
    useProjectStreamMock.mockReturnValueOnce({
      stageRuns: {
        brainstorm: run({ stage: 'brainstorm', status: 'completed' }),
        research: run({ stage: 'research', status: 'running' }),
        draft: null,
        review: null,
        assets: null,
        preview: null,
        publish: null,
      },
      liveEvent: null,
      isConnected: true,
      refresh: vi.fn(async () => undefined),
      project: { mode: 'autopilot', paused: false },
    });

    render(<PipelineView projectId={PROJECT_ID} />);

    expect(screen.getByTestId('stage-card-brainstorm')).toHaveAttribute('data-status', 'completed');
    expect(screen.getByTestId('stage-card-research')).toHaveAttribute('data-status', 'running');
    // draft has no Stage Run AND research is still running → locked
    expect(screen.getByTestId('stage-card-draft')).toHaveAttribute('data-status', 'locked');
    // assets onward also locked
    expect(screen.getByTestId('stage-card-publish')).toHaveAttribute('data-status', 'locked');
  });

  it('renders the first stage as "ready" when no Stage Run exists yet', () => {
    render(<PipelineView projectId={PROJECT_ID} />);
    expect(screen.getByTestId('stage-card-brainstorm')).toHaveAttribute('data-status', 'ready');
    expect(screen.getByTestId('stage-card-research')).toHaveAttribute('data-status', 'locked');
  });

  it('unlocks the next stage when its predecessor is completed (no run yet)', () => {
    useProjectStreamMock.mockReturnValueOnce({
      stageRuns: {
        brainstorm: run({ stage: 'brainstorm', status: 'completed' }),
        research: null,
        draft: null,
        review: null,
        assets: null,
        preview: null,
        publish: null,
      },
      liveEvent: null,
      isConnected: true,
      refresh: vi.fn(async () => undefined),
      project: { mode: 'autopilot', paused: false },
    });

    render(<PipelineView projectId={PROJECT_ID} />);
    expect(screen.getByTestId('stage-card-research')).toHaveAttribute('data-status', 'ready');
    expect(screen.getByTestId('stage-card-draft')).toHaveAttribute('data-status', 'locked');
  });

  it('disables locked stage cards (no click navigation)', () => {
    render(<PipelineView projectId={PROJECT_ID} />);
    const draft = screen.getByTestId('stage-card-draft');
    expect(draft).toBeDisabled();
  });

  it('shows "Idle" when connected but no live activity, and "Connecting…" while disconnected', () => {
    useProjectStreamMock.mockReturnValueOnce({
      stageRuns: {
        brainstorm: null,
        research: null,
        draft: null,
        review: null,
        assets: null,
        preview: null,
        publish: null,
      },
      liveEvent: null,
      isConnected: true,
      refresh: vi.fn(async () => undefined),
      project: { mode: 'autopilot', paused: false },
    });
    const { rerender } = render(<PipelineView projectId={PROJECT_ID} />);
    expect(screen.getByText('Idle')).toBeInTheDocument();

    useProjectStreamMock.mockReturnValueOnce({
      stageRuns: {
        brainstorm: null,
        research: null,
        draft: null,
        review: null,
        assets: null,
        preview: null,
        publish: null,
      },
      liveEvent: null,
      isConnected: false,
      refresh: vi.fn(async () => undefined),
      project: { mode: 'autopilot', paused: false },
    });
    rerender(<PipelineView projectId={PROJECT_ID} />);
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
  });

  it('shows the latest liveEvent message at the top', () => {
    useProjectStreamMock.mockReturnValueOnce({
      stageRuns: {
        brainstorm: null,
        research: null,
        draft: null,
        review: null,
        assets: null,
        preview: null,
        publish: null,
      },
      liveEvent: {
        id: 'je-1',
        projectId: PROJECT_ID,
        sessionId: 's-1',
        sessionType: 'brainstorm',
        stage: 'brainstorm',
        message: 'Calling AI…',
        metadata: null,
        createdAt: '2026-05-11T00:01:00Z',
      },
      isConnected: true,
      refresh: vi.fn(async () => undefined),
      project: { mode: 'autopilot', paused: false },
    });

    render(<PipelineView projectId={PROJECT_ID} />);
    expect(screen.getByText('Calling AI…')).toBeInTheDocument();
  });

  it('calls onStageClick (custom handler) when an unlocked card is clicked', () => {
    const onStageClick = vi.fn();
    render(<PipelineView projectId={PROJECT_ID} onStageClick={onStageClick} />);

    // brainstorm is "ready" by default — unlocked & clickable.
    fireEvent.click(screen.getByTestId('stage-card-brainstorm'));
    expect(onStageClick).toHaveBeenCalledWith('brainstorm');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('falls back to router.push(/projects/:id?stage=:stage) when no handler is given', () => {
    render(<PipelineView projectId={PROJECT_ID} />);
    fireEvent.click(screen.getByTestId('stage-card-brainstorm'));
    expect(pushMock).toHaveBeenCalledWith(`/projects/${PROJECT_ID}?stage=brainstorm`);
  });

  it('does not write to the server on view (no fetch beyond what the hook does)', () => {
    // The component itself issues no fetches — all data flows through
    // useProjectStream (already tested for snapshot+stream behaviour).
    // This is an instance check that nothing changed.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<PipelineView projectId={PROJECT_ID} />);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('supervised variant renders <StageView /> for the given stage', () => {
    render(<PipelineView projectId={PROJECT_ID} variant="supervised" stage="brainstorm" />);
    expect(screen.getByTestId('stage-view-brainstorm')).toBeInTheDocument();
    expect(screen.queryByTestId('pipeline-view-overview')).not.toBeInTheDocument();
  });
});
