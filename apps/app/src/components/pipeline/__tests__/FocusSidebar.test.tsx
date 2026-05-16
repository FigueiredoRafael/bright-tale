/**
 * T4.1 — FocusSidebar unit tests (TDD).
 *
 * Acceptance criteria:
 *   AC1 — Component renders full tree from stream (Shared zone + per-Track sections)
 *   AC2 — Click updates URL state (?stage=...&track=...&target=...)
 *   AC3 — Status icons + loop badges match spec
 *   AC4 — Add Medium button surfaces only after Canonical is completed
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { StageRun } from '@brighttale/shared/pipeline/inputs';

// ─── next/navigation mock (the global setup also mocks it, but we need
//     per-test control of searchParams and the replace function) ─────────────

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

import { FocusSidebar } from '../FocusSidebar';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<StageRun> = {}): StageRun {
  return {
    id: 'sr-default',
    projectId: 'proj-1',
    stage: 'brainstorm',
    status: 'queued',
    awaitingReason: null,
    payloadRef: null,
    attemptNo: 1,
    inputJson: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-05-15T00:00:00Z',
    updatedAt: '2026-05-15T00:00:00Z',
    ...overrides,
  };
}

const EMPTY_STAGE_RUNS = {
  brainstorm: null,
  research: null,
  canonical: null,
  production: null,
  review: null,
  assets: null,
  preview: null,
  publish: null,
};

function mockStream(stageRuns = EMPTY_STAGE_RUNS, tracks: TrackStub[] = []) {
  useProjectStreamMock.mockReturnValue({
    stageRuns,
    liveEvent: null,
    isConnected: true,
    project: { mode: 'autopilot', paused: false },
    refresh: vi.fn(async () => undefined),
    tracks,
  });
}

// Minimal Track shape for tests (mirrors the domain model in the spec)
interface TrackStub {
  id: string;
  medium: 'blog' | 'video' | 'shorts' | 'podcast';
  status: 'active' | 'aborted' | 'completed';
  paused: boolean;
  stageRuns?: Record<string, StageRun | null>;
  publishTargets?: PublishTargetStub[];
}

interface PublishTargetStub {
  id: string;
  displayName: string;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  searchParamsStub = new URLSearchParams();
  mockStream();
});

// ── AC1: Component renders full tree from stream ──────────────────────────────

describe('FocusSidebar — AC1: renders full tree from stream', () => {
  it('renders the Shared zone section header', () => {
    mockStream();
    render(<FocusSidebar projectId="proj-1" />);
    expect(screen.getByTestId('sidebar-section-shared')).toBeInTheDocument();
  });

  it('renders all three shared-zone items: Brainstorm, Research, Canonical', () => {
    mockStream();
    render(<FocusSidebar projectId="proj-1" />);
    expect(screen.getByTestId('sidebar-item-brainstorm')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-item-research')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-item-canonical')).toBeInTheDocument();
  });

  it('renders a per-Track section for each active track from the stream', () => {
    mockStream(EMPTY_STAGE_RUNS, [
      { id: 'track-1', medium: 'blog', status: 'active', paused: false },
      { id: 'track-2', medium: 'video', status: 'active', paused: false },
    ]);
    render(<FocusSidebar projectId="proj-1" />);
    expect(screen.getByTestId('sidebar-track-track-1')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-track-track-2')).toBeInTheDocument();
  });

  it('renders per-Track stage items: Production, Review, Assets, Preview, Publish', () => {
    mockStream(EMPTY_STAGE_RUNS, [
      { id: 'track-1', medium: 'blog', status: 'active', paused: false },
    ]);
    render(<FocusSidebar projectId="proj-1" />);
    expect(screen.getByTestId('sidebar-item-track-1-production')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-item-track-1-review')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-item-track-1-assets')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-item-track-1-preview')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-item-track-1-publish')).toBeInTheDocument();
  });

  it('renders publish_target sub-items under the Publish item for a track', () => {
    mockStream(EMPTY_STAGE_RUNS, [
      {
        id: 'track-1',
        medium: 'blog',
        status: 'active',
        paused: false,
        publishTargets: [
          { id: 'pt-1', displayName: 'My WordPress' },
          { id: 'pt-2', displayName: 'Dev Blog' },
        ],
      },
    ]);
    render(<FocusSidebar projectId="proj-1" />);
    expect(screen.getByTestId('sidebar-item-track-1-publish-target-pt-1')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-item-track-1-publish-target-pt-2')).toBeInTheDocument();
  });

  it('does not render aborted tracks', () => {
    mockStream(EMPTY_STAGE_RUNS, [
      { id: 'track-aborted', medium: 'blog', status: 'aborted', paused: false },
    ]);
    render(<FocusSidebar projectId="proj-1" />);
    expect(screen.queryByTestId('sidebar-track-track-aborted')).not.toBeInTheDocument();
  });
});

// ── AC2: Click updates URL state ─────────────────────────────────────────────

describe('FocusSidebar — AC2: click updates URL state', () => {
  it('clicking a shared-zone item sets ?stage=<stage> (no track or target)', () => {
    mockStream({ ...EMPTY_STAGE_RUNS });
    render(<FocusSidebar projectId="proj-1" />);
    fireEvent.click(screen.getByTestId('sidebar-item-brainstorm'));
    expect(replaceMock).toHaveBeenCalledWith(
      expect.stringContaining('stage=brainstorm'),
    );
    const url = replaceMock.mock.calls[0][0] as string;
    expect(url).not.toContain('track=');
    expect(url).not.toContain('target=');
  });

  it('clicking a per-track stage item sets ?stage=<stage>&track=<trackId>', () => {
    mockStream(EMPTY_STAGE_RUNS, [
      { id: 'track-1', medium: 'blog', status: 'active', paused: false },
    ]);
    render(<FocusSidebar projectId="proj-1" />);
    fireEvent.click(screen.getByTestId('sidebar-item-track-1-production'));
    expect(replaceMock).toHaveBeenCalled();
    const url = replaceMock.mock.calls[0][0] as string;
    expect(url).toContain('stage=production');
    expect(url).toContain('track=track-1');
  });

  it('clicking a publish_target sub-item sets ?stage=publish&track=<trackId>&target=<targetId>', () => {
    mockStream(EMPTY_STAGE_RUNS, [
      {
        id: 'track-1',
        medium: 'blog',
        status: 'active',
        paused: false,
        publishTargets: [{ id: 'pt-1', displayName: 'WP Site' }],
      },
    ]);
    render(<FocusSidebar projectId="proj-1" />);
    fireEvent.click(screen.getByTestId('sidebar-item-track-1-publish-target-pt-1'));
    expect(replaceMock).toHaveBeenCalled();
    const url = replaceMock.mock.calls[0][0] as string;
    expect(url).toContain('stage=publish');
    expect(url).toContain('track=track-1');
    expect(url).toContain('target=pt-1');
  });

  it('preserves other existing query params when setting selection', () => {
    searchParamsStub = new URLSearchParams('v=focus&locale=en');
    mockStream();
    render(<FocusSidebar projectId="proj-1" />);
    fireEvent.click(screen.getByTestId('sidebar-item-research'));
    const url = replaceMock.mock.calls[0][0] as string;
    expect(url).toContain('v=focus');
    expect(url).toContain('locale=en');
    expect(url).toContain('stage=research');
  });

  it('marks the currently selected item as active from searchParams', () => {
    searchParamsStub = new URLSearchParams('stage=research');
    mockStream();
    render(<FocusSidebar projectId="proj-1" />);
    const item = screen.getByTestId('sidebar-item-research');
    expect(item).toHaveAttribute('data-active', 'true');
  });

  it('marks the selected per-track item as active', () => {
    searchParamsStub = new URLSearchParams('stage=production&track=track-1');
    mockStream(EMPTY_STAGE_RUNS, [
      { id: 'track-1', medium: 'blog', status: 'active', paused: false },
    ]);
    render(<FocusSidebar projectId="proj-1" />);
    const item = screen.getByTestId('sidebar-item-track-1-production');
    expect(item).toHaveAttribute('data-active', 'true');
  });
});

// ── AC3: Status icons + loop badges match spec ────────────────────────────────

describe('FocusSidebar — AC3: status icons, attempt count chip, awaiting-reason badge', () => {
  it('shows a status icon for each shared-zone item', () => {
    mockStream({
      ...EMPTY_STAGE_RUNS,
      brainstorm: makeRun({ stage: 'brainstorm', status: 'completed' }),
      research: makeRun({ stage: 'research', status: 'running' }),
    });
    render(<FocusSidebar projectId="proj-1" />);
    expect(screen.getByTestId('sidebar-status-brainstorm')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-status-research')).toBeInTheDocument();
  });

  it('shows attempt-count chip when attemptNo > 1', () => {
    mockStream({
      ...EMPTY_STAGE_RUNS,
      research: makeRun({ stage: 'research', status: 'running', attemptNo: 3 }),
    });
    render(<FocusSidebar projectId="proj-1" />);
    expect(screen.getByTestId('sidebar-attempt-research')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-attempt-research')).toHaveTextContent('3');
  });

  it('does NOT show attempt chip when attemptNo is 1', () => {
    mockStream({
      ...EMPTY_STAGE_RUNS,
      research: makeRun({ stage: 'research', status: 'running', attemptNo: 1 }),
    });
    render(<FocusSidebar projectId="proj-1" />);
    expect(screen.queryByTestId('sidebar-attempt-research')).not.toBeInTheDocument();
  });

  it('shows awaiting-reason badge when awaitingReason is set', () => {
    mockStream({
      ...EMPTY_STAGE_RUNS,
      research: makeRun({
        stage: 'research',
        status: 'awaiting_user',
        awaitingReason: 'manual_paste',
      }),
    });
    render(<FocusSidebar projectId="proj-1" />);
    expect(screen.getByTestId('sidebar-awaiting-research')).toBeInTheDocument();
  });

  it('does NOT show awaiting badge when awaitingReason is null', () => {
    mockStream({
      ...EMPTY_STAGE_RUNS,
      research: makeRun({ stage: 'research', status: 'running', awaitingReason: null }),
    });
    render(<FocusSidebar projectId="proj-1" />);
    expect(screen.queryByTestId('sidebar-awaiting-research')).not.toBeInTheDocument();
  });

  it('reflects the stage_run status in the data-status attribute of the status icon', () => {
    mockStream({
      ...EMPTY_STAGE_RUNS,
      brainstorm: makeRun({ stage: 'brainstorm', status: 'failed' }),
    });
    render(<FocusSidebar projectId="proj-1" />);
    const icon = screen.getByTestId('sidebar-status-brainstorm');
    expect(icon).toHaveAttribute('data-status', 'failed');
  });
});

// ── AC4: Add Medium button gated on Canonical completion ─────────────────────

describe('FocusSidebar — AC4: Add Medium button gated on Canonical completion', () => {
  it('does NOT render the Add Medium button when Canonical is not completed', () => {
    mockStream({
      ...EMPTY_STAGE_RUNS,
      canonical: makeRun({ stage: 'canonical', status: 'running' }),
    });
    render(<FocusSidebar projectId="proj-1" />);
    expect(screen.queryByTestId('sidebar-add-medium')).not.toBeInTheDocument();
  });

  it('does NOT render the Add Medium button when Canonical stage_run is null', () => {
    mockStream({ ...EMPTY_STAGE_RUNS, canonical: null });
    render(<FocusSidebar projectId="proj-1" />);
    expect(screen.queryByTestId('sidebar-add-medium')).not.toBeInTheDocument();
  });

  it('renders the Add Medium button when Canonical is completed', () => {
    mockStream({
      ...EMPTY_STAGE_RUNS,
      canonical: makeRun({ stage: 'canonical', status: 'completed' }),
    });
    render(<FocusSidebar projectId="proj-1" />);
    expect(screen.getByTestId('sidebar-add-medium')).toBeInTheDocument();
  });

  it('Add Medium button is still shown even when tracks already exist (after canonical complete)', () => {
    mockStream(
      {
        ...EMPTY_STAGE_RUNS,
        canonical: makeRun({ stage: 'canonical', status: 'completed' }),
      },
      [{ id: 'track-1', medium: 'blog', status: 'active', paused: false }],
    );
    render(<FocusSidebar projectId="proj-1" />);
    expect(screen.getByTestId('sidebar-add-medium')).toBeInTheDocument();
  });
});
