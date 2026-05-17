import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { ProjectContextProvider } from '@/components/pipeline/ProjectContextProvider';
import { CanonicalEngine } from '../CanonicalEngine';

vi.mock('@/hooks/use-auto-pilot-trigger', () => ({
  useAutoPilotTrigger: vi.fn(),
}));

vi.mock('@/components/pipeline/PipelineAbortProvider', () => ({
  usePipelineAbort: () => null,
}));

vi.mock('@/hooks/use-pipeline-tracker', () => ({
  usePipelineTracker: () => ({
    trackStarted: vi.fn(),
    trackCompleted: vi.fn(),
    trackFailed: vi.fn(),
    trackAction: vi.fn(),
  }),
}));

vi.mock('@/components/billing/UpgradeProvider', () => ({
  useUpgrade: () => ({ handleMaybeCreditsError: vi.fn(() => false) }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}));

vi.mock('../PersonaCarousel', () => ({
  PersonaCarousel: () => <div data-testid="persona-carousel" />,
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

describe('CanonicalEngine', () => {
  it('mounts without crashing', () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
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
    const { container } = render(
      <ProjectContextProvider projectId={PROJECT_ID}>
        <CanonicalEngine projectId={PROJECT_ID} />
      </ProjectContextProvider>,
    );
    expect(container).toBeTruthy();
  });
});
