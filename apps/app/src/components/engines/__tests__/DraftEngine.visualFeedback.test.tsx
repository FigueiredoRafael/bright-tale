import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createActor } from 'xstate';
import React from 'react';
import { pipelineMachine } from '@/lib/pipeline/machine';
import { PipelineActorProvider } from '@/providers/PipelineActorProvider';
import { DraftEngine } from '../DraftEngine';
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types';
import {
  makeDraftRow,
  makeAutopilotConfig,
  makeBlogDraftJson,
  type DraftFormat,
} from './fixtures/draft';
import type { AutopilotConfig } from '@brighttale/shared';

vi.mock('@/hooks/use-analytics', () => ({ useAnalytics: () => ({ track: vi.fn() }) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

interface MountOpts {
  draftRow?: ReturnType<typeof makeDraftRow>;
  autopilotConfig?: AutopilotConfig | null;
  researchSessionId?: string | null;
}

function mountEngine(opts: MountOpts = {}) {
  const draftRow = opts.draftRow ?? makeDraftRow({});
  const autopilotConfig = opts.autopilotConfig ?? null;

  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'proj-1',
      channelId: 'ch-1',
      projectTitle: 'Test',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
      creditSettings: DEFAULT_CREDIT_SETTINGS,
    },
  }).start();
  actor.send({
    type: 'SETUP_COMPLETE',
    mode: 'step-by-step',
    autopilotConfig,
    templateId: null,
    startStage: 'draft',
  });
  // Pre-populate downstream context so the engine fetches the draft.
  if (opts.researchSessionId !== null) {
    actor.send({
      type: 'STAGE_PROGRESS',
      stage: 'research',
      partial: {
        researchSessionId: opts.researchSessionId ?? 'rs-1',
        approvedCardsCount: 5,
        researchLevel: 'medium',
      },
    });
  }
  actor.send({
    type: 'STAGE_PROGRESS',
    stage: 'brainstorm',
    partial: { ideaTitle: draftRow.title },
  });
  actor.send({
    type: 'STAGE_PROGRESS',
    stage: 'draft',
    partial: { draftId: draftRow.id },
  });

  return { actor, draftRow, ...render(
    <PipelineActorProvider value={actor}>
      <DraftEngine mode="generate" />
    </PipelineActorProvider>,
  ) };
}

function stubFetchForDraft(draftRow: ReturnType<typeof makeDraftRow>) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes(`/api/content-drafts/${draftRow.id}`)) {
        return {
          ok: true,
          json: async () => ({ data: draftRow, error: null }),
        } as Response;
      }
      if (u.includes('/api/research-sessions/')) {
        return {
          ok: true,
          json: async () => ({
            data: { id: 'rs-1', input_json: { topic: 'deep sea' } },
            error: null,
          }),
        } as Response;
      }
      if (u.includes('/api/personas')) {
        return { ok: true, json: async () => ({ data: [], error: null }) } as Response;
      }
      if (u.includes('/api/agents') || u.includes('/api/agent-prompts')) {
        return { ok: true, json: async () => ({ data: { agents: [] }, error: null }) } as Response;
      }
      return { ok: true, json: async () => ({ data: null, error: null }) } as Response;
    }),
  );
}

beforeEach(() => {
  stubFetchForDraft(makeDraftRow({}));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DraftEngine — visual feedback', () => {
  it('renders blog body via MarkdownPreview when format=blog and draft is done', async () => {
    const draftRow = makeDraftRow({ type: 'blog' });
    stubFetchForDraft(draftRow);
    mountEngine({ draftRow });

    // The "Preview" card mounts only after the restore effect completes
    await waitFor(() => {
      expect(screen.getByText(/^Preview$/)).toBeInTheDocument();
    });
    // Markdown body renders. The percentage is wrapped in <strong> so we match
    // sentences after the bold span separately.
    expect(
      screen.getByText(/species below 200m produce some form of light/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Why it evolved/i)).toBeInTheDocument();
  });

  it('renders video draft via VideoDraftViewer when format=video', async () => {
    const draftRow = makeDraftRow({ type: 'video' });
    stubFetchForDraft(draftRow);
    mountEngine({ draftRow });

    await waitFor(() => {
      expect(screen.getByText(/^Preview$/)).toBeInTheDocument();
    });
    // Hook content renders inside VideoDraftViewer
    expect(
      screen.getByText(/Imagine an ocean so dark that 76%/i),
    ).toBeInTheDocument();
    // Chapter titles render
    expect(screen.getByText(/Light as Currency in the Deep/i)).toBeInTheDocument();
    expect(
      screen.getByText(/The Independent Evolution Pathways/i),
    ).toBeInTheDocument();
  });

  it('renders shorts when format=shorts as readable text (hooks + scripts)', async () => {
    const draftRow = makeDraftRow({ type: 'shorts' });
    stubFetchForDraft(draftRow);
    mountEngine({ draftRow });

    await waitFor(() => {
      expect(screen.getByText(/^Preview$/)).toBeInTheDocument();
    });
    // Shorts are flattened to a "## Short N: hook" + script body
    expect(screen.getByText(/76% of deep-sea species GLOW/i)).toBeInTheDocument();
    expect(
      screen.getByText(/There is a universal language in the abyss/i),
    ).toBeInTheDocument();
  });

  it('renders podcast outline when format=podcast', async () => {
    const draftRow = makeDraftRow({ type: 'podcast' });
    stubFetchForDraft(draftRow);
    mountEngine({ draftRow });

    await waitFor(() => {
      expect(screen.getByText(/^Preview$/)).toBeInTheDocument();
    });
    // Podcast outline is markdown — assert the act headings render
    expect(screen.getByText(/Act 1: The 76%/i)).toBeInTheDocument();
    expect(
      screen.getByText(/two evolutionary pathways/i),
    ).toBeInTheDocument();
  });

  it('respects wizard wordCount: targetWords is hydrated from autopilotConfig.draft.wordCount', async () => {
    const config = makeAutopilotConfig({ format: 'blog', wordCount: 1500 });
    const draftRow = makeDraftRow({
      type: 'blog',
      core: null,
      draftJson: null,
      status: 'queued',
    });
    stubFetchForDraft(draftRow);
    mountEngine({ draftRow, autopilotConfig: config });

    // The sr-only span at DraftEngine.tsx:1330 exposes targetWords via data-testid.
    // If the wizard wordCount=1500 makes it through hydration, the span text is 1500.
    await waitFor(() => {
      const span = document.querySelector('[data-testid="draft-word-count"]');
      expect(span?.textContent).toBe('1500');
    });
  });

  it('respects wizard format: type is hydrated from autopilotConfig.draft.format', async () => {
    const config = makeAutopilotConfig({ format: 'video' });
    const draftRow = makeDraftRow({ type: 'video' });
    stubFetchForDraft(draftRow);
    mountEngine({ draftRow, autopilotConfig: config });

    // When the engine is hydrated with format='video' from the wizard AND the
    // draft row has a video draft_json, the VideoDraftViewer mounts. Asserting
    // chapter title appears proves the format-to-renderer wiring is intact.
    await waitFor(() => {
      expect(screen.getByText(/Light as Currency in the Deep/i)).toBeInTheDocument();
    });
  });

  it('renders canonical core (thesis + argument chain) when draft is in core-ready phase', async () => {
    const draftRow = makeDraftRow({
      type: 'blog',
      core: undefined, // default canonical core
      draftJson: null, // no produced content yet → phase=core-ready
    });
    stubFetchForDraft(draftRow);
    mountEngine({ draftRow });

    // Canonical core thesis should be visible
    await waitFor(() => {
      expect(
        screen.getByText(/evolution rewards visibility in pitch-dark environments/i),
      ).toBeInTheDocument();
    });
  });

  it('does not crash and shows the generation form when there is no draftId in context', () => {
    const actor = createActor(pipelineMachine, {
      input: {
        projectId: 'proj-1',
        channelId: 'ch-1',
        projectTitle: 'T',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
      },
    }).start();
    actor.send({
      type: 'SETUP_COMPLETE',
      mode: 'step-by-step',
      autopilotConfig: null,
      templateId: null,
      startStage: 'draft',
    });
    expect(() =>
      render(
        <PipelineActorProvider value={actor}>
          <DraftEngine mode="generate" />
        </PipelineActorProvider>,
      ),
    ).not.toThrow();
    expect(screen.queryByText(/^Preview$/)).toBeNull();
  });

  it('renders a different markdown body for blog when full_draft changes', async () => {
    const customBody = '# Custom heading\n\nThis is the unique sentinel body 123ABC.';
    const draftRow = makeDraftRow({
      type: 'blog',
      draftJson: makeBlogDraftJson({ body: customBody }),
    });
    stubFetchForDraft(draftRow);
    mountEngine({ draftRow });

    await waitFor(() => {
      expect(
        screen.getByText(/This is the unique sentinel body 123ABC/),
      ).toBeInTheDocument();
    });
  });
});

// Force DraftFormat reference so the import isn't pruned by tree-shake in strict mode.
const _formats: DraftFormat[] = ['blog', 'video', 'shorts', 'podcast'];
void _formats;
