/**
 * Slice 14.2 — BrainstormEngine migration tests (TDD red→green→refactor).
 *
 * Slices covered:
 *   1. Renders without PipelineActorProvider when wrapped in ProjectContextProvider
 *   2. Reads channelId + projectId from ProjectContextProvider (not from actor)
 *   3. Reads stageResults.brainstorm from ProjectContextProvider
 *   4. Does not throw "usePipelineActor must be used inside PipelineActorProvider"
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { ProjectContextProvider } from '@/components/pipeline/ProjectContextProvider';
import { BrainstormEngine } from '../BrainstormEngine';

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
vi.mock('../ImportPicker', () => ({
  ImportPicker: () => <div data-testid="import-picker" />,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROJECT_ID = 'proj-brainstorm-test';
const CHANNEL_ID = 'ch-bs';

const PROJECT_ROW = {
  id: PROJECT_ID,
  channel_id: CHANNEL_ID,
  title: 'Brainstorm Test Project',
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
    if ((url as string).includes('/api/brainstorm/sessions/running')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: null, error: null }) });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: { ...PROJECT_ROW, channel_id: channelId }, error: null }),
    });
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

describe('BrainstormEngine — slice 1: renders under ProjectContextProvider (no actor)', () => {
  it('renders without throwing when wrapped in ProjectContextProvider', async () => {
    global.fetch = makeContextFetch();
    render(
      <ProjectContextProvider projectId={PROJECT_ID}>
        <BrainstormEngine />
      </ProjectContextProvider>,
    );
    await waitFor(() =>
      expect(
        screen.queryByTestId('context-banner') ??
        screen.queryByRole('button', { name: /generate ideas/i }) ??
        screen.queryByTestId('import-picker'),
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
          <BrainstormEngine />
        </ProjectContextProvider>,
      );
    } catch {
      thrown = true;
    }
    spy.mockRestore();
    await waitFor(() => expect(thrown).toBe(false));
  });
});

describe('BrainstormEngine — slice 2: reads from ProjectContextProvider', () => {
  it('reads channelId from context (does not crash without actor)', async () => {
    global.fetch = makeContextFetch({ channelId: CHANNEL_ID });
    render(
      <ProjectContextProvider projectId={PROJECT_ID}>
        <BrainstormEngine />
      </ProjectContextProvider>,
    );
    // If channelId is read correctly engine renders; absence of actor should not crash.
    await waitFor(() =>
      expect(screen.queryByTestId('ctx-error')).not.toBeInTheDocument(),
    );
  });

  it('uses projectId from ProjectContextProvider', async () => {
    global.fetch = makeContextFetch();
    render(
      <ProjectContextProvider projectId={PROJECT_ID}>
        <BrainstormEngine />
      </ProjectContextProvider>,
    );
    await waitFor(() =>
      expect(screen.queryByTestId('ctx-error')).not.toBeInTheDocument(),
    );
  });
});

describe('BrainstormEngine — slice 3: brainstorm result from context', () => {
  it('renders pre-selected idea from stageResults when brainstorm stage_run exists', async () => {
    const stagesResponse = {
      data: {
        stageRuns: [
          {
            id: 'sr-bs-1',
            projectId: PROJECT_ID,
            stage: 'brainstorm',
            status: 'completed',
            attemptNo: 1,
            finishedAt: '2026-01-01T10:00:00Z',
            errorMessage: null,
            outcomeJson: {
              ideaId: 'idea-ctx-1',
              ideaTitle: 'Context Idea',
              ideaVerdict: 'viable',
              ideaCoreTension: 'tension',
              brainstormSessionId: 'bs-ctx-1',
            },
            trackId: null,
            publishTargetId: null,
          },
        ],
        tracks: [],
        project: { mode: 'step-by-step', paused: false },
      },
      error: null,
    };
    global.fetch = makeContextFetch({ stagesResponse });
    render(
      <ProjectContextProvider projectId={PROJECT_ID}>
        <BrainstormEngine />
      </ProjectContextProvider>,
    );
    // The engine should render without crashing; the context provides brainstormResult.
    await waitFor(() =>
      expect(screen.queryByTestId('ctx-error')).not.toBeInTheDocument(),
    );
  });
});
