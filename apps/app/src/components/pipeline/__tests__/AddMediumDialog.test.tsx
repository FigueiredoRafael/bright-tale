/**
 * T5.4 — AddMediumDialog unit tests (TDD).
 *
 * Acceptance criteria:
 *   AC1 — renders only media not in existingMedia
 *   AC2 — submitting calls POST /api/projects/:id/tracks with chosen medium + config
 *   AC3 — after success, dialog closes and onTrackAdded fires
 *   AC4 — FocusSidebar sidebar-add-medium button opens the dialog
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AddMediumDialog } from '../AddMediumDialog';

// ─── fetch helpers ────────────────────────────────────────────────────────────

function makeTrackPostResponse(ok = true) {
  return {
    data: ok ? { track: { id: 'track-new', medium: 'video', status: 'active', paused: false } } : null,
    error: ok ? null : { code: 'TRACK_INSERT_FAILED', message: 'Failed to create track' },
  };
}

function makeChannelResponse(defaultMediaConfig: Record<string, unknown> = {}) {
  return {
    data: {
      id: 'ch-1',
      name: 'Tech Blog',
      defaultMediaConfigJson: defaultMediaConfig,
    },
    error: null,
  };
}

function makeFetch(
  trackResponse = makeTrackPostResponse(true),
  channelResponse = makeChannelResponse(),
) {
  return vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (typeof url === 'string' && url.includes('/api/channels/') && opts?.method === undefined) {
      return Promise.resolve({ ok: true, json: async () => channelResponse });
    }
    if (typeof url === 'string' && url.includes('/tracks') && opts?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => trackResponse });
    }
    return Promise.resolve({ ok: true, json: async () => ({ data: null, error: null }) });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── AC1: renders only media not in existingMedia ────────────────────────────

describe('AddMediumDialog — AC1: renders only unavailable media filtered out', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', makeFetch());
  });

  it('renders all four media options when existingMedia is empty', async () => {
    render(
      <AddMediumDialog
        open
        projectId="proj-1"
        channelId="ch-1"
        existingMedia={[]}
        onClose={vi.fn()}
        onTrackAdded={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('add-medium-select')).toBeInTheDocument();
    });
    const select = screen.getByTestId('add-medium-select') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value).filter(Boolean);
    expect(options).toContain('blog');
    expect(options).toContain('video');
    expect(options).toContain('shorts');
    expect(options).toContain('podcast');
  });

  it('excludes media already in existingMedia', async () => {
    render(
      <AddMediumDialog
        open
        projectId="proj-1"
        channelId="ch-1"
        existingMedia={['blog', 'video']}
        onClose={vi.fn()}
        onTrackAdded={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('add-medium-select')).toBeInTheDocument();
    });
    const select = screen.getByTestId('add-medium-select') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value).filter(Boolean);
    expect(options).not.toContain('blog');
    expect(options).not.toContain('video');
    expect(options).toContain('shorts');
    expect(options).toContain('podcast');
  });

  it('shows a message when all media are already tracked', async () => {
    render(
      <AddMediumDialog
        open
        projectId="proj-1"
        channelId="ch-1"
        existingMedia={['blog', 'video', 'shorts', 'podcast']}
        onClose={vi.fn()}
        onTrackAdded={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('add-medium-all-tracked')).toBeInTheDocument();
    });
  });
});

// ─── AC2: submitting calls POST with chosen medium + config ──────────────────

describe('AddMediumDialog — AC2: submit calls POST /api/projects/:id/tracks', () => {
  it('submits POST with the selected medium and default config', async () => {
    const mockFetch = makeFetch();
    vi.stubGlobal('fetch', mockFetch);
    const user = userEvent.setup();

    render(
      <AddMediumDialog
        open
        projectId="proj-1"
        channelId="ch-1"
        existingMedia={['blog']}
        onClose={vi.fn()}
        onTrackAdded={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('add-medium-select')).toBeInTheDocument();
    });

    // Select 'video'
    const select = screen.getByTestId('add-medium-select');
    await user.selectOptions(select, 'video');

    // Submit
    const submitBtn = screen.getByTestId('add-medium-submit');
    await user.click(submitBtn);

    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find(
        (args) =>
          (args[0] as string).includes('/api/projects/proj-1/tracks') &&
          (args[1] as RequestInit)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
      const postOpts = (postCall as unknown[])[1] as RequestInit;
      const body = JSON.parse(postOpts.body as string);
      expect(body.medium).toBe('video');
    });
  });

  it('shows an aria-live error region when submission fails', async () => {
    const mockFetch = makeFetch(makeTrackPostResponse(false));
    vi.stubGlobal('fetch', mockFetch);
    const user = userEvent.setup();

    render(
      <AddMediumDialog
        open
        projectId="proj-1"
        channelId="ch-1"
        existingMedia={[]}
        onClose={vi.fn()}
        onTrackAdded={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('add-medium-select')).toBeInTheDocument();
    });

    const select = screen.getByTestId('add-medium-select');
    await user.selectOptions(select, 'blog');

    const submitBtn = screen.getByTestId('add-medium-submit');
    await user.click(submitBtn);

    await waitFor(() => {
      const errorEl = screen.getByTestId('add-medium-error');
      expect(errorEl).toBeInTheDocument();
      expect(errorEl).toHaveAttribute('aria-live', 'polite');
    });
  });

  it('shows an aria-live loading indicator during submission', async () => {
    let resolvePost: (v: unknown) => void;
    const slowPost = new Promise((res) => { resolvePost = res; });

    const mockFetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/channels/')) {
        return Promise.resolve({ ok: true, json: async () => makeChannelResponse() });
      }
      if (typeof url === 'string' && url.includes('/tracks') && opts?.method === 'POST') {
        return slowPost.then(() => ({ ok: true, json: async () => makeTrackPostResponse(true) }));
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: null, error: null }) });
    });

    vi.stubGlobal('fetch', mockFetch);
    const user = userEvent.setup();

    render(
      <AddMediumDialog
        open
        projectId="proj-1"
        channelId="ch-1"
        existingMedia={[]}
        onClose={vi.fn()}
        onTrackAdded={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('add-medium-select')).toBeInTheDocument();
    });

    const select = screen.getByTestId('add-medium-select');
    await user.selectOptions(select, 'blog');

    const submitBtn = screen.getByTestId('add-medium-submit');
    await user.click(submitBtn);

    // Should be in loading state
    await waitFor(() => {
      expect(screen.getByTestId('add-medium-loading')).toBeInTheDocument();
      expect(screen.getByTestId('add-medium-loading')).toHaveAttribute('aria-live', 'polite');
    });

    // Resolve and clean up
    resolvePost!(undefined);
  });
});

// ─── AC3: after success, dialog closes and onTrackAdded fires ────────────────

describe('AddMediumDialog — AC3: success closes dialog and fires onTrackAdded', () => {
  it('calls onClose and onTrackAdded after successful POST', async () => {
    const mockFetch = makeFetch();
    vi.stubGlobal('fetch', mockFetch);
    const onClose = vi.fn();
    const onTrackAdded = vi.fn();
    const user = userEvent.setup();

    render(
      <AddMediumDialog
        open
        projectId="proj-1"
        channelId="ch-1"
        existingMedia={[]}
        onClose={onClose}
        onTrackAdded={onTrackAdded}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('add-medium-select')).toBeInTheDocument();
    });

    const select = screen.getByTestId('add-medium-select');
    await user.selectOptions(select, 'blog');

    const submitBtn = screen.getByTestId('add-medium-submit');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
      expect(onTrackAdded).toHaveBeenCalled();
    });
  });

  it('does NOT call onTrackAdded when POST fails', async () => {
    const mockFetch = makeFetch(makeTrackPostResponse(false));
    vi.stubGlobal('fetch', mockFetch);
    const onClose = vi.fn();
    const onTrackAdded = vi.fn();
    const user = userEvent.setup();

    render(
      <AddMediumDialog
        open
        projectId="proj-1"
        channelId="ch-1"
        existingMedia={[]}
        onClose={onClose}
        onTrackAdded={onTrackAdded}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('add-medium-select')).toBeInTheDocument();
    });

    const select = screen.getByTestId('add-medium-select');
    await user.selectOptions(select, 'blog');

    const submitBtn = screen.getByTestId('add-medium-submit');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('add-medium-error')).toBeInTheDocument();
    });

    expect(onTrackAdded).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
