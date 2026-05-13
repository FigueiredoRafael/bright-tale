import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { createActor } from 'xstate';
import React from 'react';
import { pipelineMachine } from '@/lib/pipeline/machine';
import { PipelineActorProvider } from '@/providers/PipelineActorProvider';
import { BrainstormEngine } from '../BrainstormEngine';
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types';
import {
  makeBrainstormIdeas,
  makeBrainstormSession,
  type BrainstormIdeaFixture,
} from './fixtures/brainstorm';

vi.mock('@/hooks/use-analytics', () => ({ useAnalytics: () => ({ track: vi.fn() }) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

interface MountOpts {
  ideas?: BrainstormIdeaFixture[];
  session?: ReturnType<typeof makeBrainstormSession>;
  // When true, the engine receives no initialSession/initialIdeas — instead
  // it hydrates from the session-fetch effect, exercising recommendation_json
  // and content_warning rendering paths.
  hydrateViaFetch?: boolean;
}

function mountEngine(opts: MountOpts = {}) {
  const ideas = opts.ideas ?? makeBrainstormIdeas();
  const session = opts.session ?? makeBrainstormSession();

  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'proj-1',
      channelId: 'ch-1',
      projectTitle: 'Test Project',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
      creditSettings: DEFAULT_CREDIT_SETTINGS,
    },
  }).start();
  actor.send({
    type: 'SETUP_COMPLETE',
    mode: 'step-by-step',
    autopilotConfig: null,
    templateId: null,
    startStage: 'brainstorm',
  });
  if (opts.hydrateViaFetch) {
    actor.send({
      type: 'STAGE_PROGRESS',
      stage: 'brainstorm',
      partial: { brainstormSessionId: session.id },
    });
  }

  return render(
    <PipelineActorProvider value={actor}>
      <BrainstormEngine
        mode="generate"
        initialIdeas={opts.hydrateViaFetch ? undefined : (ideas as unknown as Record<string, unknown>[])}
        initialSession={opts.hydrateViaFetch ? undefined : session}
      />
    </PipelineActorProvider>,
  );
}

// Per-test fetch wiring: the default session response also includes ideas,
// so the hydrate-via-fetch path delivers both the recommendation and the cards
// without needing the /drafts fallback.
function stubFetchForSession(
  session: ReturnType<typeof makeBrainstormSession>,
  ideas: BrainstormIdeaFixture[] = makeBrainstormIdeas(),
) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes(`/api/brainstorm/sessions/${session.id}/drafts`)) {
        return {
          ok: true,
          json: async () => ({ data: { drafts: [] }, error: null }),
        } as Response;
      }
      if (u.includes(`/api/brainstorm/sessions/${session.id}`)) {
        return {
          ok: true,
          json: async () => ({
            data: { session, ideas: ideas.map((i) => ({ ...i })) },
            error: null,
          }),
        } as Response;
      }
      if (u.includes('/api/ideas/library')) {
        return { ok: true, json: async () => ({ data: { ideas: [] }, error: null }) } as Response;
      }
      if (u.includes('/api/agent-prompts')) {
        return { ok: true, json: async () => ({ data: null, error: null }) } as Response;
      }
      return { ok: true, json: async () => ({ data: null, error: null }) } as Response;
    }),
  );
}

beforeEach(() => {
  stubFetchForSession(makeBrainstormSession());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BrainstormEngine — visual feedback', () => {
  it('renders one card per idea with title, verdict badge, core tension, and audience', () => {
    const ideas = makeBrainstormIdeas();
    mountEngine({ ideas });

    for (const idea of ideas) {
      expect(
        screen.getByText(idea.title),
        `idea title "${idea.title}" should be visible`,
      ).toBeInTheDocument();
      expect(
        screen.getByText(idea.core_tension),
        `core tension for "${idea.title}" should be visible`,
      ).toBeInTheDocument();
      expect(
        screen.getByText(idea.target_audience),
        `target audience for "${idea.title}" should be visible`,
      ).toBeInTheDocument();
    }

    // Verdict badges: one of each verdict in this fixture set
    const verdicts: BrainstormIdeaFixture['verdict'][] = ['viable', 'weak', 'experimental'];
    for (const v of verdicts) {
      // Verdict text is rendered inside the badge — case-sensitive lowercase in component
      const matches = screen.getAllByText(v, { selector: 'div, span' });
      expect(matches.length, `verdict "${v}" should appear at least once`).toBeGreaterThan(0);
    }
  });

  it('renders discovery_data extras (angle, repurposing tags, risk flags) when present', () => {
    const ideas = makeBrainstormIdeas();
    mountEngine({ ideas });

    // idea-1 has discovery_data with all three fields
    expect(screen.getByText('Bioluminescence as evolutionary survival')).toBeInTheDocument();
    expect(screen.getByText('shorts')).toBeInTheDocument();
    expect(screen.getByText('podcast-segment')).toBeInTheDocument();
    expect(screen.getByText('niche audience')).toBeInTheDocument();
  });

  it('shows AI recommendation block (pick + rationale) when session has recommendation_json', async () => {
    const session = makeBrainstormSession({
      recommendedPick: 'Why deep-sea creatures glow without sunlight',
      rationale: 'Strong narrative hook with visual potential.',
    });
    stubFetchForSession(session);
    mountEngine({ session, hydrateViaFetch: true });

    // Locate the AI Recommendation block (not the duplicate card title that
    // shares the pick text) and assert pick + rationale are inside it.
    const heading = await screen.findByText(/AI Recommendation/i);
    const block = heading.closest('div.relative')?.parentElement?.parentElement;
    expect(block, 'AI Recommendation container should be findable').not.toBeFalsy();
    expect(
      within(block as HTMLElement).getByText(session.recommendation_json.pick!),
    ).toBeInTheDocument();
    expect(
      within(block as HTMLElement).getByText(session.recommendation_json.rationale!),
    ).toBeInTheDocument();
  });

  it('shows content warning banner when session has content_warning', async () => {
    const session = makeBrainstormSession({
      contentWarning: 'Some topics touch on sensitive marine extinction themes.',
    });
    stubFetchForSession(session);
    mountEngine({ session, hydrateViaFetch: true });

    await waitFor(() => {
      expect(
        screen.getByText(/sensitive marine extinction themes/i),
      ).toBeInTheDocument();
    });
  });

  it('exposes a clickable "View details" affordance per idea card', () => {
    const ideas = makeBrainstormIdeas();
    mountEngine({ ideas });
    const detailButtons = screen.getAllByRole('button', { name: /view details/i });
    expect(detailButtons.length).toBe(ideas.length);
  });

  it('renders nothing-crashing when ideas array is empty', () => {
    expect(() => mountEngine({ ideas: [] })).not.toThrow();
    // No idea cards present
    expect(screen.queryByText('Why deep-sea creatures glow without sunlight')).toBeNull();
  });

  it('marks the pre-selected idea as visually selected (radio-style check)', () => {
    const ideas = makeBrainstormIdeas();
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
      startStage: 'brainstorm',
    });
    render(
      <PipelineActorProvider value={actor}>
        <BrainstormEngine
          mode="generate"
          initialIdeas={ideas as unknown as Record<string, unknown>[]}
          initialSession={makeBrainstormSession()}
          preSelectedIdeaId="idea-2"
        />
      </PipelineActorProvider>,
    );
    // "Previously selected" label appears on the preselected card
    expect(screen.getByText(/previously selected/i)).toBeInTheDocument();
    // The title may appear twice (card + sticky footer when selected) — pick the
    // one inside a role="button" card and assert the "previously selected" tag
    // sits inside it.
    const titleMatches = screen.getAllByText('The neuroscience of nostalgia in adults');
    const card = titleMatches
      .map((el) => el.closest('[role="button"]'))
      .find((el): el is HTMLElement => el !== null);
    expect(card, 'preselected idea card should be findable').not.toBeUndefined();
    expect(within(card as HTMLElement).getByText(/previously selected/i)).toBeInTheDocument();
  });
});
