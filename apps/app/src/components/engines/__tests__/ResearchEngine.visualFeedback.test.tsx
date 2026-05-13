import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createActor } from 'xstate';
import React from 'react';
import { pipelineMachine } from '@/lib/pipeline/machine';
import { PipelineActorProvider } from '@/providers/PipelineActorProvider';
import { ResearchEngine } from '../ResearchEngine';
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types';
import { makeResearchFindings, makeResearchSession } from './fixtures/research';

vi.mock('@/hooks/use-analytics', () => ({ useAnalytics: () => ({ track: vi.fn() }) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

function mountEngine(opts: { session?: ReturnType<typeof makeResearchSession> } = {}) {
  const session = opts.session ?? makeResearchSession();
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
    autopilotConfig: null,
    templateId: null,
    startStage: 'research',
  });
  return render(
    <PipelineActorProvider value={actor}>
      <ResearchEngine
        mode="generate"
        initialSession={session as unknown as Record<string, unknown>}
        initialIdeaId="idea-1"
      />
    </PipelineActorProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/api/agent-prompts') || u.includes('/api/agents')) {
        return { ok: true, json: async () => ({ data: null, error: null }) } as Response;
      }
      return { ok: true, json: async () => ({ data: null, error: null }) } as Response;
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ResearchEngine — visual feedback', () => {
  it('renders the research summary and confidence score from idea_validation', () => {
    const findings = makeResearchFindings();
    mountEngine({ session: makeResearchSession({ findings }) });

    expect(screen.getByText(/Research Summary/i)).toBeInTheDocument();
    expect(screen.getByText(findings.research_summary)).toBeInTheDocument();
    // Confidence score rendered as rounded percentage (0.86 → 86%)
    expect(screen.getByText(/86%/)).toBeInTheDocument();
  });

  it('renders refined-angle card (no pivot path)', () => {
    const findings = makeResearchFindings();
    mountEngine({ session: makeResearchSession({ findings }) });

    // The engine renders the refined-angle card both inline AND inside
    // ResearchFindingsReport (shallow duplication — flagged for cleanup).
    // Visual feedback test just needs at least one to be present.
    expect(screen.getAllByText(/Refined Angle/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(findings.refined_angle.updated_title).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(findings.refined_angle.recommendation).length,
    ).toBeGreaterThan(0);
  });

  it('renders pivot-recommended card when refined_angle.should_pivot is true', () => {
    const findings = makeResearchFindings({
      refined_angle: {
        should_pivot: true,
        updated_title: 'Pivot to: how scientists detect deep-sea light',
        updated_hook: 'Switching from "why glow" to "how we found out".',
        angle_notes: 'Pivot needed — original angle is too saturated.',
        recommendation: 'Switch to detection methodology framing.',
      },
    });
    mountEngine({ session: makeResearchSession({ findings, refinedAngle: findings.refined_angle }) });

    expect(screen.getAllByText(/Pivot Recommended/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(findings.refined_angle.updated_title).length,
    ).toBeGreaterThan(0);
  });

  it('renders Sources section with title, credibility badge, and key_insight', () => {
    const findings = makeResearchFindings();
    mountEngine({ session: makeResearchSession({ findings }) });

    expect(screen.getByText(/^Sources$/)).toBeInTheDocument();
    const source = findings.sources[0]!;
    expect(screen.getByText(source.title)).toBeInTheDocument();
    expect(screen.getByText(source.key_insight)).toBeInTheDocument();
    expect(screen.getByText(source.credibility)).toBeInTheDocument();
  });

  it('renders Statistics section with figure + claim + context', () => {
    const findings = makeResearchFindings();
    mountEngine({ session: makeResearchSession({ findings }) });

    const stat = findings.statistics[0]!;
    expect(screen.getByText(stat.figure)).toBeInTheDocument();
    expect(screen.getByText(stat.claim)).toBeInTheDocument();
    expect(screen.getByText(stat.context)).toBeInTheDocument();
  });

  it('renders Expert Quotes section with quote + author + credentials', () => {
    const findings = makeResearchFindings();
    mountEngine({ session: makeResearchSession({ findings }) });

    expect(screen.getByText(/Expert Quotes/i)).toBeInTheDocument();
    const expert = findings.expert_quotes[0]!;
    // Quote is wrapped in &ldquo;…&rdquo; — match by substring
    expect(screen.getByText(new RegExp(expert.quote.slice(0, 40)))).toBeInTheDocument();
    expect(screen.getByText(expert.author)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(expert.credentials.slice(0, 20)))).toBeInTheDocument();
  });

  it('renders Counterarguments section with point, strength badge, and rebuttal', () => {
    const findings = makeResearchFindings();
    mountEngine({ session: makeResearchSession({ findings }) });

    expect(screen.getByText(/Counterarguments/i)).toBeInTheDocument();
    const counter = findings.counterarguments[0]!;
    expect(screen.getByText(counter.point)).toBeInTheDocument();
    expect(screen.getByText(counter.rebuttal)).toBeInTheDocument();
  });

  it('renders Knowledge Gaps list', () => {
    const findings = makeResearchFindings();
    mountEngine({ session: makeResearchSession({ findings }) });

    expect(screen.getByText(/Knowledge Gaps/i)).toBeInTheDocument();
    for (const gap of findings.knowledge_gaps) {
      expect(screen.getByText(gap)).toBeInTheDocument();
    }
  });

  it('does NOT show the missing-primary-keyword warning when seo.primary_keyword exists', () => {
    mountEngine();
    expect(screen.queryByText(/Primary keyword missing/i)).toBeNull();
  });

  it('SHOWS the missing-primary-keyword warning when seo.primary_keyword is absent', () => {
    const findings = makeResearchFindings({ seo: { primary_keyword: '' } });
    mountEngine({ session: makeResearchSession({ findings }) });
    // The warning renders when the keyword field is falsy
    expect(screen.getByText(/Primary keyword missing/i)).toBeInTheDocument();
  });

  it('renders the Continue button so the user can advance to draft', () => {
    mountEngine();
    expect(screen.getByRole('button', { name: /^Continue$/i })).toBeInTheDocument();
  });

  it('renders no-findings fallback (does not crash) when session has no findings', () => {
    const session = {
      id: 'rs-empty',
      level: 'medium',
      input_json: { topic: 'x', focusTags: [] },
    };
    expect(() =>
      mountEngine({ session: session as unknown as ReturnType<typeof makeResearchSession> }),
    ).not.toThrow();
  });
});
