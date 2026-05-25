/**
 * Slice 12 (#20) — ProjectModeControls.
 *
 * Mode + Paused write the columns via PATCH /api/projects/:id. View is
 * UI-only (not a column) and isn't exercised by this component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { ProjectModeControls } from '../ProjectModeControls';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const PROJECT_ID = 'proj-1';

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: {}, error: null }) });
});

describe('<ProjectModeControls />', () => {
  it('renders the current mode + paused state', () => {
    render(
      <ProjectModeControls projectId={PROJECT_ID} initialMode="autopilot" initialPaused={false} />,
    );
    expect(screen.getByTestId('mode-toggle')).toHaveAttribute('data-mode', 'autopilot');
    expect(screen.getByTestId('paused-toggle')).toHaveAttribute('data-paused', 'false');
  });

  it('toggles Mode and PATCHes /api/projects/:id with { mode } on click', async () => {
    render(
      <ProjectModeControls projectId={PROJECT_ID} initialMode="autopilot" initialPaused={false} />,
    );

    fireEvent.click(screen.getByTestId('mode-toggle'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/projects/${PROJECT_ID}`);
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ mode: 'manual' });
    expect(screen.getByTestId('mode-toggle')).toHaveAttribute('data-mode', 'manual');
  });

  it('toggles Paused and PATCHes with { paused } on click', async () => {
    render(
      <ProjectModeControls projectId={PROJECT_ID} initialMode="autopilot" initialPaused={false} />,
    );

    fireEvent.click(screen.getByTestId('paused-toggle'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ paused: true });
    expect(screen.getByTestId('paused-toggle')).toHaveAttribute('data-paused', 'true');
  });

  it('reverts optimistic state when the PATCH fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ data: null, error: { code: 'X' } }) });

    render(
      <ProjectModeControls projectId={PROJECT_ID} initialMode="autopilot" initialPaused={false} />,
    );
    fireEvent.click(screen.getByTestId('mode-toggle'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // Revert: still autopilot
    await waitFor(() =>
      expect(screen.getByTestId('mode-toggle')).toHaveAttribute('data-mode', 'autopilot'),
    );
  });

  it('does not fire any request when only rendering (view toggle is not its concern)', () => {
    render(
      <ProjectModeControls projectId={PROJECT_ID} initialMode="manual" initialPaused={true} />,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
