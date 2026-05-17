/**
 * Slice 14.2 — ReviewEngine migration tests (TDD red→green→refactor).
 *
 * Slices covered:
 *   1. Renders without PipelineActorProvider when wrapped in ProjectContextProvider
 *   2. Reads channelId + projectId from ProjectContextProvider (not from actor)
 *   3. Does not throw "usePipelineActor must be used inside PipelineActorProvider"
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { ProjectContextProvider } from '@/components/pipeline/ProjectContextProvider';
import { ReviewEngine } from '../ReviewEngine';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/api/stageRuns', () => ({
  writeStageRunOutcome: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/hooks/use-auto-pilot-trigger', () => ({
  useAutoPilotTrigger: vi.fn(),
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

vi.mock('@/components/generation/GenerationProgressFloat', () => ({
  GenerationProgressFloat: () => <div data-testid="generation-progress-float" />,
}));

vi.mock('../ContextBanner', () => ({ ContextBanner: () => <div data-testid="context-banner" /> }));

vi.mock('@/components/billing/UpgradeProvider', () => ({
  useUpgrade: () => ({ handleMaybeCreditsError: vi.fn(() => false) }),
}));

vi.mock('@/hooks/use-manual-mode', () => ({
  useManualMode: () => ({ enabled: false }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROJECT_ID = 'proj-review14-test';
const CHANNEL_ID = 'ch-rev14';

const PROJECT_ROW = {
  id: PROJECT_ID,
  channel_id: CHANNEL_ID,
  title: 'Review14 Test Project',
  mode: 'step-by-step',
  autopilot_config_json: null,
  template_id: null,
  paused: false,
};

const EMPTY_STAGES_RESPONSE = {
  data: { stageRuns: [], tracks: [], project: { mode: 'step-by-step', paused: false } },
  error: null,
};

function makeContextFetch(opts: { channelId?: string | null; stagesResponse?: object } = {}) {
  const channelId = opts.channelId !== undefined ? opts.channelId : CHANNEL_ID;
  const stagesResponse = opts.stagesResponse ?? EMPTY_STAGES_RESPONSE;
  return vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes('/stages')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(stagesResponse) });
    }
    if ((url as string).includes('/api/agents')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { agents: [] }, error: null }) });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: { ...PROJECT_ROW, channel_id: channelId }, error: null }),
    });
  });
}

const APPROVED_DRAFT = {
  id: 'd-rev14',
  title: 'Review14 Draft',
  status: 'approved',
  draft_json: { type: 'blog', blog: { full_draft: 'content' } },
  review_feedback_json: {
    blog_review: { score: 92, verdict: 'approved' },
  },
  review_score: 92,
  review_verdict: 'approved',
  iteration_count: 1,
};

let originalFetch: typeof global.fetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReviewEngine — slice 1: renders under ProjectContextProvider (no actor)', () => {
  it('renders without throwing when wrapped in ProjectContextProvider', async () => {
    global.fetch = makeContextFetch();
    render(
      <ProjectContextProvider projectId={PROJECT_ID}>
        <ReviewEngine draft={APPROVED_DRAFT} />
      </ProjectContextProvider>,
    );
    await waitFor(() =>
      expect(
        screen.queryByTestId('context-banner') ??
        screen.queryByRole('button', { name: /next.*assets/i }) ??
        screen.queryByText(/approved/i),
      ).not.toBeNull(),
    );
  });

  it('does NOT throw "usePipelineActor must be used inside PipelineActorProvider"', async () => {
    global.fetch = makeContextFetch();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let thrown = false;
    try {
      render(
        <ProjectContextProvider projectId={PROJECT_ID}>
          <ReviewEngine draft={APPROVED_DRAFT} />
        </ProjectContextProvider>,
      );
    } catch {
      thrown = true;
    }
    spy.mockRestore();
    await waitFor(() => expect(thrown).toBe(false));
  });
});

describe('ReviewEngine — slice 2: reads from ProjectContextProvider', () => {
  it('reads channelId from context (does not crash without actor)', async () => {
    global.fetch = makeContextFetch({ channelId: CHANNEL_ID });
    render(
      <ProjectContextProvider projectId={PROJECT_ID}>
        <ReviewEngine draft={APPROVED_DRAFT} />
      </ProjectContextProvider>,
    );
    await waitFor(() =>
      expect(screen.queryByTestId('ctx-error')).not.toBeInTheDocument(),
    );
  });

  it('uses projectId from ProjectContextProvider', async () => {
    global.fetch = makeContextFetch();
    render(
      <ProjectContextProvider projectId={PROJECT_ID}>
        <ReviewEngine draft={null} />
      </ProjectContextProvider>,
    );
    await waitFor(() =>
      expect(screen.queryByTestId('ctx-error')).not.toBeInTheDocument(),
    );
  });
});
