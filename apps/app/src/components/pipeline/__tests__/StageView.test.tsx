/**
 * Slice 5 (#13) — StageView 4 visual states.
 *
 * useProjectStream is stubbed so we control exactly which Stage Run
 * shape the view sees.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { StageRun } from '@brighttale/shared/pipeline/inputs';

const useProjectStreamMock = vi.fn();
vi.mock('@/hooks/useProjectStream', () => ({
  useProjectStream: (...args: unknown[]) => useProjectStreamMock(...args),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { StageView } from '../StageView';

const PROJECT_ID = 'proj-1';

function runForBrainstorm(overrides: Partial<StageRun> = {}): StageRun {
  return {
    id: 'sr-1',
    projectId: PROJECT_ID,
    stage: 'brainstorm',
    status: 'queued',
    awaitingReason: null,
    payloadRef: null,
    attemptNo: 1,
    inputJson: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-05-11T00:00:00Z',
    updatedAt: '2026-05-11T00:00:00Z',
    ...overrides,
  };
}

function streamWith(runs: Partial<Record<StageRun['stage'], StageRun | null>>): void {
  useProjectStreamMock.mockReturnValue({
    stageRuns: {
      brainstorm: null,
      research: null,
      draft: null,
      review: null,
      assets: null,
      preview: null,
      publish: null,
      ...runs,
    },
    liveEvent: null,
    isConnected: true,
    refresh: vi.fn(async () => undefined),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: {}, error: null }) });
  streamWith({});
});

describe('<StageView /> — 4 visual states', () => {
  it('state 1: no Stage Run → renders BrainstormForm', () => {
    render(<StageView projectId={PROJECT_ID} stage="brainstorm" />);
    expect(screen.getByTestId('brainstorm-form')).toBeInTheDocument();
  });

  it('state 2 (running): renders ActivityPanel with Abort button', () => {
    streamWith({ brainstorm: runForBrainstorm({ status: 'running' }) });
    render(<StageView projectId={PROJECT_ID} stage="brainstorm" />);
    expect(screen.getByTestId('activity-panel')).toBeInTheDocument();
    expect(screen.getByTestId('stage-abort')).toBeInTheDocument();
  });

  it('state 2 (queued): renders ActivityPanel with "Queued" copy', () => {
    streamWith({ brainstorm: runForBrainstorm({ status: 'queued' }) });
    render(<StageView projectId={PROJECT_ID} stage="brainstorm" />);
    expect(screen.getByText(/Queued/)).toBeInTheDocument();
  });

  it('Abort button PATCHes /:stageRunId with { action: "abort" }', async () => {
    streamWith({ brainstorm: runForBrainstorm({ status: 'running' }) });
    render(<StageView projectId={PROJECT_ID} stage="brainstorm" />);

    fireEvent.click(screen.getByTestId('stage-abort'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/projects/${PROJECT_ID}/stage-runs/sr-1`);
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ action: 'abort' });
  });

  it('state 3 (manual_advance): renders Continue button → POSTs /:stageRunId/continue', async () => {
    streamWith({
      brainstorm: runForBrainstorm({ status: 'awaiting_user', awaitingReason: 'manual_advance' }),
    });
    render(<StageView projectId={PROJECT_ID} stage="brainstorm" />);

    expect(screen.getByTestId('manual-advance-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('stage-continue'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/projects/${PROJECT_ID}/stage-runs/sr-1/continue`);
    expect((init as RequestInit).method).toBe('POST');
  });

  it('state 3 (manual_paste): renders textarea → POSTs /:stageRunId/manual-output', async () => {
    streamWith({
      brainstorm: runForBrainstorm({ status: 'awaiting_user', awaitingReason: 'manual_paste' }),
    });
    render(<StageView projectId={PROJECT_ID} stage="brainstorm" />);

    fireEvent.change(screen.getByTestId('stage-manual-output'), { target: { value: 'AI output here' } });
    fireEvent.click(screen.getByTestId('stage-manual-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/projects/${PROJECT_ID}/stage-runs/sr-1/manual-output`);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ output: 'AI output here' });
  });

  it('state 4 (completed): renders TerminalPanel with Re-run button + payload ref', () => {
    streamWith({
      brainstorm: runForBrainstorm({
        status: 'completed',
        payloadRef: { kind: 'brainstorm_draft', id: 'bd-1' },
      }),
    });
    render(<StageView projectId={PROJECT_ID} stage="brainstorm" />);

    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument();
    expect(screen.getByText(/brainstorm_draft#bd-1/)).toBeInTheDocument();
    expect(screen.getByTestId('stage-rerun')).toBeInTheDocument();
  });

  it('state 4 (failed): shows errorMessage and Re-run button', () => {
    streamWith({
      brainstorm: runForBrainstorm({
        status: 'failed',
        errorMessage: 'Provider down',
      }),
    });
    render(<StageView projectId={PROJECT_ID} stage="brainstorm" />);

    expect(screen.getByText('Provider down')).toBeInTheDocument();
    expect(screen.getByTestId('stage-rerun')).toBeInTheDocument();
  });

  it('Re-run posts a fresh Stage Run with the prior input_json', async () => {
    streamWith({
      brainstorm: runForBrainstorm({
        status: 'failed',
        inputJson: { mode: 'topic_driven', topic: 'AI pricing' },
      }),
    });
    render(<StageView projectId={PROJECT_ID} stage="brainstorm" />);

    fireEvent.click(screen.getByTestId('stage-rerun'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/projects/${PROJECT_ID}/stage-runs`);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.stage).toBe('brainstorm');
    expect(body.input).toEqual({ mode: 'topic_driven', topic: 'AI pricing' });
  });
});
