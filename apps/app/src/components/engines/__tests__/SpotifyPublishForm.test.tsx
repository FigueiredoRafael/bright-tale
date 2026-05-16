/**
 * Unit tests for SpotifyPublishForm (T6.2 front-end driver).
 *
 * Behaviors:
 * 1. Renders all fields (title, description, audio URL, duration, thumbnail, explicit)
 * 2. Validates required fields on submit — shows error messages when empty
 * 3. Validates audio URL format — rejects non-URL strings
 * 4. Calls onSubmit with parsed values on valid submit
 * 5. Disables submit button when isSubmitting prop is true
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { SpotifyPublishForm } from '../publish-drivers/SpotifyPublishForm';

const minimalProps = {
  publishTarget: {
    id: 'pt-1',
    type: 'spotify' as const,
    channelId: 'ch-1',
    displayName: 'My Show',
    configJson: {},
  },
  draft: {},
};

describe('SpotifyPublishForm', () => {
  // ─── Behavior 1: renders all fields ──────────────────────────────────────

  it('renders all episode metadata fields', () => {
    render(<SpotifyPublishForm {...minimalProps} />);

    expect(screen.getByTestId('sp-title')).toBeInTheDocument();
    expect(screen.getByTestId('sp-description')).toBeInTheDocument();
    expect(screen.getByTestId('sp-audio-url')).toBeInTheDocument();
    expect(screen.getByTestId('sp-duration')).toBeInTheDocument();
    expect(screen.getByTestId('sp-thumbnail-url')).toBeInTheDocument();
    expect(screen.getByTestId('sp-explicit')).toBeInTheDocument();
    expect(screen.getByTestId('sp-confirm-publish')).toBeInTheDocument();
  });

  // ─── Behavior 2: validates required fields on submit ─────────────────────

  it('shows error messages for required fields when submitted empty', async () => {
    const user = userEvent.setup();
    render(<SpotifyPublishForm {...minimalProps} />);

    await user.click(screen.getByTestId('sp-confirm-publish'));

    await waitFor(() => {
      expect(screen.getByTestId('sp-title-error')).toBeInTheDocument();
      expect(screen.getByTestId('sp-description-error')).toBeInTheDocument();
      expect(screen.getByTestId('sp-audio-url-error')).toBeInTheDocument();
    });
  });

  // ─── Behavior 3: validates audio URL format ───────────────────────────────

  it('shows an error when audioUrl is not a valid URL', async () => {
    const user = userEvent.setup();
    render(<SpotifyPublishForm {...minimalProps} />);

    await user.type(screen.getByTestId('sp-title'), 'Test Episode');
    await user.type(screen.getByTestId('sp-description'), 'Some description');
    await user.type(screen.getByTestId('sp-audio-url'), 'not-a-url');
    await user.type(screen.getByTestId('sp-duration'), '1800');

    await user.click(screen.getByTestId('sp-confirm-publish'));

    await waitFor(() => {
      expect(screen.getByTestId('sp-audio-url-error')).toBeInTheDocument();
      expect(screen.getByTestId('sp-audio-url-error')).toHaveTextContent(/valid url/i);
    });
  });

  // ─── Behavior 4: calls onSubmit with parsed values ────────────────────────

  it('calls onSubmit with parsed values when form is valid', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<SpotifyPublishForm {...minimalProps} onSubmit={onSubmit} />);

    await user.type(screen.getByTestId('sp-title'), 'Episode 1');
    await user.type(screen.getByTestId('sp-description'), 'All about something great.');
    await user.type(screen.getByTestId('sp-audio-url'), 'https://cdn.example.com/ep1.mp3');
    await user.type(screen.getByTestId('sp-duration'), '3600');

    await user.click(screen.getByTestId('sp-confirm-publish'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
      const vals = onSubmit.mock.calls[0][0] as Record<string, unknown>;
      expect(vals['title']).toBe('Episode 1');
      expect(vals['description']).toBe('All about something great.');
      expect(vals['audioUrl']).toBe('https://cdn.example.com/ep1.mp3');
      expect(vals['durationSec']).toBe(3600);
      expect(vals['itunesExplicit']).toBe(false);
    });
  });

  // ─── Behavior 5: disables submit when isSubmitting ───────────────────────

  it('disables the confirm button when isSubmitting is true', () => {
    render(<SpotifyPublishForm {...minimalProps} isSubmitting />);
    expect(screen.getByTestId('sp-confirm-publish')).toBeDisabled();
  });

  it('shows "Publishing…" label when isSubmitting is true', () => {
    render(<SpotifyPublishForm {...minimalProps} isSubmitting />);
    expect(screen.getByTestId('sp-confirm-publish')).toHaveTextContent('Publishing…');
  });
});
