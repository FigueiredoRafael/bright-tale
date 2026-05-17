import { render, screen, waitFor } from '@testing-library/react';
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
        expect(screen.queryByTestId('production-engine')).not.toBeNull(),
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
