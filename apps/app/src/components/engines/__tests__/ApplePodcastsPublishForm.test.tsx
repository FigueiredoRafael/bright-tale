/**
 * Unit tests for ApplePodcastsPublishForm (T6.3 front-end driver).
 *
 * Behaviors:
 * 1. Renders all 7 fields (title, description, audioUrl, durationSec,
 *    itunesAuthor, itunesImageUrl, itunesExplicit)
 * 2. Validates required fields on submit — shows error messages
 * 3. Validates audioUrl + itunesImageUrl must be https
 * 4. Calls onSubmit with parsed values on valid submit
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ApplePodcastsPublishForm } from '../publish-drivers/ApplePodcastsPublishForm';

const noop = vi.fn().mockResolvedValue(undefined);

describe('ApplePodcastsPublishForm', () => {
  // ─── Behavior 1: renders all 7 fields ────────────────────────────────────

  it('renders all 7 required fields', () => {
    render(<ApplePodcastsPublishForm onSubmit={noop} />);

    expect(screen.getByTestId('ap-title')).toBeInTheDocument();
    expect(screen.getByTestId('ap-description')).toBeInTheDocument();
    expect(screen.getByTestId('ap-audio-url')).toBeInTheDocument();
    expect(screen.getByTestId('ap-duration')).toBeInTheDocument();
    expect(screen.getByTestId('ap-itunes-author')).toBeInTheDocument();
    expect(screen.getByTestId('ap-itunes-image')).toBeInTheDocument();
    expect(screen.getByTestId('ap-itunes-explicit')).toBeInTheDocument();
  });

  // ─── Behavior 2: required field validation ────────────────────────────────

  it('shows error messages for required fields when submitted empty', async () => {
    const user = userEvent.setup();
    render(<ApplePodcastsPublishForm onSubmit={noop} />);

    await user.click(screen.getByTestId('ap-confirm-publish'));

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('does not call onSubmit when required fields are missing', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ApplePodcastsPublishForm onSubmit={onSubmit} />);

    await user.click(screen.getByTestId('ap-confirm-publish'));

    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  // ─── Behavior 3: https validation ─────────────────────────────────────────

  it('shows error when audioUrl is http (not https)', async () => {
    const user = userEvent.setup();
    render(<ApplePodcastsPublishForm onSubmit={noop} />);

    await user.type(screen.getByTestId('ap-title'), 'My Episode');
    await user.type(screen.getByTestId('ap-description'), 'A description');
    await user.type(screen.getByTestId('ap-audio-url'), 'http://example.com/ep.mp3');
    await user.type(screen.getByTestId('ap-duration'), '3600');
    await user.type(screen.getByTestId('ap-itunes-author'), 'Jane Doe');
    await user.type(screen.getByTestId('ap-itunes-image'), 'https://example.com/cover.jpg');
    await user.click(screen.getByTestId('ap-confirm-publish'));

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      const messages = alerts.map((a) => a.textContent ?? '');
      expect(messages.some((m) => m.toLowerCase().includes('https'))).toBe(true);
    });
  });

  it('shows error when itunesImageUrl is http (not https)', async () => {
    const user = userEvent.setup();
    render(<ApplePodcastsPublishForm onSubmit={noop} />);

    await user.type(screen.getByTestId('ap-title'), 'My Episode');
    await user.type(screen.getByTestId('ap-description'), 'A description');
    await user.type(screen.getByTestId('ap-audio-url'), 'https://example.com/ep.mp3');
    await user.type(screen.getByTestId('ap-duration'), '3600');
    await user.type(screen.getByTestId('ap-itunes-author'), 'Jane Doe');
    await user.type(screen.getByTestId('ap-itunes-image'), 'http://example.com/cover.jpg');
    await user.click(screen.getByTestId('ap-confirm-publish'));

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      const messages = alerts.map((a) => a.textContent ?? '');
      expect(messages.some((m) => m.toLowerCase().includes('https'))).toBe(true);
    });
  });

  // ─── Behavior 4: calls onSubmit with parsed values ────────────────────────

  it('calls onSubmit with correct values when form is valid', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ApplePodcastsPublishForm onSubmit={onSubmit} />);

    await user.type(screen.getByTestId('ap-title'), 'My Episode');
    await user.type(screen.getByTestId('ap-description'), 'A great episode.');
    await user.type(screen.getByTestId('ap-audio-url'), 'https://storage.example.com/ep.mp3');
    await user.type(screen.getByTestId('ap-duration'), '3600');
    await user.type(screen.getByTestId('ap-itunes-author'), 'Jane Doe');
    await user.type(screen.getByTestId('ap-itunes-image'), 'https://example.com/cover.jpg');
    await user.click(screen.getByTestId('ap-confirm-publish'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
      const values = onSubmit.mock.calls[0][0] as Record<string, unknown>;
      expect(values['title']).toBe('My Episode');
      expect(values['description']).toBe('A great episode.');
      expect(values['audioUrl']).toBe('https://storage.example.com/ep.mp3');
      expect(values['durationSec']).toBe(3600);
      expect(values['itunesAuthor']).toBe('Jane Doe');
      expect(values['itunesImageUrl']).toBe('https://example.com/cover.jpg');
      expect(values['itunesExplicit']).toBe(false);
    });
  });
});
