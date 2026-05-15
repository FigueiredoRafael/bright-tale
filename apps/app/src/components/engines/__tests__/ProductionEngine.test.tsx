import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProductionEngine } from '../ProductionEngine';

vi.mock('@/hooks/usePipelineActor', () => ({
  usePipelineActor: () => ({
    send: vi.fn(),
    getSnapshot: () => ({
      context: {
        channelId: 'c1',
        projectId: 'p1',
        stageResults: {
          brainstorm: {},
          research: {},
          draft: { canonicalCoreReady: true },
        },
        autopilotConfig: { draft: {} },
        mode: 'overview',
        paused: false,
        creditSettings: {
          costBlog: 1,
          costVideo: 2,
          costShorts: 1,
          costPodcast: 2,
        },
      },
    }),
  }),
}));

vi.mock('@xstate/react', () => ({
  useSelector: (actor: unknown, selector: (s: unknown) => unknown) => {
    const snapshot = (actor as { getSnapshot: () => unknown }).getSnapshot();
    return selector(snapshot);
  },
}));

vi.mock('@/components/pipeline/PipelineAbortProvider', () => ({
  usePipelineAbort: () => ({ signal: undefined }),
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

vi.mock('@/hooks/use-auto-pilot-trigger', () => ({
  useAutoPilotTrigger: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/components/production/VideoStyleSelector', () => ({
  default: () => <div data-testid="video-style-selector" />,
}));

describe('ProductionEngine', () => {
  it.each(['blog', 'video', 'shorts', 'podcast'] as const)(
    'mounts %s controls',
    (medium) => {
      render(<ProductionEngine projectId="p1" trackId="t1" medium={medium} />);
      expect(screen.getByTestId('production-engine')).toBeInTheDocument();
    },
  );

  it('renders target_words for blog', () => {
    render(<ProductionEngine projectId="p1" trackId="t1" medium="blog" />);
    expect(screen.getByTestId('control-target-words')).toBeInTheDocument();
  });

  it('renders target_duration + video_style for video', () => {
    render(<ProductionEngine projectId="p1" trackId="t1" medium="video" />);
    expect(screen.getByTestId('control-target-duration')).toBeInTheDocument();
    expect(screen.getByTestId('control-video-style')).toBeInTheDocument();
  });
});
