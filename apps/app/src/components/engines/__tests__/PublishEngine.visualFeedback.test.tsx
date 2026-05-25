import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ProjectContextProvider } from '@/components/pipeline/ProjectContextProvider';
import { PublishEngine } from '../PublishEngine';
import {
  makePublishedDraftRow,
  makeUnpublishedDraftRow,
} from './fixtures/previewPublish';

vi.mock('@/hooks/use-analytics', () => ({ useAnalytics: () => ({ track: vi.fn() }) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/hooks/use-auto-pilot-trigger', () => ({
  useAutoPilotTrigger: vi.fn(),
}));
vi.mock('@/hooks/use-pipeline-tracker', () => ({
  usePipelineTracker: () => ({ trackStarted: vi.fn(), trackCompleted: vi.fn(), trackFailed: vi.fn() }),
}));
vi.mock('@/components/engines/ContextBanner', () => ({
  ContextBanner: () => null,
}));

interface MountOpts {
  draft?: ReturnType<typeof makeUnpublishedDraftRow> | ReturnType<typeof makePublishedDraftRow>;
  channelId?: string | null;
  wpConfigs?: Array<Record<string, unknown>>;
}

function stubFetch(opts: MountOpts = {}) {
  const channelId = opts.channelId === undefined ? 'ch-1' : opts.channelId;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      // ProjectContextProvider routes
      if (u.match(/\/api\/projects\/proj-1\/stages/)) {
        return { ok: true, json: async () => ({
          data: { stageRuns: [], tracks: [], project: { mode: 'step-by-step', paused: false } },
          error: null,
        }) } as Response;
      }
      if (u.match(/\/api\/projects\/proj-1$/)) {
        return { ok: true, json: async () => ({
          data: {
            id: 'proj-1',
            channel_id: channelId,
            title: 'Test',
            mode: 'step-by-step',
            autopilot_config_json: null,
            template_id: null,
            paused: false,
            pipeline_state_json: null,
          },
          error: null,
        }) } as Response;
      }
      if (u.includes('/api/wordpress-configs')) {
        const configs = opts.wpConfigs ?? [
          { id: 'wp-1', channel_id: 'ch-1', site_url: 'https://blog.example.com', username: 'editor', is_active: true },
        ];
        return { ok: true, json: async () => ({ data: { configs }, error: null }) } as Response;
      }
      if (u.includes('/api/agents') || u.includes('/api/agent-prompts')) {
        return { ok: true, json: async () => ({ data: { agents: [] }, error: null }) } as Response;
      }
      return { ok: true, json: async () => ({ data: null, error: null }) } as Response;
    }),
  );
}

function mountEngine(opts: MountOpts = {}) {
  const draft = opts.draft ?? makeUnpublishedDraftRow();
  stubFetch(opts);

  return { draft, ...render(
    <ProjectContextProvider projectId="proj-1">
      <PublishEngine draft={draft as unknown as Parameters<typeof PublishEngine>[0]['draft']} />
    </ProjectContextProvider>,
  ) };
}

beforeEach(() => {
  stubFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PublishEngine — visual feedback', () => {
  it('renders WordPress Publishing card and Publish button when draft is approved (manual_advance gate)', async () => {
    mountEngine({ draft: makeUnpublishedDraftRow() });

    // The CONTEXT.md contract: Publish ALWAYS requires explicit user action.
    // The Publish button must be visible — no auto-publish in step-by-step mode.
    await waitFor(() => {
      expect(screen.getByText(/WordPress Publishing/i)).toBeInTheDocument();
    });
    // Wait for wpConfig to load (gates the publish button)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Publish as draft/i }),
      ).toBeInTheDocument();
    });
  });

  it('renders publishing-mode toggles (Draft / Publish / Schedule) when draft is approved', async () => {
    mountEngine({ draft: makeUnpublishedDraftRow() });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Draft$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Publish$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Schedule$/i })).toBeInTheDocument();
    });
  });

  it('renders "Published!" success banner + View post link + WP post ID when status=published', async () => {
    mountEngine({
      draft: makePublishedDraftRow({
        status: 'published',
        publishedUrl: 'https://brightcurios.com/why-deep-sea-creatures-glow',
        wpPostId: 42,
      }),
    });

    await waitFor(() => {
      expect(screen.getByText(/Published!/i)).toBeInTheDocument();
    });
    const link = screen.getByRole('link', { name: /View post/i });
    expect(link).toHaveAttribute(
      'href',
      'https://brightcurios.com/why-deep-sea-creatures-glow',
    );
    expect(screen.getByText(/\(WP #42\)/)).toBeInTheDocument();
  });

  it('shows "Draft must be approved" message when draft status is not approved/published', async () => {
    const draft = { ...makeUnpublishedDraftRow(), status: 'in_review' };
    mountEngine({ draft });

    await waitFor(() => {
      expect(screen.getByText(/Draft must be approved before publishing/i)).toBeInTheDocument();
    });
  });

  it('disables Publish button when there is no WordPress config for the channel', async () => {
    mountEngine({ draft: makeUnpublishedDraftRow(), wpConfigs: [] });

    await waitFor(() => {
      expect(
        screen.getByText(/No WordPress configured for this channel/i),
      ).toBeInTheDocument();
    });
    const publishButton = screen.queryByRole('button', { name: /Publish as draft/i });
    if (publishButton) {
      expect(publishButton).toBeDisabled();
    }
  });

  it('shows channel-missing fallback when channelId is null', () => {
    mountEngine({ draft: makeUnpublishedDraftRow(), channelId: null });
    expect(
      screen.getByText(/Channel ID is missing. Cannot proceed with publishing/i),
    ).toBeInTheDocument();
  });
});
