import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PublishEngine } from '../PublishEngine';

vi.mock('@/lib/api/publishTargets', () => ({
  fetchPublishTarget: vi.fn(async (id: string) => ({
    id,
    channelId: 'c1',
    type: id.startsWith('wp') ? 'wordpress'
      : id.startsWith('yt') ? 'youtube'
      : id.startsWith('sp') ? 'spotify'
      : id.startsWith('ap') ? 'apple_podcasts'
      : 'rss',
    configJson: {},
  })),
}));

vi.mock('@/hooks/usePipelineActor', () => ({
  usePipelineActor: () => ({ send: vi.fn() }),
}));

vi.mock('@/hooks/use-auto-pilot-trigger', () => ({
  useAutoPilotTrigger: vi.fn(),
}));

vi.mock('@/hooks/use-pipeline-tracker', () => ({
  usePipelineTracker: () => ({ trackStarted: vi.fn(), trackCompleted: vi.fn(), trackFailed: vi.fn() }),
}));

vi.mock('@xstate/react', () => ({
  useSelector: vi.fn((_actor: unknown, selector: (s: { context: Record<string, unknown> }) => unknown) =>
    selector({
      context: {
        channelId: 'c1',
        projectId: 'p1',
        stageResults: {},
        autopilotConfig: { publish: { status: 'draft' } },
        mode: 'overview',
      },
    }),
  ),
}));

describe('PublishEngine driver dispatch', () => {
  it.each([
    ['wp-1', 'driver-wordpress'],
    ['yt-1', 'driver-youtube'],
    ['sp-1', 'driver-spotify'],
    ['ap-1', 'driver-apple-podcasts'],
    ['rss-1', 'driver-rss'],
  ])('mounts the right driver for publishTargetId=%s', async (publishTargetId, testId) => {
    render(<PublishEngine draft={{ id: 'd1', title: 'x', status: 'ready' }} publishTargetId={publishTargetId} />);
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
  });
});
