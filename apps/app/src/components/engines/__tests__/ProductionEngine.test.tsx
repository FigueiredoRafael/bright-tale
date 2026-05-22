import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { ProjectContextProvider } from '@/components/pipeline/ProjectContextProvider';
import { ProductionEngine } from '../ProductionEngine';

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
beforeEach(() => { originalFetch = global.fetch; });
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
});
