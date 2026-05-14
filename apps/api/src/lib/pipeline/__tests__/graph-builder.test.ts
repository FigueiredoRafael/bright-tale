/**
 * Unit tests for graph-builder.ts (T1.12)
 *
 * Category A — pure, no DB required.
 */
import { describe, it, expect } from 'vitest';
import { buildGraph, type Track, type PublishTarget } from '../graph-builder';
import type { StageRun } from '@brighttale/shared/pipeline/inputs';

// ─── Test Factories ───────────────────────────────────────────────────────────

let _seq = 0;
function uid(): string {
  return `id-${++_seq}`;
}

function makeRun(
  overrides: Partial<StageRun> & Pick<StageRun, 'stage' | 'status'>,
): StageRun {
  return {
    id: uid(),
    projectId: 'proj-1',
    trackId: null,
    publishTargetId: null,
    awaitingReason: null,
    payloadRef: null,
    attemptNo: 1,
    inputJson: null,
    outcomeJson: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

function makeTrack(overrides: Partial<Track> & Pick<Track, 'id'>): Track {
  return {
    projectId: 'proj-1',
    medium: 'blog',
    status: 'active',
    paused: false,
    autopilotConfigJson: null,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

function makePublishTarget(overrides: Partial<PublishTarget> & Pick<PublishTarget, 'id'>): PublishTarget {
  return {
    displayName: 'My Blog',
    type: 'wordpress',
    isActive: true,
    channelId: null,
    orgId: null,
    configJson: null,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Test suites ──────────────────────────────────────────────────────────────

describe('buildGraph — linear single-track (no fan-out, no loops)', () => {
  it('produces one stage node per stage in the shared lane', () => {
    const stageRuns: StageRun[] = [
      makeRun({ stage: 'brainstorm', status: 'completed' }),
      makeRun({ stage: 'research', status: 'completed' }),
      makeRun({ stage: 'canonical', status: 'completed' }),
    ];
    const { nodes, edges } = buildGraph(stageRuns, [], []);

    const stageNodes = nodes.filter((n) => n.type === 'stage');
    expect(stageNodes.length).toBeGreaterThanOrEqual(3);

    const stages = stageNodes.map((n) => n.data.stage);
    expect(stages).toContain('brainstorm');
    expect(stages).toContain('research');
    expect(stages).toContain('canonical');
  });

  it('builds sequence edges between consecutive shared stages', () => {
    const stageRuns: StageRun[] = [
      makeRun({ stage: 'brainstorm', status: 'completed' }),
      makeRun({ stage: 'research', status: 'completed' }),
      makeRun({ stage: 'canonical', status: 'completed' }),
    ];
    const { edges } = buildGraph(stageRuns, [], []);

    const seqEdges = edges.filter((e) => e.type === 'sequence');
    expect(seqEdges.length).toBeGreaterThanOrEqual(2);

    // At least one brainstorm→research and one research→canonical edge
    const hasB2R = seqEdges.some(
      (e) => e.source.includes('brainstorm') && e.target.includes('research'),
    );
    const hasR2C = seqEdges.some(
      (e) => e.source.includes('research') && e.target.includes('canonical'),
    );
    expect(hasB2R).toBe(true);
    expect(hasR2C).toBe(true);
  });

  it('produces no fanout or loop edges for a linear pipeline', () => {
    const stageRuns: StageRun[] = [
      makeRun({ stage: 'brainstorm', status: 'completed' }),
      makeRun({ stage: 'research', status: 'completed' }),
      makeRun({ stage: 'canonical', status: 'completed' }),
    ];
    const { edges } = buildGraph(stageRuns, [], []);

    expect(edges.filter((e) => e.type === 'fanout')).toHaveLength(0);
    expect(edges.filter((e) => e.type === 'loop')).toHaveLength(0);
  });
});

describe('buildGraph — multi-track fan-out edges from Canonical', () => {
  it('produces a fanout edge from canonical to each active track production node', () => {
    const track1 = makeTrack({ id: 'track-1', medium: 'blog' });
    const track2 = makeTrack({ id: 'track-2', medium: 'video' });

    const stageRuns: StageRun[] = [
      makeRun({ stage: 'brainstorm', status: 'completed' }),
      makeRun({ stage: 'research', status: 'completed' }),
      makeRun({ stage: 'canonical', status: 'completed' }),
      makeRun({ stage: 'production', trackId: 'track-1', status: 'completed' }),
      makeRun({ stage: 'production', trackId: 'track-2', status: 'running' }),
    ];

    const { edges } = buildGraph(stageRuns, [track1, track2], []);

    const fanoutEdges = edges.filter((e) => e.type === 'fanout');
    expect(fanoutEdges.length).toBeGreaterThanOrEqual(2);

    const fromCanonical = fanoutEdges.filter((e) => e.source.includes('canonical'));
    expect(fromCanonical.length).toBe(2);

    const toTrack1 = fromCanonical.some((e) => e.target.includes('track-1'));
    const toTrack2 = fromCanonical.some((e) => e.target.includes('track-2'));
    expect(toTrack1).toBe(true);
    expect(toTrack2).toBe(true);
  });

  it('excludes aborted tracks from fanout edges', () => {
    const activeTrack = makeTrack({ id: 'track-active', medium: 'blog' });
    const abortedTrack = makeTrack({ id: 'track-aborted', medium: 'video', status: 'aborted' });

    const stageRuns: StageRun[] = [
      makeRun({ stage: 'canonical', status: 'completed' }),
      makeRun({ stage: 'production', trackId: 'track-active', status: 'completed' }),
      makeRun({ stage: 'production', trackId: 'track-aborted', status: 'aborted' }),
    ];

    const { edges, nodes } = buildGraph(stageRuns, [activeTrack, abortedTrack], []);

    // Aborted track's production node should not exist
    const abortedProdNode = nodes.find((n) => n.id.includes('track-aborted'));
    expect(abortedProdNode).toBeUndefined();

    // Only one fanout edge from canonical
    const fanoutFromCanonical = edges.filter(
      (e) => e.type === 'fanout' && e.source.includes('canonical'),
    );
    expect(fanoutFromCanonical).toHaveLength(1);
    expect(fanoutFromCanonical[0].target).toContain('track-active');
  });
});

describe('buildGraph — revision loop produces orange back-edge', () => {
  it('emits a loop edge from review back to production when review has multiple attempts', () => {
    const track = makeTrack({ id: 'track-1', medium: 'blog' });

    const stageRuns: StageRun[] = [
      makeRun({ stage: 'canonical', status: 'completed' }),
      makeRun({ stage: 'production', trackId: 'track-1', status: 'completed', attemptNo: 1 }),
      makeRun({ stage: 'review', trackId: 'track-1', status: 'completed', attemptNo: 1 }),
      makeRun({ stage: 'review', trackId: 'track-1', status: 'completed', attemptNo: 2 }),
    ];

    const { edges } = buildGraph(stageRuns, [track], []);

    const loopEdges = edges.filter((e) => e.type === 'loop' && e.data?.loopType === 'revision');
    expect(loopEdges.length).toBeGreaterThanOrEqual(1);

    const edge = loopEdges[0];
    expect(edge.source).toContain('review');
    expect(edge.target).toContain('production');
  });

  it('emits a revision loop when production has multiple attempts', () => {
    const track = makeTrack({ id: 'track-1', medium: 'blog' });

    const stageRuns: StageRun[] = [
      makeRun({ stage: 'canonical', status: 'completed' }),
      makeRun({ stage: 'production', trackId: 'track-1', status: 'completed', attemptNo: 1 }),
      makeRun({ stage: 'production', trackId: 'track-1', status: 'completed', attemptNo: 2 }),
      makeRun({ stage: 'review', trackId: 'track-1', status: 'completed', attemptNo: 1 }),
    ];

    const { edges } = buildGraph(stageRuns, [track], []);
    const loopEdges = edges.filter((e) => e.type === 'loop' && e.data?.loopType === 'revision');
    expect(loopEdges.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildGraph — confidence loop produces self-loop on Research', () => {
  it('emits a research self-loop when research has multiple attempts', () => {
    const stageRuns: StageRun[] = [
      makeRun({ stage: 'brainstorm', status: 'completed' }),
      makeRun({ stage: 'research', status: 'completed', attemptNo: 1 }),
      makeRun({ stage: 'research', status: 'completed', attemptNo: 2 }),
    ];

    const { edges } = buildGraph(stageRuns, [], []);

    const confidenceLoops = edges.filter(
      (e) => e.type === 'loop' && e.data?.loopType === 'confidence',
    );
    expect(confidenceLoops.length).toBe(1);

    const loop = confidenceLoops[0];
    expect(loop.source).toContain('research');
    expect(loop.target).toContain('research');
    expect(loop.source).toBe(loop.target);
  });

  it('does NOT emit a confidence loop for a single research attempt', () => {
    const stageRuns: StageRun[] = [
      makeRun({ stage: 'research', status: 'completed', attemptNo: 1 }),
    ];

    const { edges } = buildGraph(stageRuns, [], []);
    const confidenceLoops = edges.filter(
      (e) => e.type === 'loop' && e.data?.loopType === 'confidence',
    );
    expect(confidenceLoops).toHaveLength(0);
  });
});

describe('buildGraph — attempt mini-nodes ordered by attempt_no', () => {
  it('creates attempt nodes for attempts > 1 or failed/aborted statuses', () => {
    const stageRuns: StageRun[] = [
      makeRun({ stage: 'research', status: 'failed', attemptNo: 1 }),
      makeRun({ stage: 'research', status: 'completed', attemptNo: 2 }),
      makeRun({ stage: 'research', status: 'completed', attemptNo: 3 }),
    ];

    const { nodes } = buildGraph(stageRuns, [], []);

    const attemptNodes = nodes.filter((n) => n.type === 'attempt');
    // All 3 qualify (attempt 1 is failed → needs node; attempts 2,3 are > 1)
    expect(attemptNodes.length).toBe(3);

    // Should be ordered by attemptNo
    const attemptNos = attemptNodes.map((n) => n.data.attemptNo);
    expect(attemptNos).toEqual([...attemptNos].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it('creates attempt-type edges between consecutive attempt nodes', () => {
    const stageRuns: StageRun[] = [
      makeRun({ stage: 'review', trackId: 'track-1', status: 'failed', attemptNo: 1 }),
      makeRun({ stage: 'review', trackId: 'track-1', status: 'completed', attemptNo: 2 }),
    ];
    const track = makeTrack({ id: 'track-1', medium: 'blog' });

    const { edges } = buildGraph(stageRuns, [track], []);

    const attemptEdges = edges.filter((e) => e.type === 'attempt');
    expect(attemptEdges.length).toBeGreaterThanOrEqual(1);

    // The edge should connect attempt 1 to attempt 2
    const edge = attemptEdges[0];
    expect(edge.source).toContain('a:1');
    expect(edge.target).toContain('a:2');
  });

  it('does NOT create attempt nodes for a single successful attempt', () => {
    const stageRuns: StageRun[] = [
      makeRun({ stage: 'brainstorm', status: 'completed', attemptNo: 1 }),
    ];

    const { nodes } = buildGraph(stageRuns, [], []);
    const attemptNodes = nodes.filter((n) => n.type === 'attempt');
    expect(attemptNodes).toHaveLength(0);
  });
});

describe('buildGraph — skipped stages produce dashed-styled node data', () => {
  it('marks skipped stage runs as dashed', () => {
    const stageRuns: StageRun[] = [
      makeRun({ stage: 'brainstorm', status: 'completed' }),
      makeRun({ stage: 'research', status: 'skipped' }),
      makeRun({ stage: 'canonical', status: 'completed' }),
    ];

    const { nodes } = buildGraph(stageRuns, [], []);
    const researchNode = nodes.find(
      (n) => n.type === 'stage' && n.data.stage === 'research',
    );
    expect(researchNode).toBeDefined();
    expect(researchNode?.data.dashed).toBe(true);
  });

  it('marks placeholder nodes for stages with no runs as dashed', () => {
    // Only brainstorm has a run — research and canonical get placeholder nodes
    const stageRuns: StageRun[] = [
      makeRun({ stage: 'brainstorm', status: 'completed' }),
    ];

    const { nodes } = buildGraph(stageRuns, [], []);
    const canonicalNode = nodes.find(
      (n) => n.type === 'stage' && n.data.stage === 'canonical',
    );
    expect(canonicalNode).toBeDefined();
    expect(canonicalNode?.data.dashed).toBe(true);
  });
});

describe('buildGraph — aborted tracks excluded', () => {
  it('excludes all stage runs for aborted tracks', () => {
    const activeTrack = makeTrack({ id: 't-active', medium: 'blog' });
    const abortedTrack = makeTrack({ id: 't-aborted', medium: 'video', status: 'aborted' });

    const stageRuns: StageRun[] = [
      makeRun({ stage: 'canonical', status: 'completed' }),
      makeRun({ stage: 'production', trackId: 't-active', status: 'completed' }),
      makeRun({ stage: 'production', trackId: 't-aborted', status: 'completed' }),
      makeRun({ stage: 'review', trackId: 't-aborted', status: 'aborted' }),
    ];

    const { nodes } = buildGraph(stageRuns, [activeTrack, abortedTrack], []);

    // No node should reference t-aborted
    const abortedNodes = nodes.filter((n) =>
      n.id.includes('t-aborted') || n.data.trackId === 't-aborted',
    );
    expect(abortedNodes).toHaveLength(0);
  });
});

describe('buildGraph — publish fanout produces purple (fanout) edges', () => {
  it('produces fanout edges from preview to each publish target node', () => {
    const track = makeTrack({ id: 'track-1', medium: 'blog' });
    const pt1 = makePublishTarget({ id: 'pt-1', displayName: 'Blog A' });
    const pt2 = makePublishTarget({ id: 'pt-2', displayName: 'Blog B' });

    const stageRuns: StageRun[] = [
      makeRun({ stage: 'canonical', status: 'completed' }),
      makeRun({ stage: 'production', trackId: 'track-1', status: 'completed' }),
      makeRun({ stage: 'review', trackId: 'track-1', status: 'completed' }),
      makeRun({ stage: 'assets', trackId: 'track-1', status: 'completed' }),
      makeRun({ stage: 'preview', trackId: 'track-1', status: 'completed' }),
      makeRun({ stage: 'publish', trackId: 'track-1', publishTargetId: 'pt-1', status: 'completed' }),
      makeRun({ stage: 'publish', trackId: 'track-1', publishTargetId: 'pt-2', status: 'queued' }),
    ];

    const { nodes, edges } = buildGraph(stageRuns, [track], [pt1, pt2]);

    // Publish target nodes should exist
    const publishNodes = nodes.filter((n) => n.data.stage === 'publish');
    expect(publishNodes.length).toBe(2);

    // Fanout edges from preview to each publish
    const fanoutEdges = edges.filter(
      (e) =>
        e.type === 'fanout' &&
        e.source.includes('preview') &&
        e.target.includes('publish'),
    );
    expect(fanoutEdges.length).toBe(2);

    const toPt1 = fanoutEdges.some((e) => e.target.includes('pt-1'));
    const toPt2 = fanoutEdges.some((e) => e.target.includes('pt-2'));
    expect(toPt1).toBe(true);
    expect(toPt2).toBe(true);
  });
});

describe('buildGraph — positions are deterministic', () => {
  it('produces the same graph on repeated calls with the same input', () => {
    const track = makeTrack({ id: 'track-stable', medium: 'blog' });
    const runs: StageRun[] = [
      makeRun({ stage: 'brainstorm', status: 'completed' }),
      makeRun({ stage: 'research', status: 'completed' }),
      makeRun({ stage: 'canonical', status: 'completed' }),
      makeRun({ stage: 'production', trackId: 'track-stable', status: 'running' }),
    ];

    const result1 = buildGraph(runs, [track], []);
    const result2 = buildGraph(runs, [track], []);

    expect(result1.nodes.map((n) => n.id)).toEqual(result2.nodes.map((n) => n.id));
    expect(result1.nodes.map((n) => n.position)).toEqual(result2.nodes.map((n) => n.position));
    expect(result1.edges.map((e) => e.id)).toEqual(result2.edges.map((e) => e.id));
  });
});

describe('buildGraph — empty inputs', () => {
  it('returns only placeholder shared-stage nodes for empty runs', () => {
    const { nodes, edges } = buildGraph([], [], []);

    // Should produce placeholder nodes for brainstorm, research, canonical
    const stageNodes = nodes.filter((n) => n.type === 'stage');
    expect(stageNodes.length).toBeGreaterThanOrEqual(3);
    stageNodes.forEach((n) => expect(n.data.dashed).toBe(true));

    // No edges (except possibly shared sequence edges between placeholders)
    const nonSeqEdges = edges.filter((e) => e.type !== 'sequence');
    expect(nonSeqEdges).toHaveLength(0);
  });
});
