import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createActor } from 'xstate';
import React from 'react';
import { pipelineMachine } from '@/lib/pipeline/machine';
import { PipelineActorProvider } from '@/providers/PipelineActorProvider';
import { AssetsEngine } from '../AssetsEngine';
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types';
import {
  makeAssetsDraftRow,
  makeAssetSlots,
  makeExistingAssets,
  makeVisualDirection,
} from './fixtures/assets';
import { makeAutopilotConfig } from './fixtures/draft';

vi.mock('@/hooks/use-analytics', () => ({ useAnalytics: () => ({ track: vi.fn() }) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

interface MountOpts {
  draft?: ReturnType<typeof makeAssetsDraftRow>;
  existingAssets?: ReturnType<typeof makeExistingAssets>;
  assetsMode?: 'skip' | 'briefs_only' | 'auto_generate';
}

function stubFetch(opts: MountOpts) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/api/assets?content_id=')) {
        return {
          ok: true,
          json: async () => ({ data: opts.existingAssets ?? [], error: null }),
        } as Response;
      }
      if (u.includes('/asset-prompts')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              sections: (opts.draft?.draft_json?.asset_briefs?.slots ?? []).map((s) => ({
                slot: s.slot,
                section_title: s.sectionTitle,
              })),
            },
            error: null,
          }),
        } as Response;
      }
      if (u.includes('/api/agents') || u.includes('/api/agent-prompts')) {
        return { ok: true, json: async () => ({ data: { agents: [] }, error: null }) } as Response;
      }
      return { ok: true, json: async () => ({ data: null, error: null }) } as Response;
    }),
  );
}

function mountEngine(opts: MountOpts = {}) {
  const draft = opts.draft ?? makeAssetsDraftRow({});
  stubFetch({ ...opts, draft });

  let config = null;
  if (opts.assetsMode) {
    config = makeAutopilotConfig({});
    config.assets.mode = opts.assetsMode;
  }

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
    autopilotConfig: config,
    templateId: null,
    startStage: 'assets',
  });
  actor.send({
    type: 'STAGE_PROGRESS',
    stage: 'draft',
    partial: { draftId: draft.id, draftTitle: draft.title },
  });

  return { actor, draft, ...render(
    <PipelineActorProvider value={actor}>
      <AssetsEngine mode="generate" draft={draft as unknown as Record<string, unknown>} />
    </PipelineActorProvider>,
  ) };
}

beforeEach(() => {
  stubFetch({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AssetsEngine — visual feedback', () => {
  it('renders one slot card per brief with sectionTitle + slot badge', async () => {
    const slots = makeAssetSlots();
    const draft = makeAssetsDraftRow({ slots });
    mountEngine({ draft });

    // The engine renders "Loading assets..." while fetchAssets runs.
    // Wait for the slot cards to appear after loading completes.
    for (const s of slots) {
      await waitFor(() => {
        expect(screen.getAllByText(s.sectionTitle).length).toBeGreaterThan(0);
      });
    }
    expect(screen.getByText(/^featured$/i)).toBeInTheDocument();
  });

  it('renders existing assets (image previews + alt text) when /api/assets returns items', async () => {
    const slots = makeAssetSlots();
    const draft = makeAssetsDraftRow({ slots });
    const existing = makeExistingAssets(slots);
    mountEngine({ draft, existingAssets: existing });

    // Wait for the fetchAssets effect to populate existingAssets and the
    // BriefImageSlotCard previews to render
    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      expect(imgs.length).toBeGreaterThanOrEqual(slots.length);
    });
    // Each image should use the asset url
    const imgs = screen.getAllByRole('img') as HTMLImageElement[];
    const urls = imgs.map((i) => i.src);
    for (const a of existing) {
      expect(urls).toContain(a.source_url);
    }
  });

  it('renders Visual Direction (style, mood, color palette, constraints) in Refine phase', async () => {
    const slots = makeAssetSlots();
    const visualDirection = makeVisualDirection();
    const draft = makeAssetsDraftRow({ slots, visualDirection });
    mountEngine({ draft });

    // Wait for loading to finish — fetchAssets sets phase='refine' on its own
    // when slots are persisted but no images exist yet.
    await waitFor(() => {
      expect(screen.getByText(/Visual Direction/i)).toBeInTheDocument();
    });
    expect(screen.getByText(visualDirection.style)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Mood:.*${visualDirection.mood}`))).toBeInTheDocument();
    // Color swatches render as divs with titles equal to the color hex
    for (const color of visualDirection.colorPalette) {
      expect(document.querySelector(`[title="${color}"]`)).not.toBeNull();
    }
    // Constraints joined with pipes
    expect(
      screen.getByText(new RegExp(visualDirection.constraints[0]!)),
    ).toBeInTheDocument();
  });

  it('shows per-slot promptBrief textarea + altText input + aspectRatio select when in Refine phase', async () => {
    const slots = makeAssetSlots();
    const draft = makeAssetsDraftRow({ slots });
    mountEngine({ draft });

    await waitFor(() => {
      // Prompt brief textarea exists for each slot
      const textareas = document.querySelectorAll('textarea');
      expect(textareas.length).toBeGreaterThanOrEqual(slots.length);
    });
    // The textarea values match the promptBrief from the fixture
    const textareas = Array.from(document.querySelectorAll('textarea')) as HTMLTextAreaElement[];
    const values = textareas.map((t) => t.value);
    for (const s of slots) {
      expect(values).toContain(s.promptBrief);
    }
    // Alt-text inputs render the altText from fixture
    const inputs = Array.from(document.querySelectorAll('input[type=text], input:not([type])')) as HTMLInputElement[];
    const altValues = inputs.map((i) => i.value);
    for (const s of slots) {
      expect(altValues).toContain(s.altText);
    }
    // Aspect ratio selects render with current aspect
    const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
    const aspectValues = selects.map((s) => s.value);
    for (const s of slots) {
      expect(aspectValues).toContain(s.aspectRatio);
    }
  });

  it('shows the briefs form (Generate Briefs button) when the draft has no asset_briefs yet', async () => {
    const draft = makeAssetsDraftRow({ slots: null });
    mountEngine({ draft });

    await waitFor(() => {
      expect(screen.getByText(/Step 1: Briefs/i)).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /Generate Briefs/i }),
    ).toBeInTheDocument();
  });

  it('respects wizard assets.mode=auto_generate: engine renders normally with autopilot config set', async () => {
    const slots = makeAssetSlots();
    const draft = makeAssetsDraftRow({ slots });
    mountEngine({ draft, assetsMode: 'auto_generate' });

    // Slot cards still render — no skip, no gate. Visual feedback unaffected.
    await waitFor(() => {
      expect(screen.getAllByText('Featured image').length).toBeGreaterThan(0);
    });
  });

  it('respects wizard assets.mode=briefs_only: in step-by-step mode the engine still renders briefs cards', async () => {
    // 'briefs_only' only emits ASSETS_GATE_TRIGGERED in overview mode (orchestrator-driven).
    // In step-by-step (this test's mode), briefs are shown and the user fills them manually.
    // We assert the engine doesn't crash and renders the slot cards.
    const slots = makeAssetSlots();
    const draft = makeAssetsDraftRow({ slots });
    mountEngine({ draft, assetsMode: 'briefs_only' });

    await waitFor(() => {
      expect(screen.getAllByText('Featured image').length).toBeGreaterThan(0);
    });
  });

  it('renders defensive fallback (does not crash) when draft is null', () => {
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
      startStage: 'assets',
    });
    expect(() =>
      render(
        <PipelineActorProvider value={actor}>
          <AssetsEngine mode="generate" draft={null} />
        </PipelineActorProvider>,
      ),
    ).not.toThrow();
  });
});
