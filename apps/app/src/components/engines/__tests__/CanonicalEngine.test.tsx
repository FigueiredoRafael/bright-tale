import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CanonicalEngine } from '../CanonicalEngine';

vi.mock('@/hooks/usePipelineActor', () => ({
  usePipelineActor: () => ({
    send: vi.fn(),
    getSnapshot: vi.fn(() => ({
      context: {
        channelId: 'c1',
        projectId: 'p1',
        stageResults: { brainstorm: {}, research: {} },
        creditSettings: {},
        autopilotConfig: { draft: { agentSlug: null, modelKey: null } },
        mode: 'overview',
        paused: false,
      },
    })),
  }),
}));

vi.mock('@xstate/react', () => ({
  useSelector: (actor: unknown, selector: (s: unknown) => unknown) =>
    selector({
      context: {
        channelId: 'c1',
        projectId: 'p1',
        stageResults: { brainstorm: {}, research: {} },
        creditSettings: {},
        autopilotConfig: { draft: { agentSlug: null, modelKey: null } },
        mode: 'overview',
        paused: false,
      },
    }),
}));

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

describe('CanonicalEngine', () => {
  it('mounts without crashing', () => {
    const { container } = render(<CanonicalEngine projectId="p1" />);
    expect(container).toBeTruthy();
  });
});
