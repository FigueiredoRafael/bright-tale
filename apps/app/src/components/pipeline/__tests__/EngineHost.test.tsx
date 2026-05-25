import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EngineHost } from '../EngineHost';

interface StageRunStub {
  id: string;
  stage: string;
  status: string;
  attemptNo: number;
}

interface UseStageRunResult {
  data: StageRunStub | null;
  isLoading: boolean;
  error: Error | null;
}

const mockUseStageRunImpl = (_opts: unknown): UseStageRunResult => ({
  data: { id: 'sr1', stage: (_opts as { stage: string }).stage, status: 'queued', attemptNo: 1 },
  isLoading: false,
  error: null,
});

const mockUseStageRun = vi.fn(mockUseStageRunImpl);

vi.mock('@/hooks/useStageRun', () => ({
  get useStageRun() {
    return mockUseStageRun;
  },
}));

// Stub each engine so we can assert mounting without pulling in their internals.
// The three video-capable engines (assets, preview, publish) are prop-aware:
// they render a video testid when they receive medium="video". This verifies that
// EngineHost forwards the medium prop correctly — the bug was engines reading
// trackMedium but EngineHost sending medium (prop-name mismatch).
vi.mock('@/components/engines/BrainstormEngine', () => ({ BrainstormEngine: () => <div data-testid="engine-brainstorm" /> }));
vi.mock('@/components/engines/ResearchEngine', () => ({ ResearchEngine: () => <div data-testid="engine-research" /> }));
vi.mock('@/components/engines/CanonicalEngine', () => ({ CanonicalEngine: () => <div data-testid="engine-canonical" /> }));
vi.mock('@/components/engines/ProductionEngine', () => ({ ProductionEngine: () => <div data-testid="engine-production" /> }));
vi.mock('@/components/engines/ReviewEngine', () => ({ ReviewEngine: () => <div data-testid="engine-review" /> }));
vi.mock('@/components/engines/AssetsEngine', () => ({
  AssetsEngine: ({ medium }: { medium?: string }) =>
    medium === 'video'
      ? <div data-testid="engine-assets-video" />
      : <div data-testid="engine-assets" />,
}));
vi.mock('@/components/engines/PreviewEngine', () => ({
  PreviewEngine: ({ medium }: { medium?: string }) =>
    medium === 'video'
      ? <div data-testid="engine-preview-video" />
      : <div data-testid="engine-preview" />,
}));
vi.mock('@/components/engines/PublishEngine', () => ({
  PublishEngine: ({ medium }: { medium?: string }) =>
    medium === 'video'
      ? <div data-testid="engine-publish-video" />
      : <div data-testid="engine-publish" />,
}));

describe('EngineHost', () => {
  it.each([
    ['brainstorm', 'engine-brainstorm'],
    ['research', 'engine-research'],
    ['canonical', 'engine-canonical'],
    ['production', 'engine-production'],
    ['review', 'engine-review'],
    ['assets', 'engine-assets'],
    ['preview', 'engine-preview'],
    ['publish', 'engine-publish'],
  ] as const)('mounts %s engine', (stage, testId) => {
    render(<EngineHost projectId="p1" stage={stage} attemptNo={1} />);
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it('renders read-only when stage_run is terminal and attempt !== current', () => {
    mockUseStageRun.mockReturnValueOnce({
      data: { id: 'sr1', stage: 'review', status: 'completed', attemptNo: 2 },
      isLoading: false,
      error: null,
    });
    render(<EngineHost projectId="p1" stage="review" attemptNo={1} />);
    expect(screen.getByTestId('engine-host-readonly')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    mockUseStageRun.mockReturnValueOnce({ data: null, isLoading: true, error: null });
    render(<EngineHost projectId="p1" stage="brainstorm" attemptNo={1} />);
    expect(screen.getByTestId('engine-host-loading')).toBeInTheDocument();
  });

  it('renders error state', () => {
    mockUseStageRun.mockReturnValueOnce({ data: null, isLoading: false, error: new Error('boom') });
    render(<EngineHost projectId="p1" stage="brainstorm" attemptNo={1} />);
    expect(screen.getByTestId('engine-host-error')).toBeInTheDocument();
  });

  // ── medium prop forwarding ─────────────────────────────────────────────────
  // Regression guard: EngineHost must forward medium="video" to the engine so
  // video UIs render. The bug was engines reading trackMedium but EngineHost
  // sending medium (canonical name from ProductionEngine / Medium type).

  it('forwards medium=video to AssetsEngine', () => {
    render(<EngineHost projectId="p1" stage="assets" trackId="t1" attemptNo={1} medium="video" />);
    expect(screen.getByTestId('engine-assets-video')).toBeInTheDocument();
  });

  it('forwards medium=video to PreviewEngine', () => {
    render(<EngineHost projectId="p1" stage="preview" trackId="t1" attemptNo={1} medium="video" />);
    expect(screen.getByTestId('engine-preview-video')).toBeInTheDocument();
  });

  it('forwards medium=video to PublishEngine', () => {
    render(<EngineHost projectId="p1" stage="publish" trackId="t1" attemptNo={1} medium="video" />);
    expect(screen.getByTestId('engine-publish-video')).toBeInTheDocument();
  });
});
