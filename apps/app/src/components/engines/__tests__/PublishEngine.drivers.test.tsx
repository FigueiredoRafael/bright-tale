import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { ProjectContextProvider } from '@/components/pipeline/ProjectContextProvider';
import { PublishEngine } from '../PublishEngine';

vi.mock('@/lib/api/publishTargets', () => ({
  fetchPublishTarget: vi.fn(async (id: string) => ({
    id,
    channelId: 'c1',
    type: id.startsWith('wp') ? 'wordpress'
      : id.startsWith('yt') ? 'youtube'
      : id.startsWith('sp') ? 'spotify'
      : id.startsWith('ap') ? 'apple_podcasts'
      : 'rss',
    configJson: {},
  })),
}));

vi.mock('@/hooks/use-auto-pilot-trigger', () => ({
  useAutoPilotTrigger: vi.fn(),
}));

vi.mock('@/hooks/use-pipeline-tracker', () => ({
  usePipelineTracker: () => ({ trackStarted: vi.fn(), trackCompleted: vi.fn(), trackFailed: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// Keep the real driver forms so their data-testid values are rendered.
// Only mock heavy sub-components that would need extra providers.
vi.mock('@/components/engines/ContextBanner', () => ({
  ContextBanner: () => null,
}));

vi.mock('@/components/publish/PublishProgress', () => ({
  PublishProgress: () => <div data-testid="publish-progress" />,
}));

// Mock WP-specific sub-components that need real WP config
vi.mock('@/components/preview/PublishPanel', () => ({
  PublishPanel: () => <div data-testid="publish-panel" />,
}));

vi.mock('@/components/engines/publish-drivers/WordPressPublishForm', () => ({
  WordPressPublishForm: () => <section data-testid="driver-wordpress" />,
}));

vi.mock('@/components/engines/publish-drivers/YouTubePublishForm', () => ({
  YouTubePublishForm: () => <section data-testid="driver-youtube" />,
}));

vi.mock('@/components/engines/publish-drivers/SpotifyPublishForm', () => ({
  SpotifyPublishForm: () => <section data-testid="driver-spotify" />,
}));

vi.mock('@/components/engines/publish-drivers/ApplePodcastsPublishForm', () => ({
  ApplePodcastsPublishForm: () => <section data-testid="driver-apple-podcasts" />,
}));

vi.mock('@/components/engines/publish-drivers/RssPublishForm', () => ({
  RssPublishForm: () => <section data-testid="driver-rss" />,
}));

// ── Fetch mock ────────────────────────────────────────────────────────────────

const PROJECT_ROW = {
  id: 'p1',
  channel_id: 'c1',
  title: 'T',
  mode: 'step-by-step',
  autopilot_config_json: null,
  template_id: null,
  paused: false,
  pipeline_state_json: null,
};

const STAGES_RESPONSE = {
  data: { stageRuns: [], tracks: [], project: { mode: 'step-by-step', paused: false } },
  error: null,
};

let originalFetch: typeof global.fetch;

beforeEach(() => {
  originalFetch = global.fetch;
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes('/stages')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(STAGES_RESPONSE) });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: PROJECT_ROW, error: null }),
    });
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PublishEngine driver dispatch', () => {
  it.each([
    ['wp-1', 'driver-wordpress'],
    ['yt-1', 'driver-youtube'],
    ['sp-1', 'driver-spotify'],
    ['ap-1', 'driver-apple-podcasts'],
    ['rss-1', 'driver-rss'],
  ])('mounts the right driver for publishTargetId=%s', async (publishTargetId, testId) => {
    render(
      <ProjectContextProvider projectId="p1">
        <PublishEngine
          draft={{ id: 'd1', title: 'x', status: 'ready' }}
          publishTargetId={publishTargetId}
        />
      </ProjectContextProvider>,
    );
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
  });
});
