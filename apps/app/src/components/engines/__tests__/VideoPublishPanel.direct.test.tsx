/**
 * VideoPublishPanel — Direct mode UI (issue #222 / S10)
 *
 * TDD: red→green per acceptance criterion.
 *
 * AC tested here:
 * 1. When channel has connected YouTube target: renders upload dropzone + API-only
 *    fields (visibility, category, madeForKids, language) + Publish CTA.
 * 2. When no YouTube target: renders "Connect YouTube" prompt (from S8).
 * 3. Switching to direct mode shows the real form (not the coming-soon placeholder).
 * 4. Error states: YOUTUBE_AUTH_FAILED, YOUTUBE_QUOTA_EXCEEDED, YOUTUBE_REJECTED.
 * 5. Dry-run success: shows success card with synthetic video URL.
 * 6. Bundle mode regression: still works unchanged.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { VideoPublishPanel } from '../publish-drivers/VideoPublishPanel';
import type { PublishTarget } from '@brighttale/shared';

// ── Global mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/video-bundle/zip', () => ({
  buildZipBlob: vi.fn().mockResolvedValue(new Blob(['zip'], { type: 'application/zip' })),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STUB_DRAFT_JSON = {
  channel: { name: 'Test Channel', handle: '@test', subscribers: '10K' },
  video_title: 'My Test Video',
  video_description: 'A nice description.',
  pinned_comment: 'Check the links!',
  tags: ['test', 'video'],
  thumbnail_ideas: [{ title: 'Idea 1' }],
  lower_thirds: [{ at: '0:30', label: 'Hello' }],
  script: { chapters: [{ broll: ['shot1'] }] },
};

const STUB_YOUTUBE_TARGET: PublishTarget = {
  id: 'pt-yt-1',
  channelId: 'ch-1',
  type: 'youtube',
  configJson: {},
  displayName: 'My YouTube Channel',
  isActive: true,
};

// ── Test suites ───────────────────────────────────────────────────────────────

describe('VideoPublishPanel — Direct mode (S10)', () => {
  // ── AC1: Connected target shows upload form ──────────────────────────────

  it('switching to direct mode shows the publish form (not the coming-soon placeholder) when YouTube target is connected', async () => {
    const user = userEvent.setup();
    render(
      <VideoPublishPanel
        draftJson={STUB_DRAFT_JSON}
        youtubeTarget={STUB_YOUTUBE_TARGET}
        draftId="draft-1"
      />,
    );
    // Switch to direct mode
    const directBtn = screen.getByRole('button', { name: /direct publish/i });
    await user.click(directBtn);

    // The old placeholder must NOT appear
    expect(screen.queryByTestId('video-publish-direct-placeholder')).not.toBeInTheDocument();
    // The real direct form must appear
    expect(screen.getByTestId('video-publish-direct-form')).toBeInTheDocument();
  });

  it('direct form shows a file dropzone for video upload', async () => {
    const user = userEvent.setup();
    render(
      <VideoPublishPanel
        draftJson={STUB_DRAFT_JSON}
        youtubeTarget={STUB_YOUTUBE_TARGET}
        draftId="draft-1"
      />,
    );
    const directBtn = screen.getByRole('button', { name: /direct publish/i });
    await user.click(directBtn);
    expect(screen.getByTestId('yt-video-dropzone')).toBeInTheDocument();
  });

  it('direct form shows visibility, category, madeForKids, and language fields', async () => {
    const user = userEvent.setup();
    render(
      <VideoPublishPanel
        draftJson={STUB_DRAFT_JSON}
        youtubeTarget={STUB_YOUTUBE_TARGET}
        draftId="draft-1"
      />,
    );
    const directBtn = screen.getByRole('button', { name: /direct publish/i });
    await user.click(directBtn);

    expect(screen.getByTestId('yt-field-visibility')).toBeInTheDocument();
    expect(screen.getByTestId('yt-field-category')).toBeInTheDocument();
    expect(screen.getByTestId('yt-field-made-for-kids')).toBeInTheDocument();
    expect(screen.getByTestId('yt-field-language')).toBeInTheDocument();
  });

  it('direct form shows a Publish CTA button', async () => {
    const user = userEvent.setup();
    render(
      <VideoPublishPanel
        draftJson={STUB_DRAFT_JSON}
        youtubeTarget={STUB_YOUTUBE_TARGET}
        draftId="draft-1"
      />,
    );
    const directBtn = screen.getByRole('button', { name: /direct publish/i });
    await user.click(directBtn);
    expect(screen.getByTestId('yt-publish-cta')).toBeInTheDocument();
  });

  // ── AC2: No connected target shows "Connect YouTube" prompt ───────────────

  it('switching to direct mode shows "Connect YouTube" prompt when no target', async () => {
    const user = userEvent.setup();
    render(
      <VideoPublishPanel
        draftJson={STUB_DRAFT_JSON}
        draftId="draft-1"
        // no youtubeTarget prop
      />,
    );
    const directBtn = screen.getByRole('button', { name: /direct publish/i });
    await user.click(directBtn);

    expect(screen.getByTestId('yt-connect-prompt')).toBeInTheDocument();
    expect(screen.getAllByText(/connect youtube/i).length).toBeGreaterThan(0);
  });

  // ── AC5: Dry-run success shows success card ───────────────────────────────

  it('submitting form with dryRun calls onPublish and shows success card on success', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn().mockResolvedValue({
      ok: true,
      videoId: 'dryrun-abc',
      url: 'https://www.youtube.com/watch?v=dryrun-abc',
    });

    render(
      <VideoPublishPanel
        draftJson={STUB_DRAFT_JSON}
        youtubeTarget={STUB_YOUTUBE_TARGET}
        draftId="draft-1"
        onPublish={onPublish}
      />,
    );
    const directBtn = screen.getByRole('button', { name: /direct publish/i });
    await user.click(directBtn);

    const cta = screen.getByTestId('yt-publish-cta');
    await user.click(cta);

    await waitFor(() => {
      expect(screen.getByTestId('yt-success-card')).toBeInTheDocument();
    });
    expect(screen.getByText(/youtube.com/)).toBeInTheDocument();
  });

  // ── AC4: Error states ─────────────────────────────────────────────────────

  it('shows reconnect CTA when onPublish returns YOUTUBE_AUTH_FAILED', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn().mockResolvedValue({
      ok: false,
      code: 'YOUTUBE_AUTH_FAILED',
      message: 'Token expired',
    });

    render(
      <VideoPublishPanel
        draftJson={STUB_DRAFT_JSON}
        youtubeTarget={STUB_YOUTUBE_TARGET}
        draftId="draft-1"
        onPublish={onPublish}
      />,
    );
    const directBtn = screen.getByRole('button', { name: /direct publish/i });
    await user.click(directBtn);
    await user.click(screen.getByTestId('yt-publish-cta'));

    await waitFor(() => {
      expect(screen.getByTestId('yt-error-auth-failed')).toBeInTheDocument();
    });
    expect(screen.getByText(/reconnect/i)).toBeInTheDocument();
  });

  it('shows "try again later" when onPublish returns YOUTUBE_QUOTA_EXCEEDED', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn().mockResolvedValue({
      ok: false,
      code: 'YOUTUBE_QUOTA_EXCEEDED',
      message: 'Quota exceeded',
    });

    render(
      <VideoPublishPanel
        draftJson={STUB_DRAFT_JSON}
        youtubeTarget={STUB_YOUTUBE_TARGET}
        draftId="draft-1"
        onPublish={onPublish}
      />,
    );
    const directBtn = screen.getByRole('button', { name: /direct publish/i });
    await user.click(directBtn);
    await user.click(screen.getByTestId('yt-publish-cta'));

    await waitFor(() => {
      expect(screen.getByTestId('yt-error-quota')).toBeInTheDocument();
    });
    expect(screen.getByText(/try again/i)).toBeInTheDocument();
  });

  it('surfaces verbatim reason on YOUTUBE_REJECTED', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn().mockResolvedValue({
      ok: false,
      code: 'YOUTUBE_REJECTED',
      message: 'videoNotFound: The video resource could not be found.',
    });

    render(
      <VideoPublishPanel
        draftJson={STUB_DRAFT_JSON}
        youtubeTarget={STUB_YOUTUBE_TARGET}
        draftId="draft-1"
        onPublish={onPublish}
      />,
    );
    const directBtn = screen.getByRole('button', { name: /direct publish/i });
    await user.click(directBtn);
    await user.click(screen.getByTestId('yt-publish-cta'));

    await waitFor(() => {
      expect(screen.getByTestId('yt-error-rejected')).toBeInTheDocument();
    });
    expect(screen.getByText(/videoNotFound/)).toBeInTheDocument();
  });

  // ── AC6: Bundle mode regression ───────────────────────────────────────────

  it('bundle mode is the default and renders bundle-actions', () => {
    render(
      <VideoPublishPanel
        draftJson={STUB_DRAFT_JSON}
        draftId="draft-1"
      />,
    );
    expect(screen.getByTestId('video-publish-bundle-actions')).toBeInTheDocument();
    expect(screen.queryByTestId('video-publish-direct-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('video-publish-direct-placeholder')).not.toBeInTheDocument();
  });
});
