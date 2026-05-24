/**
 * VideoPublishPanel — Direct mode OAuth connection state (issue #217)
 *
 * Replaces the coming-soon placeholder in direct mode with live affordance:
 * - When no YouTube OAuth target: shows "Connect YouTube" CTA
 * - When YouTube OAuth connected: shows YouTube upload form (coming in #222)
 *
 * TDD red → green.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { VideoPublishPanel } from '../publish-drivers/VideoPublishPanel';

afterEach(() => {
  vi.restoreAllMocks();
});

const STUB_DRAFT_JSON = {
  channel: { name: 'My Channel', handle: '@mychannel', subscribers: '10K' },
  video_title: 'Test Video',
  video_description: 'A test description',
  pinned_comment: 'A pinned comment',
  tags: ['tag1', 'tag2'],
  thumbnail_ideas: [{ title: 'Concept 1' }],
  lower_thirds: [{ at: '0:00', label: 'Intro' }],
  script: { chapters: [{ broll: ['shot1'] }] },
};

// ─────────────────────────────────────────────────────────────────────────────
// Direct mode: not connected → shows Connect YouTube CTA
// ─────────────────────────────────────────────────────────────────────────────

describe('VideoPublishPanel direct mode — not connected (issue #217)', () => {
  it('shows Connect YouTube CTA when no oauth target is connected', async () => {
    const user = userEvent.setup();
    render(
      <VideoPublishPanel
        draftJson={STUB_DRAFT_JSON}
        channelId="chan-1"
        youtubeConnected={false}
      />,
    );

    // Switch to direct mode
    const directBtn = screen.getByRole('button', { name: /direct publish/i });
    await user.click(directBtn);

    // Should show Connect YouTube button
    expect(screen.getByRole('button', { name: /connect youtube/i })).toBeTruthy();
  });

  it('does not show the coming-soon placeholder once youtubeConnected prop is provided', async () => {
    const user = userEvent.setup();
    render(
      <VideoPublishPanel
        draftJson={STUB_DRAFT_JSON}
        channelId="chan-1"
        youtubeConnected={false}
      />,
    );

    const directBtn = screen.getByRole('button', { name: /direct publish/i });
    await user.click(directBtn);

    // The old "coming soon" placeholder should be gone
    expect(screen.queryByText(/direct publish.*coming soon/i)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Direct mode: connected → shows connected state
// ─────────────────────────────────────────────────────────────────────────────

describe('VideoPublishPanel direct mode — connected (issue #217)', () => {
  it('shows connected badge in direct mode when youtubeConnected=true', async () => {
    const user = userEvent.setup();
    render(
      <VideoPublishPanel
        draftJson={STUB_DRAFT_JSON}
        channelId="chan-1"
        youtubeConnected={true}
        youtubeDisplayName="@mychannel"
      />,
    );

    const directBtn = screen.getByRole('button', { name: /direct publish/i });
    await user.click(directBtn);

    // Should show connected badge or state
    expect(screen.getByTestId('yt-connected-badge')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Backward compatibility: when channelId not provided, falls back gracefully
// ─────────────────────────────────────────────────────────────────────────────

describe('VideoPublishPanel direct mode — no channelId (backward compat)', () => {
  it('renders without error when channelId is not provided', async () => {
    const user = userEvent.setup();
    render(<VideoPublishPanel draftJson={STUB_DRAFT_JSON} />);

    const directBtn = screen.getByRole('button', { name: /direct publish/i });
    await user.click(directBtn);

    // Should render something in direct mode (button or placeholder)
    expect(screen.getByTestId('video-publish-direct-placeholder')).toBeTruthy();
  });
});
