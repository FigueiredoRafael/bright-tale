import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { StandaloneProjectContextProvider } from '@/components/pipeline/ProjectContextProvider';
import { PreviewEngine } from '../PreviewEngine';
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types';
import { makePreviewDraftRow, makePreviewAssets } from './fixtures/previewPublish';

vi.mock('@/hooks/use-analytics', () => ({ useAnalytics: () => ({ track: vi.fn() }) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/components/pipeline/PipelineAbortProvider', () => ({
  usePipelineAbort: () => null,
}));
vi.mock('@/hooks/use-auto-pilot-trigger', () => ({
  useAutoPilotTrigger: vi.fn(),
}));

interface MountOpts {
  draftRow?: ReturnType<typeof makePreviewDraftRow>;
  assets?: ReturnType<typeof makePreviewAssets>;
  loadError?: boolean;
}

function stubFetch(opts: MountOpts) {
  const draft = opts.draftRow ?? makePreviewDraftRow();
  const assets = opts.assets ?? makePreviewAssets();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (opts.loadError && u.includes(`/api/content-drafts/${draft.id}`) && !u.includes('/feedback')) {
        return { ok: false, json: async () => ({ data: null, error: { message: 'boom' } }) } as Response;
      }
      if (u.includes(`/api/content-drafts/${draft.id}/feedback`)) {
        return { ok: true, json: async () => ({ data: null, error: null }) } as Response;
      }
      if (u.includes(`/api/content-drafts/${draft.id}`)) {
        return { ok: true, json: async () => ({ data: draft, error: null }) } as Response;
      }
      if (u.includes('/api/assets?content_id=')) {
        return { ok: true, json: async () => ({ data: assets, error: null }) } as Response;
      }
      if (u.includes('/api/agents') || u.includes('/api/agent-prompts')) {
        return { ok: true, json: async () => ({ data: { agents: [] }, error: null }) } as Response;
      }
      return { ok: true, json: async () => ({ data: null, error: null }) } as Response;
    }),
  );
}

function mountEngine(opts: MountOpts = {}) {
  const draft = opts.draftRow ?? makePreviewDraftRow();
  stubFetch({ ...opts, draftRow: draft });

  return render(
    <StandaloneProjectContextProvider
      projectId="proj-1"
      channelId="ch-1"
      mode="step-by-step"
      autopilotConfig={null}
      initialStageResults={{ draft: { draftId: draft.id, draftTitle: draft.title, draftContent: '', completedAt: new Date().toISOString() } }}
      pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
      creditSettings={DEFAULT_CREDIT_SETTINGS}
    >
      <PreviewEngine />
    </StandaloneProjectContextProvider>,
  );
}

beforeEach(() => {
  stubFetch({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PreviewEngine — visual feedback', () => {
  it('renders the Live Preview heading + body content (markdown converted)', async () => {
    mountEngine();
    await waitFor(() => {
      expect(screen.getByText(/Live Preview/i)).toBeInTheDocument();
    });
    // The body markdown is converted to HTML; assert a substring of the body
    // appears somewhere on the page.
    await waitFor(() => {
      // The "Why it evolved" heading is part of the draft body
      const matches = screen.getAllByText(/Why it evolved/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it('renders Taxonomy card with Categories + Tags labels', async () => {
    mountEngine();
    await waitFor(() => {
      expect(screen.getByText(/Taxonomy/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/^Categories$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Tags$/i)).toBeInTheDocument();
  });

  it('renders Images card with assignment slots', async () => {
    mountEngine();
    await waitFor(() => {
      // The Images card heading is rendered as "Images" inside CardTitle
      expect(screen.getByText(/^Images$/i)).toBeInTheDocument();
    });
  });

  it('renders the "Approve & Publish" action button', async () => {
    mountEngine();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Approve & Publish/i }),
      ).toBeInTheDocument();
    });
  });

  it('shows error card when draft fetch fails', async () => {
    mountEngine({ loadError: true });
    await waitFor(() => {
      expect(screen.getByText(/Error Loading Preview/i)).toBeInTheDocument();
    });
  });

  it('shows the loading state while the draft fetch is in flight', () => {
    // Stub fetch with a pending promise so the engine stays in loading
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));
    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="step-by-step"
        autopilotConfig={null}
        initialStageResults={{ draft: { draftId: 'd1', draftTitle: 'T', draftContent: '', completedAt: new Date().toISOString() } }}
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
      >
        <PreviewEngine />
      </StandaloneProjectContextProvider>,
    );
    expect(screen.getByText(/Loading preview data/i)).toBeInTheDocument();
  });
});
