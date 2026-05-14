import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  type BuildGraphInput,
  type GraphEdge,
  type GraphEdgeKind,
  type RunNode,
} from '../graph-builder';
import type { Track } from '../fan-out-planner';
import type { PublishTarget } from '../publish-target-resolver';

function run(
  id: string,
  stage: RunNode['stage'],
  opts: Partial<RunNode> = {},
): RunNode {
  return {
    id,
    stage,
    status: opts.status ?? 'completed',
    trackId: opts.trackId ?? null,
    publishTargetId: opts.publishTargetId ?? null,
    attemptNo: opts.attemptNo ?? 1,
  };
}

function track(
  id: string,
  medium: Track['medium'] = 'blog',
  status: Track['status'] = 'active',
  paused = false,
): Track {
  return { id, projectId: 'p1', medium, status, paused };
}

function target(
  id: string,
  type: PublishTarget['type'] = 'wordpress',
  isActive = true,
): PublishTarget {
  return {
    id,
    channelId: 'c1',
    orgId: null,
    type,
    displayName: `${type}-${id}`,
    configJson: null,
    isActive,
    createdAt: '2026-05-14T00:00:00Z',
    updatedAt: '2026-05-14T00:00:00Z',
  };
}

function edgeKinds(edges: GraphEdge[]): GraphEdgeKind[] {
  return edges.map((e) => e.kind);
}

function findEdge(
  edges: GraphEdge[],
  from: string,
  to: string,
): GraphEdge | undefined {
  return edges.find((e) => e.from === from && e.to === to);
}

describe('buildGraph — single-Track linear pipeline', () => {
  it('produces sequence-only edges for a happy-path single Track', () => {
    const t = track('tBlog', 'blog');
    const tgt = target('wp1', 'wordpress');
    const input: BuildGraphInput = {
      tracks: [t],
      publishTargets: [tgt],
      stageRuns: [
        run('b1', 'brainstorm'),
        run('r1', 'research'),
        run('c1', 'canonical'),
        run('p1', 'production', { trackId: t.id }),
        run('rv1', 'review', { trackId: t.id }),
        run('a1', 'assets', { trackId: t.id }),
        run('pv1', 'preview', { trackId: t.id }),
        run('pub1', 'publish', { trackId: t.id, publishTargetId: tgt.id }),
      ],
    };

    const { nodes, edges } = buildGraph(input);

    expect(nodes).toHaveLength(8);

    // All sequence edges + one fanout-canonical + one fanout-publish.
    const kinds = edgeKinds(edges);
    expect(kinds.filter((k) => k === 'loop-confidence')).toEqual([]);
    expect(kinds.filter((k) => k === 'loop-revision')).toEqual([]);
    expect(kinds.filter((k) => k === 'fanout-canonical')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'fanout-publish')).toHaveLength(1);

    expect(findEdge(edges, 'b1', 'r1')?.kind).toBe('sequence');
    expect(findEdge(edges, 'r1', 'c1')?.kind).toBe('sequence');
    expect(findEdge(edges, 'c1', 'p1')?.kind).toBe('fanout-canonical');
    expect(findEdge(edges, 'p1', 'rv1')?.kind).toBe('sequence');
    expect(findEdge(edges, 'rv1', 'a1')?.kind).toBe('sequence');
    expect(findEdge(edges, 'a1', 'pv1')?.kind).toBe('sequence');
    expect(findEdge(edges, 'pv1', 'pub1')?.kind).toBe('fanout-publish');
  });
});

describe('buildGraph — lane classification', () => {
  it('tags shared / track / publish lanes correctly', () => {
    const t = track('tBlog', 'blog');
    const tgt = target('wp1', 'wordpress');
    const { nodes } = buildGraph({
      tracks: [t],
      publishTargets: [tgt],
      stageRuns: [
        run('b1', 'brainstorm'),
        run('p1', 'production', { trackId: t.id }),
        run('pub1', 'publish', { trackId: t.id, publishTargetId: tgt.id }),
      ],
    });
    expect(nodes.find((n) => n.id === 'b1')?.lane).toBe('shared');
    expect(nodes.find((n) => n.id === 'p1')?.lane).toBe('track');
    expect(nodes.find((n) => n.id === 'pub1')?.lane).toBe('publish');
  });
});

describe('buildGraph — multi-Track fan-out from canonical', () => {
  it('emits one fanout-canonical edge per active Track', () => {
    const tBlog = track('tBlog', 'blog');
    const tVideo = track('tVideo', 'video');
    const tPod = track('tPod', 'podcast');
    const input: BuildGraphInput = {
      tracks: [tBlog, tVideo, tPod],
      publishTargets: [],
      stageRuns: [
        run('c1', 'canonical'),
        run('pBlog', 'production', { trackId: tBlog.id }),
        run('pVid', 'production', { trackId: tVideo.id }),
        run('pPod', 'production', { trackId: tPod.id }),
      ],
    };
    const { edges } = buildGraph(input);
    const fanout = edges.filter((e) => e.kind === 'fanout-canonical');
    expect(fanout).toHaveLength(3);
    expect(fanout.map((e) => e.to).sort()).toEqual(['pBlog', 'pPod', 'pVid']);
    expect(fanout.every((e) => e.from === 'c1')).toBe(true);
  });

  it('skips Tracks that have no production run yet', () => {
    const tBlog = track('tBlog', 'blog');
    const tVideo = track('tVideo', 'video');
    const { edges } = buildGraph({
      tracks: [tBlog, tVideo],
      publishTargets: [],
      stageRuns: [
        run('c1', 'canonical'),
        run('pBlog', 'production', { trackId: tBlog.id }),
        // video Track has no production yet
      ],
    });
    const fanout = edges.filter((e) => e.kind === 'fanout-canonical');
    expect(fanout).toHaveLength(1);
    expect(fanout[0].to).toBe('pBlog');
  });
});

describe('buildGraph — research confidence loop', () => {
  it('emits loop-confidence between consecutive research attempts', () => {
    const { edges } = buildGraph({
      tracks: [],
      publishTargets: [],
      stageRuns: [
        run('b1', 'brainstorm'),
        run('r1', 'research', { attemptNo: 1 }),
        run('r2', 'research', { attemptNo: 2 }),
        run('r3', 'research', { attemptNo: 3 }),
        run('c1', 'canonical'),
      ],
    });
    expect(findEdge(edges, 'r1', 'r2')?.kind).toBe('loop-confidence');
    expect(findEdge(edges, 'r2', 'r3')?.kind).toBe('loop-confidence');
    // Last attempt advances to canonical via plain sequence
    expect(findEdge(edges, 'r3', 'c1')?.kind).toBe('sequence');
    // First attempt linked from brainstorm
    expect(findEdge(edges, 'b1', 'r1')?.kind).toBe('sequence');
  });
});

describe('buildGraph — review revision loop', () => {
  it('pairs production/review by attempt and back-edges review→production+1', () => {
    const t = track('tBlog', 'blog');
    const { edges } = buildGraph({
      tracks: [t],
      publishTargets: [],
      stageRuns: [
        run('c1', 'canonical'),
        run('p1', 'production', { trackId: t.id, attemptNo: 1 }),
        run('rv1', 'review', { trackId: t.id, attemptNo: 1 }),
        run('p2', 'production', { trackId: t.id, attemptNo: 2 }),
        run('rv2', 'review', { trackId: t.id, attemptNo: 2 }),
        run('a1', 'assets', { trackId: t.id }),
      ],
    });

    expect(findEdge(edges, 'p1', 'rv1')?.kind).toBe('sequence');
    expect(findEdge(edges, 'rv1', 'p2')?.kind).toBe('loop-revision');
    expect(findEdge(edges, 'p2', 'rv2')?.kind).toBe('sequence');
    expect(findEdge(edges, 'rv2', 'a1')?.kind).toBe('sequence');
    // No direct p1→p2 edge — the path passes through review
    expect(findEdge(edges, 'p1', 'p2')).toBeUndefined();
  });

  it('handles a third revision iteration cleanly', () => {
    const t = track('tVid', 'video');
    const { edges } = buildGraph({
      tracks: [t],
      publishTargets: [],
      stageRuns: [
        run('p1', 'production', { trackId: t.id, attemptNo: 1 }),
        run('rv1', 'review', { trackId: t.id, attemptNo: 1 }),
        run('p2', 'production', { trackId: t.id, attemptNo: 2 }),
        run('rv2', 'review', { trackId: t.id, attemptNo: 2 }),
        run('p3', 'production', { trackId: t.id, attemptNo: 3 }),
        run('rv3', 'review', { trackId: t.id, attemptNo: 3 }),
      ],
    });
    const revisionEdges = edges.filter((e) => e.kind === 'loop-revision');
    expect(revisionEdges).toHaveLength(2);
    expect(findEdge(edges, 'rv1', 'p2')?.kind).toBe('loop-revision');
    expect(findEdge(edges, 'rv2', 'p3')?.kind).toBe('loop-revision');
  });
});

describe('buildGraph — publish fan-out', () => {
  it('emits one fanout-publish edge per target with at least one attempt', () => {
    const t = track('tPod', 'podcast');
    const tgtSpot = target('spot', 'spotify');
    const tgtYt = target('yt', 'youtube');
    const tgtApple = target('apple', 'apple_podcasts');
    const { edges } = buildGraph({
      tracks: [t],
      publishTargets: [tgtSpot, tgtYt, tgtApple],
      stageRuns: [
        run('pv1', 'preview', { trackId: t.id }),
        run('pubS', 'publish', { trackId: t.id, publishTargetId: tgtSpot.id }),
        run('pubY', 'publish', { trackId: t.id, publishTargetId: tgtYt.id }),
        run('pubA', 'publish', { trackId: t.id, publishTargetId: tgtApple.id }),
      ],
    });
    const fanout = edges.filter((e) => e.kind === 'fanout-publish');
    expect(fanout).toHaveLength(3);
    expect(fanout.every((e) => e.from === 'pv1')).toBe(true);
    expect(fanout.map((e) => e.to).sort()).toEqual(['pubA', 'pubS', 'pubY']);
  });

  it('groups multiple attempts of same target — one fan-out edge + sequence between attempts', () => {
    const t = track('tBlog', 'blog');
    const tgt = target('wp1', 'wordpress');
    const { edges } = buildGraph({
      tracks: [t],
      publishTargets: [tgt],
      stageRuns: [
        run('pv1', 'preview', { trackId: t.id }),
        run('pub1', 'publish', {
          trackId: t.id,
          publishTargetId: tgt.id,
          attemptNo: 1,
        }),
        run('pub2', 'publish', {
          trackId: t.id,
          publishTargetId: tgt.id,
          attemptNo: 2,
        }),
      ],
    });
    const fanout = edges.filter((e) => e.kind === 'fanout-publish');
    expect(fanout).toHaveLength(1);
    expect(fanout[0].to).toBe('pub1');
    expect(findEdge(edges, 'pub1', 'pub2')?.kind).toBe('sequence');
  });

  it('emits no fan-out when there are no publish stage_runs yet', () => {
    const t = track('tBlog', 'blog');
    const tgt = target('wp1', 'wordpress');
    const { edges } = buildGraph({
      tracks: [t],
      publishTargets: [tgt],
      stageRuns: [run('pv1', 'preview', { trackId: t.id })],
    });
    expect(edges.filter((e) => e.kind === 'fanout-publish')).toHaveLength(0);
  });
});

describe('buildGraph — aborted Tracks excluded', () => {
  it('drops nodes and edges for aborted Tracks', () => {
    const tBlog = track('tBlog', 'blog', 'active');
    const tVid = track('tVid', 'video', 'aborted');
    const { nodes, edges } = buildGraph({
      tracks: [tBlog, tVid],
      publishTargets: [],
      stageRuns: [
        run('c1', 'canonical'),
        run('pBlog', 'production', { trackId: tBlog.id }),
        run('pVid', 'production', { trackId: tVid.id }), // should vanish
      ],
    });
    expect(nodes.find((n) => n.id === 'pVid')).toBeUndefined();
    expect(nodes.find((n) => n.id === 'pBlog')).toBeDefined();
    const fanout = edges.filter((e) => e.kind === 'fanout-canonical');
    expect(fanout.map((e) => e.to)).toEqual(['pBlog']);
  });
});

describe('buildGraph — paused Tracks still appear', () => {
  it('paused Tracks are visible — only aborted are dropped', () => {
    const tBlog = track('tBlog', 'blog', 'active');
    const tVid = track('tVid', 'video', 'active', true);
    const { nodes, edges } = buildGraph({
      tracks: [tBlog, tVid],
      publishTargets: [],
      stageRuns: [
        run('c1', 'canonical'),
        run('pBlog', 'production', { trackId: tBlog.id }),
        run('pVid', 'production', { trackId: tVid.id }),
      ],
    });
    expect(nodes.find((n) => n.id === 'pVid')).toBeDefined();
    expect(edges.filter((e) => e.kind === 'fanout-canonical')).toHaveLength(2);
  });
});

describe('buildGraph — node metadata', () => {
  it('preserves status, attemptNo, lane, label per node', () => {
    const t = track('tBlog', 'blog');
    const { nodes } = buildGraph({
      tracks: [t],
      publishTargets: [],
      stageRuns: [
        run('r1', 'research', { attemptNo: 2, status: 'skipped' }),
        run('p1', 'production', { trackId: t.id, status: 'running' }),
      ],
    });
    const r = nodes.find((n) => n.id === 'r1')!;
    expect(r.status).toBe('skipped');
    expect(r.attemptNo).toBe(2);
    expect(r.lane).toBe('shared');
    expect(r.label).toBe('research #2');

    const p = nodes.find((n) => n.id === 'p1')!;
    expect(p.status).toBe('running');
    expect(p.lane).toBe('track');
    expect(p.label).toBe('production #1');
  });

  it('emits node for skipped stage_runs (renderer dashes them)', () => {
    const t = track('tBlog', 'blog');
    const { nodes } = buildGraph({
      tracks: [t],
      publishTargets: [],
      stageRuns: [
        run('rv1', 'review', { trackId: t.id, status: 'skipped' }),
        run('a1', 'assets', { trackId: t.id, status: 'skipped' }),
        run('pv1', 'preview', { trackId: t.id }),
      ],
    });
    expect(nodes.filter((n) => n.status === 'skipped')).toHaveLength(2);
  });
});

describe('buildGraph — empty/partial inputs', () => {
  it('returns empty nodes and edges for empty input', () => {
    const out = buildGraph({ tracks: [], publishTargets: [], stageRuns: [] });
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
  });

  it('handles a project with only brainstorm running', () => {
    const { nodes, edges } = buildGraph({
      tracks: [],
      publishTargets: [],
      stageRuns: [run('b1', 'brainstorm', { status: 'running' })],
    });
    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
  });
});

describe('buildGraph — purity', () => {
  it('does not mutate inputs', () => {
    const t = track('tBlog', 'blog');
    const tgt = target('wp1', 'wordpress');
    const input: BuildGraphInput = {
      tracks: [t],
      publishTargets: [tgt],
      stageRuns: [
        run('c1', 'canonical'),
        run('p1', 'production', { trackId: t.id }),
      ],
    };
    const snap = JSON.stringify(input);
    buildGraph(input);
    expect(JSON.stringify(input)).toBe(snap);
  });

  it('is deterministic across calls', () => {
    const t = track('tBlog', 'blog');
    const input: BuildGraphInput = {
      tracks: [t],
      publishTargets: [],
      stageRuns: [
        run('c1', 'canonical'),
        run('p1', 'production', { trackId: t.id }),
        run('rv1', 'review', { trackId: t.id }),
      ],
    };
    const a = buildGraph(input);
    const b = buildGraph(input);
    expect(a).toEqual(b);
  });
});

describe('buildGraph — unique edge ids', () => {
  it('all edges have unique ids', () => {
    const t = track('tBlog', 'blog');
    const tgt = target('wp1', 'wordpress');
    const { edges } = buildGraph({
      tracks: [t],
      publishTargets: [tgt],
      stageRuns: [
        run('b1', 'brainstorm'),
        run('r1', 'research'),
        run('c1', 'canonical'),
        run('p1', 'production', { trackId: t.id }),
        run('rv1', 'review', { trackId: t.id }),
        run('a1', 'assets', { trackId: t.id }),
        run('pv1', 'preview', { trackId: t.id }),
        run('pub1', 'publish', { trackId: t.id, publishTargetId: tgt.id }),
      ],
    });
    const ids = edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
