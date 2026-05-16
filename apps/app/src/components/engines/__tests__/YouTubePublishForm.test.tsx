/**
 * Unit tests for YouTubePublishForm (T6.1 front-end driver).
 *
 * Behaviors:
 * 1. Renders all metadata fields (title, description, tags, privacy)
 * 2. Pre-fills fields from defaultValues prop
 * 3. Shows thumbnail preview only when thumbnailUrl is supplied
 * 4. Calls onConfirm with form values when submitted
 * 5. Disables submit button while isSubmitting
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { YouTubePublishForm } from '../publish-drivers/YouTubePublishForm';

const minimalProps = {
  publishTarget: { id: 'pt-1', type: 'youtube', displayName: 'My Channel', configJson: {} },
  draft: {},
};

describe('YouTubePublishForm', () => {
  // ─── Behavior 1: renders all fields ──────────────────────────────────────

  it('renders title, description, tags, and privacy fields', () => {
    render(<YouTubePublishForm {...minimalProps} />);

    expect(screen.getByTestId('yt-title')).toBeInTheDocument();
    expect(screen.getByTestId('yt-description')).toBeInTheDocument();
    expect(screen.getByTestId('yt-tags')).toBeInTheDocument();
    expect(screen.getByTestId('yt-privacy')).toBeInTheDocument();
    expect(screen.getByTestId('yt-confirm-publish')).toBeInTheDocument();
  });

  // ─── Behavior 2: pre-fills from defaultValues ─────────────────────────

  it('pre-fills fields from defaultValues', () => {
    render(
      <YouTubePublishForm
        {...minimalProps}
        defaultValues={{
          title: 'My Pre-filled Title',
          description: 'Pre-filled description',
          tags: 'alpha, beta',
          privacyStatus: 'unlisted',
        }}
      />,
    );

    expect(screen.getByTestId('yt-title')).toHaveValue('My Pre-filled Title');
    expect(screen.getByTestId('yt-description')).toHaveValue('Pre-filled description');
    expect(screen.getByTestId('yt-tags')).toHaveValue('alpha, beta');
  });

  // ─── Behavior 3: thumbnail preview conditional ────────────────────────

  it('does NOT render thumbnail preview when thumbnailUrl is absent', () => {
    render(<YouTubePublishForm {...minimalProps} />);
    expect(screen.queryByTestId('yt-thumbnail-preview')).not.toBeInTheDocument();
  });

  it('renders thumbnail preview when thumbnailUrl is provided', () => {
    render(
      <YouTubePublishForm
        {...minimalProps}
        thumbnailUrl="https://example.com/thumb.jpg"
      />,
    );
    expect(screen.getByTestId('yt-thumbnail-preview')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /thumbnail/i })).toHaveAttribute(
      'src',
      'https://example.com/thumb.jpg',
    );
  });

  // ─── Behavior 4: onConfirm called with values ─────────────────────────

  it('calls onConfirm with form values on submit', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <YouTubePublishForm
        {...minimalProps}
        defaultValues={{ title: 'Submit Test', privacyStatus: 'public' }}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByTestId('yt-confirm-publish'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledOnce();
      const vals = onConfirm.mock.calls[0][0] as Record<string, unknown>;
      expect(vals['title']).toBe('Submit Test');
      expect(vals['privacyStatus']).toBe('public');
    });
  });

  // ─── Behavior 5: isSubmitting disables button ─────────────────────────

  it('disables the confirm button when isSubmitting is true', () => {
    render(<YouTubePublishForm {...minimalProps} isSubmitting />);
    expect(screen.getByTestId('yt-confirm-publish')).toBeDisabled();
  });

  it('shows "Publishing…" label when isSubmitting is true', () => {
    render(<YouTubePublishForm {...minimalProps} isSubmitting />);
    expect(screen.getByTestId('yt-confirm-publish')).toHaveTextContent('Publishing…');
  });
});
