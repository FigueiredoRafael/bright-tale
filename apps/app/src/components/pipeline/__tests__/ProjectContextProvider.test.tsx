/**
 * Slice 14.1 — ProjectContextProvider unit tests (TDD red→green→refactor).
 *
 * Slices covered:
 *   1. Renders children
 *   2. Fetches project + stages on mount (two fetch calls)
 *   3. Exposes all 17 PipelineMachineContext fields via useProjectContext()
 *   4. Derives stageResults from stageRuns
 *   5. Exposes refetch — calling it re-fires both fetches
 *   6. isLoading: true while fetches pending
 *   7. error state: surfaces fetch failure via context
 *   8. Session-local setters: setStageStatus, setPendingDrillIn, setReturnPromptOpen, setPauseReason
 */
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { ProjectContextProvider, useProjectContext } from '../ProjectContextProvider';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROJECT_ID = 'proj-abc-123';

/** Minimal project row returned by GET /api/projects/:id */
const PROJECT_ROW = {
  id: PROJECT_ID,
  channel_id: 'ch-xyz',
  title: 'Test Project',
  mode: 'step-by-step',
  autopilot_config_json: null,
  template_id: null,
  paused: false,
  pipeline_state_json: null,
};

/** A completed brainstorm stage run */
const BRAINSTORM_RUN = {
  id: 'sr-brainstorm-1',
  projectId: PROJECT_ID,
  stage: 'brainstorm',
  status: 'completed',
  attemptNo: 1,
  finishedAt: '2026-01-01T12:00:00Z',
  errorMessage: null,
  outcomeJson: {
    ideaId: 'idea-1',
    ideaTitle: 'My Idea',
    ideaVerdict: 'good',
    ideaCoreTension: 'tension',
    brainstormSessionId: 'bs-1',
  },
  trackId: null,
  publishTargetId: null,
};

/** A completed research stage run */
const RESEARCH_RUN = {
  id: 'sr-research-1',
  projectId: PROJECT_ID,
  stage: 'research',
  status: 'completed',
  attemptNo: 1,
  finishedAt: '2026-01-01T13:00:00Z',
  errorMessage: null,
  outcomeJson: {
    researchSessionId: 'rs-1',
    approvedCardsCount: 5,
    researchLevel: 'deep',
  },
  trackId: null,
  publishTargetId: null,
};

/** Stages endpoint response */
const STAGES_RESPONSE = {
  data: {
    stageRuns: [BRAINSTORM_RUN, RESEARCH_RUN],
    tracks: [],
    project: { mode: 'step-by-step', paused: false },
  },
  error: null,
};

/** Project endpoint response */
const PROJECT_RESPONSE = {
  data: PROJECT_ROW,
  error: null,
};

/** A consumer that renders context fields as data-testid elements */
function ContextConsumer() {
  const { context, isLoading, error, refetch, setStageStatus, setPendingDrillIn, setReturnPromptOpen, setPauseReason } =
    useProjectContext();

  if (isLoading) return <div data-testid="loading">loading</div>;
  if (error) return <div data-testid="ctx-error">{error.message}</div>;

  return (
    <div>
      <div data-testid="ctx-projectId">{context.projectId}</div>
      <div data-testid="ctx-channelId">{context.channelId ?? 'null'}</div>
      <div data-testid="ctx-projectTitle">{context.projectTitle}</div>
      <div data-testid="ctx-mode">{context.mode ?? 'null'}</div>
      <div data-testid="ctx-paused">{String(context.paused)}</div>
      <div data-testid="ctx-iterationCount">{String(context.iterationCount)}</div>
      <div data-testid="ctx-lastError">{context.lastError ?? 'null'}</div>
      <div data-testid="ctx-brainstormIdeaId">{context.stageResults.brainstorm?.ideaId ?? 'none'}</div>
      <div data-testid="ctx-researchLevel">{context.stageResults.research?.researchLevel ?? 'none'}</div>
      <div data-testid="ctx-trackBlogDraftId">
        {context.stageResultsByTrack?.tracks?.['t-blog']?.draft?.draftId ?? 'none'}
      </div>
      <div data-testid="ctx-trackVideoDraftId">
        {context.stageResultsByTrack?.tracks?.['t-video']?.draft?.draftId ?? 'none'}
      </div>
      <div data-testid="ctx-pendingDrillIn">{context.pendingDrillIn ?? 'null'}</div>
      <div data-testid="ctx-returnPromptOpen">{String(context.returnPromptOpen)}</div>
      <button data-testid="btn-refetch" onClick={() => refetch()} />
      <button data-testid="btn-set-stage-status" onClick={() => setStageStatus('brainstorm', { isGenerating: true })} />
      <button data-testid="btn-set-pending-drill-in" onClick={() => setPendingDrillIn('assets')} />
      <button data-testid="btn-set-return-prompt-open" onClick={() => setReturnPromptOpen(true)} />
      <button data-testid="btn-set-pause-reason" onClick={() => setPauseReason('user_paused')} />
    </div>
  );
}

// ── Mock fetch ────────────────────────────────────────────────────────────────

function makeFetchMock(opts: {
  projectResponse?: object;
  stagesResponse?: object;
  projectError?: boolean;
  stagesError?: boolean;
} = {}) {
  const { projectResponse = PROJECT_RESPONSE, stagesResponse = STAGES_RESPONSE } = opts;
  return vi.fn().mockImplementation((url: string) => {
    if (opts.projectError && (url as string).match(/\/api\/projects\/[^/]+$/) && !(url as string).includes('/stages')) {
      return Promise.reject(new Error('Network error'));
    }
    if (opts.stagesError && (url as string).includes('/stages')) {
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ data: null, error: { message: 'Stages fetch failed' } }),
      });
    }
    if ((url as string).includes('/stages')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(stagesResponse) });
    }
    // Project endpoint
    return Promise.resolve({ ok: true, json: () => Promise.resolve(projectResponse) });
  });
}

let originalFetch: typeof global.fetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProjectContextProvider — slice 1: renders children', () => {
  it('renders children inside the provider', async () => {
    global.fetch = makeFetchMock();
    render(
      <ProjectContextProvider projectId={PROJECT_ID}>
        <div data-testid="child">hello</div>
      </ProjectContextProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});

describe('ProjectContextProvider — slice 2: fetches on mount', () => {
  it('calls fetch for both project and stages on mount', async () => {
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock;
    render(
      <ProjectContextProvider projectId={PROJECT_ID}>
        <ContextConsumer />
      </ProjectContextProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId('loading')).not.toBeInTheDocument());
    const calls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(calls.some((url) => url.includes(`/api/projects/${PROJECT_ID}`) && !url.includes('/stages'))).toBe(true);
    expect(calls.some((url) => url.includes(`/api/projects/${PROJECT_ID}/stages`))).toBe(true);
  });
});

describe('ProjectContextProvider — slice 3: exposes context fields', () => {
  it('exposes projectId from project row', async () => {
    global.fetch = makeFetchMock();
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => screen.getByTestId('ctx-projectId'));
    expect(screen.getByTestId('ctx-projectId').textContent).toBe(PROJECT_ID);
  });

  it('exposes channelId from project row', async () => {
    global.fetch = makeFetchMock();
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => screen.getByTestId('ctx-channelId'));
    expect(screen.getByTestId('ctx-channelId').textContent).toBe('ch-xyz');
  });

  it('exposes projectTitle from project row', async () => {
    global.fetch = makeFetchMock();
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => screen.getByTestId('ctx-projectTitle'));
    expect(screen.getByTestId('ctx-projectTitle').textContent).toBe('Test Project');
  });

  it('exposes mode from project row', async () => {
    global.fetch = makeFetchMock();
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => screen.getByTestId('ctx-mode'));
    expect(screen.getByTestId('ctx-mode').textContent).toBe('step-by-step');
  });

  it('exposes paused from project row', async () => {
    global.fetch = makeFetchMock();
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => screen.getByTestId('ctx-paused'));
    expect(screen.getByTestId('ctx-paused').textContent).toBe('false');
  });

  it('exposes iterationCount (0 when no review runs)', async () => {
    global.fetch = makeFetchMock();
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => screen.getByTestId('ctx-iterationCount'));
    expect(screen.getByTestId('ctx-iterationCount').textContent).toBe('0');
  });

  it('exposes lastError as null when no failed runs', async () => {
    global.fetch = makeFetchMock();
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => screen.getByTestId('ctx-lastError'));
    expect(screen.getByTestId('ctx-lastError').textContent).toBe('null');
  });

  it('initializes pendingDrillIn as null', async () => {
    global.fetch = makeFetchMock();
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => screen.getByTestId('ctx-pendingDrillIn'));
    expect(screen.getByTestId('ctx-pendingDrillIn').textContent).toBe('null');
  });

  it('initializes returnPromptOpen as false', async () => {
    global.fetch = makeFetchMock();
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => screen.getByTestId('ctx-returnPromptOpen'));
    expect(screen.getByTestId('ctx-returnPromptOpen').textContent).toBe('false');
  });
});

describe('ProjectContextProvider — slice 4: derives stageResults', () => {
  it('maps brainstorm stage run outcome to stageResults.brainstorm', async () => {
    global.fetch = makeFetchMock();
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => screen.getByTestId('ctx-brainstormIdeaId'));
    expect(screen.getByTestId('ctx-brainstormIdeaId').textContent).toBe('idea-1');
  });

  it('maps research stage run outcome to stageResults.research', async () => {
    global.fetch = makeFetchMock();
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => screen.getByTestId('ctx-researchLevel'));
    expect(screen.getByTestId('ctx-researchLevel').textContent).toBe('deep');
  });

  it('derives iterationCount from max review run attemptNo', async () => {
    global.fetch = makeFetchMock({
      stagesResponse: {
        data: {
          stageRuns: [
            { ...BRAINSTORM_RUN },
            { id: 'sr-review-3', projectId: PROJECT_ID, stage: 'review', status: 'completed', attemptNo: 3, finishedAt: '2026-01-01T14:00:00Z', errorMessage: null, outcomeJson: { score: 91, verdict: 'approved', feedbackJson: {}, iterationCount: 3 }, trackId: null, publishTargetId: null },
          ],
          tracks: [],
          project: { mode: 'step-by-step', paused: false },
        },
        error: null,
      },
    });
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => screen.getByTestId('ctx-iterationCount'));
    expect(screen.getByTestId('ctx-iterationCount').textContent).toBe('3');
  });

  it('populates lastError from the latest failed run errorMessage', async () => {
    global.fetch = makeFetchMock({
      stagesResponse: {
        data: {
          stageRuns: [
            { id: 'sr-review-fail', projectId: PROJECT_ID, stage: 'review', status: 'failed', attemptNo: 1, finishedAt: '2026-01-01T14:00:00Z', errorMessage: 'AI quota exceeded', outcomeJson: null, trackId: null, publishTargetId: null },
          ],
          tracks: [],
          project: { mode: 'step-by-step', paused: false },
        },
        error: null,
      },
    });
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => screen.getByTestId('ctx-lastError'));
    expect(screen.getByTestId('ctx-lastError').textContent).toBe('AI quota exceeded');
  });
});

describe('ProjectContextProvider — issue #210: stageResultsByTrack', () => {
  it('exposes per-track draft buckets so two tracks do not collide', async () => {
    global.fetch = makeFetchMock({
      stagesResponse: {
        data: {
          stageRuns: [
            BRAINSTORM_RUN,
            {
              id: 'sr-draft-blog',
              projectId: PROJECT_ID,
              stage: 'draft',
              status: 'completed',
              attemptNo: 1,
              finishedAt: '2026-01-01T13:00:00Z',
              errorMessage: null,
              outcomeJson: { draftId: 'draft-blog' },
              payloadRef: { kind: 'content_draft', id: 'draft-blog' },
              trackId: 't-blog',
              publishTargetId: null,
            },
            {
              id: 'sr-draft-video',
              projectId: PROJECT_ID,
              stage: 'draft',
              status: 'completed',
              attemptNo: 1,
              finishedAt: '2026-01-01T13:05:00Z',
              errorMessage: null,
              outcomeJson: { draftId: 'draft-video' },
              payloadRef: { kind: 'content_draft', id: 'draft-video' },
              trackId: 't-video',
              publishTargetId: null,
            },
          ],
          tracks: [],
          project: { mode: 'step-by-step', paused: false },
        },
        error: null,
      },
    });
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => expect(screen.getByTestId('ctx-trackBlogDraftId').textContent).toBe('draft-blog'));
    expect(screen.getByTestId('ctx-trackVideoDraftId').textContent).toBe('draft-video');
  });
});

describe('ProjectContextProvider — slice 5: refetch', () => {
  it('refetch triggers new fetch calls', async () => {
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock;
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => screen.getByTestId('btn-refetch'));
    const callsBefore = fetchMock.mock.calls.length;
    act(() => { screen.getByTestId('btn-refetch').click(); });
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});

describe('ProjectContextProvider — slice 6: loading state', () => {
  it('shows loading indicator while fetches are pending', () => {
    // fetch never resolves in this test
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });
});

describe('ProjectContextProvider — slice 7: error state', () => {
  it('surfaces error when project fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => screen.getByTestId('ctx-error'));
    expect(screen.getByTestId('ctx-error')).toBeInTheDocument();
  });
});

describe('ProjectContextProvider — slice 8: session-local setters', () => {
  it('setPendingDrillIn updates pendingDrillIn in context', async () => {
    global.fetch = makeFetchMock();
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => screen.getByTestId('ctx-pendingDrillIn'));
    act(() => { screen.getByTestId('btn-set-pending-drill-in').click(); });
    expect(screen.getByTestId('ctx-pendingDrillIn').textContent).toBe('assets');
  });

  it('setReturnPromptOpen updates returnPromptOpen in context', async () => {
    global.fetch = makeFetchMock();
    render(<ProjectContextProvider projectId={PROJECT_ID}><ContextConsumer /></ProjectContextProvider>);
    await waitFor(() => screen.getByTestId('ctx-returnPromptOpen'));
    act(() => { screen.getByTestId('btn-set-return-prompt-open').click(); });
    expect(screen.getByTestId('ctx-returnPromptOpen').textContent).toBe('true');
  });
});

describe('useProjectContext — outside provider', () => {
  it('throws when used outside ProjectContextProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ContextConsumer />)).toThrow();
    spy.mockRestore();
  });
});

// ── Slice 14.4: StandaloneProjectContextProvider + signalStageComplete ─────────

import { StandaloneProjectContextProvider } from '../ProjectContextProvider';

function StandaloneConsumer({
  onSignal,
}: {
  onSignal?: (stage: string, result: Record<string, unknown>) => void;
}) {
  const { context, signalStageComplete, isLoading, error } = useProjectContext();
  if (isLoading) return <div data-testid="loading">loading</div>;
  if (error) return <div data-testid="ctx-error">{error.message}</div>;
  return (
    <div>
      <div data-testid="ctx-projectId">{context.projectId}</div>
      <div data-testid="ctx-channelId">{context.channelId ?? 'null'}</div>
      <div data-testid="ctx-mode">{context.mode ?? 'null'}</div>
      <div data-testid="ctx-brainstorm-ideaId">{context.stageResults.brainstorm?.ideaId ?? 'none'}</div>
      <button
        data-testid="btn-signal"
        onClick={() => {
          signalStageComplete('brainstorm', { ideaId: 'idea-42', ideaTitle: 'My Idea', ideaVerdict: 'viable', ideaCoreTension: 'tension' });
          onSignal?.('brainstorm', { ideaId: 'idea-42' });
        }}
      />
    </div>
  );
}

describe('StandaloneProjectContextProvider — Slice 14.4', () => {
  it('renders without server fetch (isLoading=false immediately)', () => {
    render(
      <StandaloneProjectContextProvider channelId="ch-standalone" projectId="proj-standalone">
        <StandaloneConsumer />
      </StandaloneProjectContextProvider>,
    );
    // Should NOT show loading
    expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('ctx-projectId').textContent).toBe('proj-standalone');
    expect(screen.getByTestId('ctx-channelId').textContent).toBe('ch-standalone');
  });

  it('seeds initialStageResults into context.stageResults', () => {
    const initialStageResults = {
      brainstorm: {
        ideaId: 'idea-seed',
        ideaTitle: 'Seeded Idea',
        ideaVerdict: 'viable',
        ideaCoreTension: 'tension',
        completedAt: '2026-01-01T00:00:00Z',
      },
    };
    render(
      <StandaloneProjectContextProvider initialStageResults={initialStageResults}>
        <StandaloneConsumer />
      </StandaloneProjectContextProvider>,
    );
    expect(screen.getByTestId('ctx-brainstorm-ideaId').textContent).toBe('idea-seed');
  });

  it('signalStageComplete updates context.stageResults.brainstorm', async () => {
    render(
      <StandaloneProjectContextProvider>
        <StandaloneConsumer />
      </StandaloneProjectContextProvider>,
    );
    expect(screen.getByTestId('ctx-brainstorm-ideaId').textContent).toBe('none');
    act(() => { screen.getByTestId('btn-signal').click(); });
    await waitFor(() =>
      expect(screen.getByTestId('ctx-brainstorm-ideaId').textContent).toBe('idea-42'),
    );
  });

  it('signalStageComplete calls onStageComplete callback', () => {
    const onStageComplete = vi.fn();
    render(
      <StandaloneProjectContextProvider onStageComplete={onStageComplete}>
        <StandaloneConsumer />
      </StandaloneProjectContextProvider>,
    );
    act(() => { screen.getByTestId('btn-signal').click(); });
    expect(onStageComplete).toHaveBeenCalledWith(
      'brainstorm',
      expect.objectContaining({ ideaId: 'idea-42' }),
    );
  });

  it('exposes mode from props', () => {
    render(
      <StandaloneProjectContextProvider mode="supervised">
        <StandaloneConsumer />
      </StandaloneProjectContextProvider>,
    );
    expect(screen.getByTestId('ctx-mode').textContent).toBe('supervised');
  });
});
