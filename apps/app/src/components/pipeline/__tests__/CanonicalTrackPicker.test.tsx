import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CanonicalTrackPicker } from '../CanonicalTrackPicker';
import type { TrackSnapshot } from '@/lib/pipeline/advanceUrl';

const PROJECT_ID = 'p1';
const CHANNEL_ID = 'c1';

function makeStagesResponse(tracks: Partial<TrackSnapshot>[]) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        data: {
          stageRuns: [],
          tracks: tracks.map((t) => ({
            id: t.id ?? 't',
            medium: t.medium ?? 'blog',
            status: t.status ?? 'active',
            paused: t.paused ?? false,
            stageRuns: t.stageRuns ?? {},
          })),
          project: { mode: 'step-by-step', paused: false },
        },
        error: null,
      }),
  };
}

let originalFetch: typeof global.fetch;
beforeEach(() => { originalFetch = global.fetch; });
afterEach(() => { global.fetch = originalFetch; vi.clearAllMocks(); });

describe('CanonicalTrackPicker', () => {
  it('renders one row per active track with the medium label', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeStagesResponse([
        { id: 't-blog', medium: 'blog' },
        { id: 't-video', medium: 'video' },
      ]),
    );

    render(
      <CanonicalTrackPicker projectId={PROJECT_ID} channelId={CHANNEL_ID} onPick={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('canonical-track-row-blog')).not.toBeNull();
      expect(screen.queryByTestId('canonical-track-row-video')).not.toBeNull();
    });
  });

  it('calls onPick with the chosen track when "Go to production" is clicked', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeStagesResponse([
        { id: 't-blog', medium: 'blog' },
        { id: 't-video', medium: 'video' },
      ]),
    );

    const onPick = vi.fn();
    render(
      <CanonicalTrackPicker projectId={PROJECT_ID} channelId={CHANNEL_ID} onPick={onPick} />,
    );

    await waitFor(() => expect(screen.queryByTestId('canonical-track-go-video')).not.toBeNull());
    fireEvent.click(screen.getByTestId('canonical-track-go-video'));

    expect(onPick).toHaveBeenCalledTimes(1);
    const arg = onPick.mock.calls[0][0] as TrackSnapshot;
    expect(arg.id).toBe('t-video');
    expect(arg.medium).toBe('video');
  });

  it('hides paused / aborted tracks (only active+unpaused are pickable)', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeStagesResponse([
        { id: 't-blog', medium: 'blog', status: 'active', paused: false },
        { id: 't-video', medium: 'video', status: 'active', paused: true },
        { id: 't-shorts', medium: 'shorts', status: 'aborted', paused: false },
      ]),
    );

    render(
      <CanonicalTrackPicker projectId={PROJECT_ID} channelId={CHANNEL_ID} onPick={vi.fn()} />,
    );

    await waitFor(() => expect(screen.queryByTestId('canonical-track-row-blog')).not.toBeNull());
    expect(screen.queryByTestId('canonical-track-row-video')).toBeNull();
    expect(screen.queryByTestId('canonical-track-row-shorts')).toBeNull();
  });

  it('renders an empty-state hint when there are no active tracks', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeStagesResponse([]));

    render(
      <CanonicalTrackPicker projectId={PROJECT_ID} channelId={CHANNEL_ID} onPick={vi.fn()} />,
    );

    await waitFor(() =>
      expect(screen.queryByTestId('canonical-track-picker-empty')).not.toBeNull(),
    );
  });

  it('exposes the "+ Add medium" button so users can add a missing track', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeStagesResponse([{ id: 't-blog', medium: 'blog' }]));

    render(
      <CanonicalTrackPicker projectId={PROJECT_ID} channelId={CHANNEL_ID} onPick={vi.fn()} />,
    );

    await waitFor(() =>
      expect(screen.queryByTestId('canonical-track-add-medium')).not.toBeNull(),
    );
  });
});
