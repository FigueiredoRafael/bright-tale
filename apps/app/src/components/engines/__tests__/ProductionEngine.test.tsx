import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { ProjectContextProvider } from '@/components/pipeline/ProjectContextProvider';
import { ProductionEngine } from '../ProductionEngine';
import type { ActiveStageRunResult } from '@/hooks/useActiveStageRun';

// ── useActiveStageRun mock — controlled per test ──────────────────────────────
// Default: no active run. Individual tests override with setActiveRun().
const INACTIVE_RUN: ActiveStageRunResult = {
  runId: null, status: null, startedAt: null, isActive: false, isFresh: false,
};
let activeRunResult: ActiveStageRunResult = INACTIVE_RUN;
function setActiveRun(result: Partial<ActiveStageRunResult>) {
  activeRunResult = { ...INACTIVE_RUN, ...result };
}
vi.mock('@/hooks/useActiveStageRun', () => ({
  useActiveStageRun: () => activeRunResult,
}));

// ── GenerationProgressFloat mock — thin stub so SSE setup is not needed ───────
vi.mock('@/components/generation/GenerationProgressFloat', () => ({
  GenerationProgressFloat: ({ open, sessionId, onComplete, onFailed, onClose }: {
    open: boolean; sessionId: string;
    onComplete?: () => void; onFailed?: (msg: string) => void; onClose: () => void;
  }) =>
    open ? (
      <div
        data-testid="generation-progress-float"
        data-session-id={sessionId}
        onClick={onClose}
      >
        <button data-testid="gpf-complete" onClick={onComplete}>complete</button>
        <button data-testid="gpf-failed" onClick={() => onFailed?.('err')}>fail</button>
      </div>
    ) : null,
}));

vi.mock('@/hooks/use-pipeline-tracker', () => ({
  usePipelineTracker: () => ({
    trackStarted: vi.fn(),
    trackCompleted: vi.fn(),
    trackFailed: vi.fn(),
    trackAction: vi.fn(),
  }),
}));

vi.mock('@/components/pipeline/PipelineAbortProvider', () => ({
  usePipelineAbort: () => null,
}));

vi.mock('@/components/billing/UpgradeProvider', () => ({
  useUpgrade: () => ({ handleMaybeCreditsError: vi.fn(() => false) }),
}));

vi.mock('@/components/production/VideoStyleSelector', () => ({
  default: () => <div data-testid="video-style-selector" />,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const PROJECT_ID = 'p1';
const CHANNEL_ID = 'c1';

const PROJECT_ROW = {
  id: PROJECT_ID,
  channel_id: CHANNEL_ID,
  title: 'Test Project',
  mode: 'step-by-step',
  autopilot_config_json: null,
  template_id: null,
  paused: false,
};

const EMPTY_STAGES_RESPONSE = {
  data: { stageRuns: [], tracks: [], project: { mode: 'step-by-step', paused: false } },
  error: null,
};

let originalFetch: typeof global.fetch;
beforeEach(() => {
  originalFetch = global.fetch;
  activeRunResult = INACTIVE_RUN; // reset between tests
});
afterEach(() => { global.fetch = originalFetch; vi.clearAllMocks(); });

function makeFetch() {
  return vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes('/stages')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_STAGES_RESPONSE) });
    }
    if ((url as string).includes('/api/agents')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { agents: [] }, error: null }) });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: PROJECT_ROW, error: null }),
    });
  });
}

function wrap(medium: 'blog' | 'video' | 'shorts' | 'podcast') {
  return (
    <ProjectContextProvider projectId={PROJECT_ID}>
      <ProductionEngine projectId={PROJECT_ID} trackId="t1" medium={medium} />
    </ProjectContextProvider>
  );
}

describe('ProductionEngine', () => {
  it.each(['blog', 'video', 'shorts', 'podcast'] as const)(
    'mounts %s controls',
    async (medium) => {
      global.fetch = makeFetch();
      render(wrap(medium));
      await waitFor(() =>
        expect(screen.queryByTestId('production-engine-root')).not.toBeNull(),
      );
    },
  );

  it('renders target_words for blog', async () => {
    global.fetch = makeFetch();
    render(wrap('blog'));
    await waitFor(() =>
      expect(screen.queryByTestId('control-target-words')).not.toBeNull(),
    );
  });

  it('renders target_duration + video_style for video', async () => {
    global.fetch = makeFetch();
    render(wrap('video'));
    await waitFor(() => {
      expect(screen.queryByTestId('control-target-duration')).not.toBeNull();
      expect(screen.queryByTestId('control-video-style')).not.toBeNull();
    });
  });
});

// ---- issue #210 / Slice 3 — derive-on-first-run ----

const TRACK_ID = 't-video';

const CANONICAL_RUN = {
  id: 'sr-canonical',
  projectId: PROJECT_ID,
  stage: 'canonical',
  status: 'completed',
  attemptNo: 1,
  finishedAt: '2026-05-22T10:00:00Z',
  errorMessage: null,
  outcomeJson: { draftId: 'canonical-draft-1' },
  payloadRef: { kind: 'content_draft', id: 'canonical-draft-1' },
  trackId: null,
  publishTargetId: null,
};

const PERTRACK_PRODUCTION_RUN = {
  id: 'sr-production-video',
  projectId: PROJECT_ID,
  stage: 'production',
  status: 'completed',
  attemptNo: 1,
  finishedAt: '2026-05-22T10:05:00Z',
  errorMessage: null,
  outcomeJson: { draftId: 'derived-video-draft' },
  payloadRef: { kind: 'content_draft', id: 'derived-video-draft' },
  trackId: TRACK_ID,
  publishTargetId: null,
};

function makeFetchWithStages(stageRuns: unknown[], deriveResponse?: { id: string; created: boolean }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes('/stages')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          data: { stageRuns, tracks: [], project: { mode: 'step-by-step', paused: false } },
          error: null,
        }),
      });
    }
    if (url.includes('/derive') && init?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          data: deriveResponse ?? { id: 'derived-video-draft', created: true },
          error: null,
        }),
      });
    }
    if (url.includes('/api/agents')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { agents: [] }, error: null }) });
    }
    if (url.match(/\/api\/content-drafts\/[^/]+$/)) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { id: 'derived-video-draft', draft_json: {} }, error: null }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: PROJECT_ROW, error: null }),
    });
  });
  return { fn, calls };
}

function wrapWithTrack(medium: 'blog' | 'video' | 'shorts' | 'podcast', trackId: string) {
  return (
    <ProjectContextProvider projectId={PROJECT_ID}>
      <ProductionEngine projectId={PROJECT_ID} trackId={trackId} medium={medium} />
    </ProjectContextProvider>
  );
}

describe('ProductionEngine — issue #210: derive-on-first-run', () => {
  it('POSTs /derive on mount when canonical exists and per-track draft is missing', async () => {
    const { fn, calls } = makeFetchWithStages([CANONICAL_RUN]);
    global.fetch = fn;
    render(wrapWithTrack('video', TRACK_ID));
    await waitFor(() => {
      const deriveCall = calls.find((c) =>
        c.url.includes('/api/content-drafts/canonical-draft-1/derive') && c.init?.method === 'POST'
      );
      expect(deriveCall).toBeTruthy();
    });
    const deriveCall = calls.find((c) =>
      c.url.includes('/api/content-drafts/canonical-draft-1/derive') && c.init?.method === 'POST'
    )!;
    const body = JSON.parse(deriveCall.init!.body as string);
    expect(body).toEqual({ trackId: TRACK_ID, medium: 'video' });
  });

  it('does NOT POST /derive when a per-track production draft already exists', async () => {
    const { fn, calls } = makeFetchWithStages([CANONICAL_RUN, PERTRACK_PRODUCTION_RUN]);
    global.fetch = fn;
    render(wrapWithTrack('video', TRACK_ID));
    // Wait for engine to settle (controls render)
    await waitFor(() => expect(screen.queryByTestId('production-engine-root')).not.toBeNull());
    // Give the effect a tick in case it would fire async
    await new Promise((r) => setTimeout(r, 30));
    const deriveCall = calls.find((c) => c.url.includes('/derive') && c.init?.method === 'POST');
    expect(deriveCall).toBeUndefined();
  });

  it('clicking Produce after derive uses the derived draft id (not the canonical id)', async () => {
    const { fn, calls } = makeFetchWithStages([CANONICAL_RUN], { id: 'derived-vid-xyz', created: true });
    global.fetch = fn;
    render(wrapWithTrack('video', TRACK_ID));
    // Wait for derive to land + Produce button to become enabled
    await waitFor(() => {
      const btn = screen.queryByTestId('production-action-produce') as HTMLButtonElement | null;
      expect(btn).not.toBeNull();
      expect(btn!.disabled).toBe(false);
    });
    const btn = screen.getByTestId('production-action-produce');
    fireEvent.click(btn);
    await waitFor(() => {
      const produceCall = calls.find(
        (c) => c.url.includes('/api/content-drafts/derived-vid-xyz/produce') && c.init?.method === 'POST',
      );
      expect(produceCall).toBeTruthy();
    });
    // Negative assertion: must NOT hit canonical id for /produce
    const wrongCall = calls.find(
      (c) => c.url.includes('/api/content-drafts/canonical-draft-1/produce') && c.init?.method === 'POST',
    );
    expect(wrongCall).toBeUndefined();
  });

  // Regression: a real user produced BLOG content into the VIDEO track because
  // the engine fell back to ctx.stageResults.draft.draftId (the legacy single-
  // track flat shape, which points at the canonical/blog draft) while the
  // /derive POST was still in flight. The Produce button must stay disabled
  // until the per-track derive resolves — never leak the canonical id to /produce.
  it('keeps Produce disabled while /derive is pending — never falls back to a stale flat-shape canonical id', async () => {
    // Stage_runs that would populate the LEGACY (flat) draft bucket with the
    // canonical/blog draft id — the very leak that caused the bug.
    const LEGACY_DRAFT_FROM_BLOG = {
      id: 'sr-draft-legacy-blog',
      projectId: PROJECT_ID,
      stage: 'draft',
      status: 'completed',
      attemptNo: 1,
      finishedAt: '2026-05-22T09:50:00Z',
      errorMessage: null,
      outcomeJson: { draftId: 'canonical-draft-1' },
      payloadRef: { kind: 'content_draft', id: 'canonical-draft-1' },
      trackId: null,
      publishTargetId: null,
    };
    // Hold the /derive response hostage so derivedDraftId stays null when the
    // user clicks Produce.
    let resolveDerive: (value: unknown) => void = () => {};
    const derivePending = new Promise((resolve) => { resolveDerive = resolve; });
    const calls: { url: string; init?: RequestInit }[] = [];
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('/stages')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            data: { stageRuns: [CANONICAL_RUN, LEGACY_DRAFT_FROM_BLOG], tracks: [], project: { mode: 'step-by-step', paused: false } },
            error: null,
          }),
        });
      }
      if (url.includes('/derive') && init?.method === 'POST') {
        return derivePending;
      }
      if (url.includes('/api/agents')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { agents: [] }, error: null }) });
      }
      if (url.match(/\/api\/content-drafts\/[^/]+$/)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { id: 'canonical-draft-1', draft_json: {} }, error: null }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: PROJECT_ROW, error: null }) });
    });

    render(wrapWithTrack('video', TRACK_ID));
    await waitFor(() => expect(screen.queryByTestId('production-engine-root')).not.toBeNull());
    // Let the derive POST fire and the flat-shape stageResults hydrate.
    await new Promise((r) => setTimeout(r, 30));

    const btn = screen.getByTestId('production-action-produce') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    // Even if the user attempted to click (some users do), no /produce call
    // should leak to the canonical/flat-shape id.
    fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 30));
    const leakedProduce = calls.find(
      (c) => c.url.includes('/api/content-drafts/canonical-draft-1/produce') && c.init?.method === 'POST',
    );
    expect(leakedProduce).toBeUndefined();

    // Unblock derive so the test cleans up.
    resolveDerive({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'derived-vid-xyz', created: true }, error: null }),
    });
  });
});

// ── issue #242 Module 2: progress modal driven by useActiveStageRun ──────────
//
// Pattern: mock useActiveStageRun at the module level (see top of file),
// control its return value via setActiveRun(), assert GenerationProgressFloat
// mounts/unmounts. No SSE plumbing needed — GenerationProgressFloat is also
// mocked to a thin stub.

describe('ProductionEngine — issue #242: progress modal driven by stage_run status', () => {
  // Scenario (a): modal mounts when useActiveStageRun returns isActive=true (queued)
  it('mounts GenerationProgressFloat when a fresh queued run is detected', async () => {
    const { fn } = makeFetchWithStages([CANONICAL_RUN, PERTRACK_PRODUCTION_RUN]);
    global.fetch = fn;

    // Set active run BEFORE render so the engine sees it immediately.
    setActiveRun({
      runId: 'sr-restart-1',
      status: 'queued',
      startedAt: '2026-05-26T10:00:00Z',
      isActive: true,
      isFresh: true,
    });

    render(wrapWithTrack('video', TRACK_ID));

    await waitFor(() =>
      expect(screen.queryByTestId('generation-progress-float')).not.toBeNull(),
    );
    expect(screen.getByTestId('generation-progress-float').dataset.sessionId).toBe('derived-video-draft');
  });

  // Scenario (b): modal stays mounted while status='running'
  it('keeps GenerationProgressFloat mounted while status transitions to running', async () => {
    const { fn } = makeFetchWithStages([CANONICAL_RUN, PERTRACK_PRODUCTION_RUN]);
    global.fetch = fn;

    setActiveRun({
      runId: 'sr-run-1',
      status: 'running',
      startedAt: '2026-05-26T10:00:00Z',
      isActive: true,
      isFresh: false,
    });

    render(wrapWithTrack('video', TRACK_ID));

    await waitFor(() =>
      expect(screen.queryByTestId('generation-progress-float')).not.toBeNull(),
    );
  });

  // Scenario (c): modal unmounts when status flips to 'completed'
  it('unmounts GenerationProgressFloat when stage_run reaches completed status', async () => {
    const { fn } = makeFetchWithStages([CANONICAL_RUN, PERTRACK_PRODUCTION_RUN]);
    global.fetch = fn;

    // Start with active run
    setActiveRun({
      runId: 'sr-run-1',
      status: 'running',
      startedAt: '2026-05-26T10:00:00Z',
      isActive: true,
      isFresh: false,
    });

    const { rerender } = render(wrapWithTrack('video', TRACK_ID));

    await waitFor(() =>
      expect(screen.queryByTestId('generation-progress-float')).not.toBeNull(),
    );

    // Transition to completed
    act(() => {
      setActiveRun({ runId: 'sr-run-1', status: 'completed', isActive: false, isFresh: false });
    });
    rerender(wrapWithTrack('video', TRACK_ID));

    await waitFor(() =>
      expect(screen.queryByTestId('generation-progress-float')).toBeNull(),
    );
  });

  // Scenario (d): modal does NOT mount when no active run exists
  it('does not mount GenerationProgressFloat when no active run exists', async () => {
    const { fn } = makeFetchWithStages([CANONICAL_RUN, PERTRACK_PRODUCTION_RUN]);
    global.fetch = fn;
    // activeRunResult is INACTIVE_RUN by default (reset in beforeEach)

    render(wrapWithTrack('video', TRACK_ID));
    await waitFor(() => expect(screen.queryByTestId('production-engine-root')).not.toBeNull());

    expect(screen.queryByTestId('generation-progress-float')).toBeNull();
  });
});
