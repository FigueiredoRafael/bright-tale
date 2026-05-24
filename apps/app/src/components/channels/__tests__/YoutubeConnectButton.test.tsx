/**
 * Tests for YoutubeConnectButton (issue #217).
 *
 * Behaviors:
 * 1. When not connected: renders "Connect YouTube" button
 * 2. Clicking the button calls POST /api/channels/:id/youtube/connect and
 *    redirects to the returned URL
 * 3. When connected: renders a "Connected" badge + channel handle
 * 4. Shows loading state while fetch is in progress
 * 5. Shows error state when connect endpoint fails
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { YoutubeConnectButton } from '../YoutubeConnectButton';

// ── Window mock ───────────────────────────────────────────────────────────────
const mockAssign = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...originalLocation, assign: mockAssign, href: '' },
  });
  mockAssign.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Not connected → shows "Connect YouTube" button
// ─────────────────────────────────────────────────────────────────────────────

describe('YoutubeConnectButton (not connected)', () => {
  it('renders a "Connect YouTube" button when not connected', () => {
    render(<YoutubeConnectButton channelId="chan-1" isConnected={false} />);
    expect(screen.getByRole('button', { name: /connect youtube/i })).toBeTruthy();
  });

  it('does not render a connected badge when not connected', () => {
    render(<YoutubeConnectButton channelId="chan-1" isConnected={false} />);
    expect(screen.queryByTestId('yt-connected-badge')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Button click → calls connect endpoint + redirects
// ─────────────────────────────────────────────────────────────────────────────

describe('YoutubeConnectButton click behavior', () => {
  it('calls POST /api/channels/:id/youtube/connect and redirects to returned URL', async () => {
    const CONSENT_URL = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test';

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { url: CONSENT_URL }, error: null }),
    });

    const user = userEvent.setup();
    render(<YoutubeConnectButton channelId="chan-1" isConnected={false} />);

    await user.click(screen.getByRole('button', { name: /connect youtube/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/channels/chan-1/youtube/connect',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await waitFor(() => {
      // Redirect to Google OAuth consent URL
      expect(window.location.href).toBe(CONSENT_URL);
    });
  });

  it('shows loading state while fetching', async () => {
    // Never resolves — keeps the button in loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(<YoutubeConnectButton channelId="chan-1" isConnected={false} />);

    await user.click(screen.getByRole('button', { name: /connect youtube/i }));

    // Button should be disabled / show loading indicator
    const btn = screen.getByRole('button', { name: /connecting|connect youtube/i });
    expect(btn).toHaveProperty('disabled', true);
  });

  it('shows error message when connect endpoint returns an error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ data: null, error: { code: 'INTERNAL', message: 'Something went wrong' } }),
    });

    const user = userEvent.setup();
    render(<YoutubeConnectButton channelId="chan-1" isConnected={false} />);

    await user.click(screen.getByRole('button', { name: /connect youtube/i }));

    await waitFor(() => {
      expect(screen.getByTestId('yt-connect-error')).toBeTruthy();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Connected → shows badge
// ─────────────────────────────────────────────────────────────────────────────

describe('YoutubeConnectButton (connected)', () => {
  it('renders a connected badge when isConnected is true', () => {
    render(
      <YoutubeConnectButton channelId="chan-1" isConnected={true} displayName="@mychannel" />,
    );
    expect(screen.getByTestId('yt-connected-badge')).toBeTruthy();
  });

  it('shows the displayName when connected', () => {
    render(
      <YoutubeConnectButton channelId="chan-1" isConnected={true} displayName="@mychannel" />,
    );
    expect(screen.getByText('@mychannel')).toBeTruthy();
  });

  it('does not render "Connect YouTube" button when connected', () => {
    render(
      <YoutubeConnectButton channelId="chan-1" isConnected={true} displayName="@mychannel" />,
    );
    expect(screen.queryByRole('button', { name: /connect youtube/i })).toBeNull();
  });
});
