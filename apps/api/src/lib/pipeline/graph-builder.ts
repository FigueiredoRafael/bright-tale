/**
 * graph-builder — pure transform from the persisted stage_run set into the
 * DAG shape consumed by the Graph view (`@xyflow/react`-backed).
 *
 * Inputs: every stage_run row for the project + the Track set + the
 * PublishTarget set. Output: nodes (one per stage_run) + typed edges.
 *
 * Pure: no DB, no I/O. The orchestrator/route loads the rows and hands them
 * here.
 *
 * Lanes (for layout):
 *   - shared:  trackId === null
 *   - track:   trackId !== null && publishTargetId === null
 *   - publish: publishTargetId !== null
 *
 * Edge kinds (consumed by the renderer to pick stroke + colour):
 *   - sequence            gray, solid    — forward step within a lane
 *   - loop-confidence     orange, dashed — research#N → research#(N+1)
 *   - loop-revision       orange, dashed — review#N  → production#(N+1)
 *   - fanout-canonical    purple, solid  — canonical → production#1 per Track
 *   - fanout-publish      purple, solid  — preview   → publish per target
 *
 * Aborted Tracks are excluded entirely (the spec mandates they vanish from
 * the graph). Skipped stage_runs are kept as nodes — the renderer dashes
 * them based on status.
 */

import type { Stage, StageRunStatus } from '@brighttale/shared/pipeline/inputs';
import type { Track } from './fan-out-planner';
import type { PublishTarget } from './publish-target-resolver';

export interface RunNode {
  id: string;
  stage: Stage;
  status: StageRunStatus;
  trackId: string | null;
  publishTargetId: string | null;
  attemptNo: number;
}

export type GraphLane = 'shared' | 'track' | 'publish';

export type GraphEdgeKind =
  | 'sequence'
  | 'loop-confidence'
  | 'loop-revision'
  | 'fanout-canonical'
  | 'fanout-publish';

export interface GraphNode {
  id: string;
  stage: Stage;
  status: StageRunStatus;
  attemptNo: number;
  trackId: string | null;
  publishTargetId: string | null;
  lane: GraphLane;
  label: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: GraphEdgeKind;
}

export interface BuildGraphInput {
  stageRuns: RunNode[];
  tracks: Track[];
  publishTargets: PublishTarget[];
}

export interface GraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function laneOf(run: RunNode): GraphLane {
  if (run.publishTargetId) return 'publish';
  if (run.trackId) return 'track';
  return 'shared';
}

function labelOf(run: RunNode): string {
  return `${run.stage} #${run.attemptNo}`;
}

function toNode(run: RunNode): GraphNode {
  return {
    id: run.id,
    stage: run.stage,
    status: run.status,
    attemptNo: run.attemptNo,
    trackId: run.trackId,
    publishTargetId: run.publishTargetId,
    lane: laneOf(run),
    label: labelOf(run),
  };
}

function byAttemptAsc(a: RunNode, b: RunNode): number {
  return a.attemptNo - b.attemptNo;
}

function edgeId(from: string, to: string, kind: GraphEdgeKind): string {
  return `${kind}:${from}->${to}`;
}

export function buildGraph(input: BuildGraphInput): GraphResult {
  const { stageRuns, tracks, publishTargets } = input;

  const activeTrackIds = new Set(
    tracks.filter((t) => t.status !== 'aborted').map((t) => t.id),
  );

  // Filter: drop runs belonging to aborted Tracks. Shared runs (trackId=null)
  // and Publish runs (their trackId is always set) follow the same rule.
  const runs = stageRuns.filter(
    (r) => r.trackId === null || activeTrackIds.has(r.trackId),
  );

  const nodes: GraphNode[] = runs.map(toNode);
  const edges: GraphEdge[] = [];

  // ── Shared lane: brainstorm → research → canonical ─────────────────────
  const shared = runs.filter((r) => r.trackId === null);
  const sharedByStage: Partial<Record<Stage, RunNode[]>> = {};
  for (const r of shared) {
    (sharedByStage[r.stage] ??= []).push(r);
  }
  for (const stage of Object.keys(sharedByStage) as Stage[]) {
    sharedByStage[stage]!.sort(byAttemptAsc);
  }

  const brainstormAttempts = sharedByStage.brainstorm ?? [];
  const researchAttempts = sharedByStage.research ?? [];
  const canonicalAttempts = sharedByStage.canonical ?? [];

  // Brainstorm internal attempts are sequence edges (no loop semantics yet —
  // brainstorm doesn't have a confidence/revision loop). Forward steps only.
  for (let i = 1; i < brainstormAttempts.length; i += 1) {
    const from = brainstormAttempts[i - 1];
    const to = brainstormAttempts[i];
    edges.push({ id: edgeId(from.id, to.id, 'sequence'), from: from.id, to: to.id, kind: 'sequence' });
  }

  // Brainstorm last attempt → research#1
  if (brainstormAttempts.length > 0 && researchAttempts.length > 0) {
    const from = brainstormAttempts[brainstormAttempts.length - 1];
    const to = researchAttempts[0];
    edges.push({ id: edgeId(from.id, to.id, 'sequence'), from: from.id, to: to.id, kind: 'sequence' });
  }

  // Research attempts: loop-confidence edges between consecutive attempts.
  for (let i = 1; i < researchAttempts.length; i += 1) {
    const from = researchAttempts[i - 1];
    const to = researchAttempts[i];
    edges.push({
      id: edgeId(from.id, to.id, 'loop-confidence'),
      from: from.id,
      to: to.id,
      kind: 'loop-confidence',
    });
  }

  // Last research attempt → canonical#1
  if (researchAttempts.length > 0 && canonicalAttempts.length > 0) {
    const from = researchAttempts[researchAttempts.length - 1];
    const to = canonicalAttempts[0];
    edges.push({ id: edgeId(from.id, to.id, 'sequence'), from: from.id, to: to.id, kind: 'sequence' });
  }

  // Canonical internal attempts as sequence (no defined loop semantics).
  for (let i = 1; i < canonicalAttempts.length; i += 1) {
    const from = canonicalAttempts[i - 1];
    const to = canonicalAttempts[i];
    edges.push({ id: edgeId(from.id, to.id, 'sequence'), from: from.id, to: to.id, kind: 'sequence' });
  }

  // ── Fan-out: canonical → production#1 per active Track ─────────────────
  const lastCanonical = canonicalAttempts[canonicalAttempts.length - 1];
  if (lastCanonical) {
    for (const track of tracks) {
      if (track.status === 'aborted') continue;
      const trackRuns = runs.filter((r) => r.trackId === track.id);
      const production1 = trackRuns
        .filter((r) => r.stage === 'production')
        .sort(byAttemptAsc)[0];
      if (!production1) continue;
      edges.push({
        id: edgeId(lastCanonical.id, production1.id, 'fanout-canonical'),
        from: lastCanonical.id,
        to: production1.id,
        kind: 'fanout-canonical',
      });
    }
  }

  // ── Per-Track lane: production ↔ review (with revision loop) → assets → preview → publish ──
  for (const track of tracks) {
    if (track.status === 'aborted') continue;
    const trackRuns = runs.filter((r) => r.trackId === track.id && r.publishTargetId === null);
    const byStage: Partial<Record<Stage, RunNode[]>> = {};
    for (const r of trackRuns) {
      (byStage[r.stage] ??= []).push(r);
    }
    for (const stage of Object.keys(byStage) as Stage[]) {
      byStage[stage]!.sort(byAttemptAsc);
    }

    const production = byStage.production ?? [];
    const review = byStage.review ?? [];
    const assets = byStage.assets ?? [];
    const preview = byStage.preview ?? [];

    // production#N → review#N (sequence). The revision loop pairs them by
    // attemptNo: P1↔R1, P2↔R2, …
    const pairs = Math.min(production.length, review.length);
    for (let i = 0; i < pairs; i += 1) {
      const p = production[i];
      const r = review[i];
      edges.push({ id: edgeId(p.id, r.id, 'sequence'), from: p.id, to: r.id, kind: 'sequence' });
    }

    // review#N → production#(N+1) (loop-revision back-edge)
    const loops = Math.min(review.length, production.length - 1);
    for (let i = 0; i < loops; i += 1) {
      const r = review[i];
      const pNext = production[i + 1];
      edges.push({
        id: edgeId(r.id, pNext.id, 'loop-revision'),
        from: r.id,
        to: pNext.id,
        kind: 'loop-revision',
      });
    }

    // Last review attempt → assets#1
    const lastReview = review[review.length - 1];
    const firstAssets = assets[0];
    if (lastReview && firstAssets) {
      edges.push({
        id: edgeId(lastReview.id, firstAssets.id, 'sequence'),
        from: lastReview.id,
        to: firstAssets.id,
        kind: 'sequence',
      });
    }

    // Internal sequence within assets / preview attempts
    for (let i = 1; i < assets.length; i += 1) {
      const from = assets[i - 1];
      const to = assets[i];
      edges.push({ id: edgeId(from.id, to.id, 'sequence'), from: from.id, to: to.id, kind: 'sequence' });
    }
    for (let i = 1; i < preview.length; i += 1) {
      const from = preview[i - 1];
      const to = preview[i];
      edges.push({ id: edgeId(from.id, to.id, 'sequence'), from: from.id, to: to.id, kind: 'sequence' });
    }

    // Last assets attempt → preview#1
    const lastAssets = assets[assets.length - 1];
    const firstPreview = preview[0];
    if (lastAssets && firstPreview) {
      edges.push({
        id: edgeId(lastAssets.id, firstPreview.id, 'sequence'),
        from: lastAssets.id,
        to: firstPreview.id,
        kind: 'sequence',
      });
    }

    // ── Fan-out: preview → publish per publish_target ───────────────────
    const lastPreview = preview[preview.length - 1];
    if (lastPreview) {
      const publishRuns = runs.filter(
        (r) => r.trackId === track.id && r.stage === 'publish',
      );
      // Group publish attempts by target so multiple attempts of the same
      // target still produce just one fan-out edge from preview → publish#1.
      const publishByTarget = new Map<string, RunNode[]>();
      for (const pr of publishRuns) {
        if (!pr.publishTargetId) continue;
        const list = publishByTarget.get(pr.publishTargetId) ?? [];
        list.push(pr);
        publishByTarget.set(pr.publishTargetId, list);
      }
      for (const target of publishTargets) {
        const attempts = publishByTarget.get(target.id);
        if (!attempts || attempts.length === 0) continue;
        attempts.sort(byAttemptAsc);
        const first = attempts[0];
        edges.push({
          id: edgeId(lastPreview.id, first.id, 'fanout-publish'),
          from: lastPreview.id,
          to: first.id,
          kind: 'fanout-publish',
        });
        // Sequence edges between successive attempts of the same target
        for (let i = 1; i < attempts.length; i += 1) {
          const from = attempts[i - 1];
          const to = attempts[i];
          edges.push({
            id: edgeId(from.id, to.id, 'sequence'),
            from: from.id,
            to: to.id,
            kind: 'sequence',
          });
        }
      }
    }
  }

  return { nodes, edges };
}
