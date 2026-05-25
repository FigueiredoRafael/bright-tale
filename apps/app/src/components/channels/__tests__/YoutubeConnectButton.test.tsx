/**
 * S8 — YoutubeConnectButton component tests
 *
 * Behaviors:
 * 1. Renders "Connect YouTube" button by default (no connected target)
 * 2. Shows connected channel name/handle when target is connected
 * 3. Clicking button calls /api/channels/:id/youtube/connect and redirects
 * 4. Shows loading state while fetching consent URL
 * 5. Shows error when API call fails
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { YoutubeConnectButton } from '../YoutubeConnectButton';

const CHANNEL_ID = 'ch-abc123';

describe('YoutubeConnectButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders "Connect YouTube" button when no target is connected', () => {
    render(<YoutubeConnectButton channelId={CHANNEL_ID} connectedTarget={null} />);
    expect(screen.getByRole('button', { name: /Connect YouTube/i })).toBeInTheDocument();
  });

  it('shows connected channel name and handle when target exists', () => {
    const connectedTarget = {
      id: 'pt-1',
      displayName: 'My YouTube Channel',
      configJson: { channelTitle: 'BrightTale', channelHandle: '@brighttale' },
    };

    render(<YoutubeConnectButton channelId={CHANNEL_ID} connectedTarget={connectedTarget} />);

    expect(screen.getByText(/BrightTale/)).toBeInTheDocument();
    expect(screen.getByText(/@brighttale/)).toBeInTheDocument();
  });

  it('shows a disconnect/reconnect option when already connected', () => {
    const connectedTarget = {
      id: 'pt-1',
      displayName: 'My YouTube Channel',
      configJson: { channelTitle: 'BrightTale', channelHandle: '@brighttale' },
    };

    render(<YoutubeConnectButton channelId={CHANNEL_ID} connectedTarget={connectedTarget} />);

    expect(screen.getByRole('button', { name: /Reconnect|Disconnect/i })).toBeInTheDocument();
  });

  it('calls the connect API and redirects the user on button click', async () => {
    const mockConsentUrl = 'https://accounts.google.com/o/oauth2/v2/auth?state=ch:ch-abc123:rand';

    global.fetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          data: { url: mockConsentUrl },
          error: null,
        }),
    });

    const assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign: assignMock },
      writable: true,
    });

    render(<YoutubeConnectButton channelId={CHANNEL_ID} connectedTarget={null} />);

    fireEvent.click(screen.getByRole('button', { name: /Connect YouTube/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/channels/${CHANNEL_ID}/youtube/connect`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith(mockConsentUrl);
    });
  });

  it('shows loading state while fetching consent URL', async () => {
    // Never resolves — simulates slow network
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<YoutubeConnectButton channelId={CHANNEL_ID} connectedTarget={null} />);

    fireEvent.click(screen.getByRole('button', { name: /Connect YouTube/i }));

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Connecting|Loading/i });
      expect(btn).toBeDisabled();
    });
  });

  it('shows an error message when the API call fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          data: null,
          error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
        }),
    });

    render(<YoutubeConnectButton channelId={CHANNEL_ID} connectedTarget={null} />);

    fireEvent.click(screen.getByRole('button', { name: /Connect YouTube/i }));

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong|error/i)).toBeInTheDocument();
    });
  });
});
