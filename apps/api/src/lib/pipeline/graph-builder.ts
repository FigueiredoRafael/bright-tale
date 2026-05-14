/**
 * graph-builder.ts
 *
 * Pure function that converts raw pipeline data (stage_runs, tracks,
 * publish_targets) into a React Flow–compatible node/edge graph for the
 * DAG view (Shape D in the UX spec, T4.3).
 *
 * Refs: T1.12 / GitHub issue #36
 */

import {
  STAGES,
  STAGE_LABELS,
  type Stage,
  type AnyStage,
  type StageRun,
  type StageRunStatus,
} from '@brighttale/shared/pipeline/inputs';

// ─── Domain types for graph inputs ───────────────────────────────────────────

export interface Track {
  id: string;
  projectId: string;
  medium: string;
  status: string;
  paused: boolean;
  autopilotConfigJson: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface PublishTarget {
  id: string;
  displayName: string;
  type: string;
  isActive: boolean;
  channelId: string | null;
  orgId: string | null;
  configJson: unknown;
  createdAt: string;
  updatedAt: string;
}

// ─── Graph output types ───────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  type: 'stage' | 'attempt' | 'publish_target';
  data: {
    stage?: AnyStage;
    trackId?: string | null;
    publishTargetId?: string | null;
    status?: StageRunStatus;
    attemptNo?: number;
    label?: string;
    score?: number | null;
    confidence?: number | null;
    /** When true, the node should render with a dashed border (skipped stage). */
    dashed?: boolean;
  };
  position: { x: number; y: number };
}

export type GraphEdgeType = 'sequence' | 'loop' | 'fanout' | 'attempt';

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
  data?: { loopType?: 'confidence' | 'revision' };
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const ATTEMPT_HEIGHT = 40;
const H_GAP = 40;
const V_GAP = 80;
const LANE_GAP = 120;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Canonical stage order (index) — used for horizontal positioning. */
const STAGE_INDEX: Record<AnyStage, number> = Object.fromEntries(
  STAGES.map((s, i) => [s, i]),
) as Record<AnyStage, number>;

// draft is legacy; assign it the same x slot as 'canonical' (index 2)
STAGE_INDEX['draft'] = 2;

/** Stages that fan-out from the shared lane into per-track lanes. */
const PER_TRACK_STAGES: ReadonlySet<AnyStage> = new Set<AnyStage>([
  'production',
  'review',
  'assets',
]);

/** Stages that fan-out from per-track lanes into per-publish-target nodes. */
const PER_TARGET_STAGES: ReadonlySet<AnyStage> = new Set<AnyStage>([
  'preview',
  'publish',
]);

/** Stages that live in the shared (project-level) lane. */
const SHARED_STAGES: ReadonlySet<AnyStage> = new Set<AnyStage>([
  'brainstorm',
  'research',
  'canonical',
  'draft', // legacy
]);

/**
 * Determine the lane index for a stage run.
 * - Shared stages → lane 0
 * - Per-track stages → lane 1 + trackIndex
 * - Per-target stages → same lane as their track (or 1 if no track)
 */
function laneFor(
  run: StageRun,
  trackOrder: string[],
): number {
  if (SHARED_STAGES.has(run.stage)) return 0;
  if (run.trackId === null) return 1; // fallback: first track lane
  const idx = trackOrder.indexOf(run.trackId);
  return idx >= 0 ? idx + 1 : 1;
}

/** Build a deterministic node id for a stage-level node. */
function stageNodeId(stage: AnyStage, trackId: string | null, publishTargetId: string | null): string {
  const parts = ['node', stage];
  if (trackId) parts.push(`t:${trackId}`);
  if (publishTargetId) parts.push(`pt:${publishTargetId}`);
  return parts.join('|');
}

/** Build a deterministic node id for an attempt mini-node. */
function attemptNodeId(stage: AnyStage, trackId: string | null, publishTargetId: string | null, attemptNo: number): string {
  return `${stageNodeId(stage, trackId, publishTargetId)}|a:${attemptNo}`;
}

/** Human-readable label for a stage node. */
function labelFor(stage: AnyStage, track: Track | undefined, publishTarget: PublishTarget | undefined): string {
  const base = STAGE_LABELS[stage] ?? stage;
  if (publishTarget) return `${base} › ${publishTarget.displayName}`;
  if (track) return `${base} › ${track.medium}`;
  return base;
}

/**
 * Determine whether a stage run's most-recent-attempt status warrants a
 * visible attempt mini-node (attempt > 1 or a non-success terminal status).
 */
function needsAttemptNode(run: StageRun): boolean {
  return (
    run.attemptNo > 1 ||
    run.status === 'failed' ||
    run.status === 'aborted'
  );
}

/** Extract a numeric score/confidence from an attempt's outcomeJson. */
function extractScore(outcomeJson: unknown): { score: number | null; confidence: number | null } {
  if (outcomeJson === null || typeof outcomeJson !== 'object') {
    return { score: null, confidence: null };
  }
  const obj = outcomeJson as Record<string, unknown>;
  const score = typeof obj['score'] === 'number' ? obj['score'] : null;
  const confidence = typeof obj['confidence'] === 'number' ? obj['confidence'] : null;
  return { score, confidence };
}

// ─── Core builder ─────────────────────────────────────────────────────────────

export function buildGraph(
  stageRuns: StageRun[],
  tracks: Track[],
  publishTargets: PublishTarget[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  // --- Filter out aborted tracks entirely ---
  const activeTrackIds = new Set(
    tracks.filter((t) => t.status !== 'aborted').map((t) => t.id),
  );

  // Deterministic track order: by createdAt then id
  const activeTracksSorted = tracks
    .filter((t) => t.status !== 'aborted')
    .sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1,
    );
  const trackOrder = activeTracksSorted.map((t) => t.id);

  const trackById = new Map<string, Track>(tracks.map((t) => [t.id, t]));
  const publishTargetById = new Map<string, PublishTarget>(publishTargets.map((pt) => [pt.id, pt]));

  // Filter out stage runs that belong to aborted tracks
  const activeRuns = stageRuns.filter(
    (r) => r.trackId === null || activeTrackIds.has(r.trackId),
  );

  // --- Group runs by (stage, trackId, publishTargetId) ---
  // Key = stageNodeId
  const groupMap = new Map<string, StageRun[]>();
  for (const run of activeRuns) {
    const key = stageNodeId(run.stage, run.trackId, run.publishTargetId);
    const group = groupMap.get(key);
    if (group) {
      group.push(run);
    } else {
      groupMap.set(key, [run]);
    }
  }

  // --- Compute y (vertical) offset per lane ---
  const totalLanes = 1 + activeTracksSorted.length;
  const laneY = (laneIdx: number): number =>
    laneIdx * (NODE_HEIGHT + LANE_GAP);

  // --- Compute x (horizontal) position for a stage ---
  const stageX = (stage: AnyStage): number =>
    (STAGE_INDEX[stage] ?? 0) * (NODE_WIDTH + H_GAP);

  // --- Build stage-level nodes ---
  // Track which (stage, lane) combinations have been created
  // to correctly build sequence edges later.
  const createdNodeIds = new Set<string>();

  // Collect unique (stage, trackId, publishTargetId) tuples from active runs
  // plus add "skipped" placeholder nodes for stages that have no runs
  // in the shared lane.
  const seenKeys = new Set<string>();
  for (const [key, runs] of groupMap) {
    seenKeys.add(key);
    const rep = runs.reduce((a, b) => (a.attemptNo > b.attemptNo ? a : b));
    const lane = laneFor(rep, trackOrder);
    const x = stageX(rep.stage);
    const y = laneY(lane);
    const track = rep.trackId ? trackById.get(rep.trackId) : undefined;
    const target = rep.publishTargetId ? publishTargetById.get(rep.publishTargetId) : undefined;

    const node: GraphNode = {
      id: key,
      type: 'stage',
      data: {
        stage: rep.stage,
        trackId: rep.trackId,
        publishTargetId: rep.publishTargetId,
        status: rep.status,
        label: labelFor(rep.stage, track, target),
        dashed: rep.status === 'skipped',
        ...extractScore(rep.outcomeJson),
      },
      position: { x, y },
    };
    nodes.push(node);
    createdNodeIds.add(key);

    // --- Attempt mini-nodes for this group ---
    // Sort attempts by attemptNo ascending for deterministic ordering
    const attemptsNeedingNodes = runs
      .filter((r) => needsAttemptNode(r))
      .sort((a, b) => a.attemptNo - b.attemptNo);

    let prevAttemptId: string | null = null;
    for (const attempt of attemptsNeedingNodes) {
      const aId = attemptNodeId(attempt.stage, attempt.trackId, attempt.publishTargetId, attempt.attemptNo);
      const aNode: GraphNode = {
        id: aId,
        type: 'attempt',
        data: {
          stage: attempt.stage,
          trackId: attempt.trackId,
          publishTargetId: attempt.publishTargetId,
          status: attempt.status,
          attemptNo: attempt.attemptNo,
          label: `Attempt ${attempt.attemptNo}`,
          ...extractScore(attempt.outcomeJson),
        },
        position: {
          x: x + NODE_WIDTH + 10,
          y: y + attempt.attemptNo * (ATTEMPT_HEIGHT + 8),
        },
      };
      nodes.push(aNode);

      if (prevAttemptId !== null) {
        const eId = `e|attempt|${prevAttemptId}→${aId}`;
        if (!edgeSet.has(eId)) {
          edgeSet.add(eId);
          edges.push({ id: eId, source: prevAttemptId, target: aId, type: 'attempt' });
        }
      }
      prevAttemptId = aId;
    }
  }

  // --- Add skipped-placeholder nodes for shared stages with no runs ---
  for (const stage of SHARED_STAGES) {
    if (stage === 'draft') continue; // legacy, skip
    const key = stageNodeId(stage as Stage, null, null);
    if (!seenKeys.has(key)) {
      const x = stageX(stage);
      const y = laneY(0);
      const node: GraphNode = {
        id: key,
        type: 'stage',
        data: {
          stage: stage as Stage,
          trackId: null,
          publishTargetId: null,
          label: STAGE_LABELS[stage as Stage],
          dashed: true,
        },
        position: { x, y },
      };
      nodes.push(node);
      createdNodeIds.add(key);
    }
  }

  // --- Build sequence edges between consecutive shared-lane stages ---
  // Shared stage sequence: brainstorm → research → canonical
  const sharedSequence: Stage[] = ['brainstorm', 'research', 'canonical'];
  for (let i = 0; i < sharedSequence.length - 1; i++) {
    const src = stageNodeId(sharedSequence[i], null, null);
    const tgt = stageNodeId(sharedSequence[i + 1], null, null);
    if (createdNodeIds.has(src) && createdNodeIds.has(tgt)) {
      const eId = `e|seq|${src}→${tgt}`;
      if (!edgeSet.has(eId)) {
        edgeSet.add(eId);
        edges.push({ id: eId, source: src, target: tgt, type: 'sequence' });
      }
    }
  }

  // Per-track sequence: production → review → assets
  const trackSequence: Stage[] = ['production', 'review', 'assets'];
  for (const trackId of trackOrder) {
    for (let i = 0; i < trackSequence.length - 1; i++) {
      const src = stageNodeId(trackSequence[i], trackId, null);
      const tgt = stageNodeId(trackSequence[i + 1], trackId, null);
      if (createdNodeIds.has(src) && createdNodeIds.has(tgt)) {
        const eId = `e|seq|${src}→${tgt}`;
        if (!edgeSet.has(eId)) {
          edgeSet.add(eId);
          edges.push({ id: eId, source: src, target: tgt, type: 'sequence' });
        }
      }
    }
  }

  // --- Fanout edges: canonical → production of each track ---
  const canonicalNodeId = stageNodeId('canonical', null, null);
  if (createdNodeIds.has(canonicalNodeId)) {
    for (const trackId of trackOrder) {
      const prodNodeId = stageNodeId('production', trackId, null);
      if (createdNodeIds.has(prodNodeId)) {
        const eId = `e|fanout|${canonicalNodeId}→${prodNodeId}`;
        if (!edgeSet.has(eId)) {
          edgeSet.add(eId);
          edges.push({ id: eId, source: canonicalNodeId, target: prodNodeId, type: 'fanout' });
        }
      }
    }
  }

  // --- Fanout edges: preview → publish of each target ---
  // Collect unique publish targets actually referenced in runs
  const targetIds = new Set<string>(
    activeRuns
      .filter((r) => r.publishTargetId !== null)
      .map((r) => r.publishTargetId as string),
  );

  for (const [key, runs] of groupMap) {
    const rep = runs[0];
    if (rep.stage !== 'preview') continue;
    // preview → publish for each publish_target that shares the same trackId
    const previewNodeId = key;
    if (!createdNodeIds.has(previewNodeId)) continue;

    for (const targetId of targetIds) {
      const publishNodeId = stageNodeId('publish', rep.trackId, targetId);
      if (createdNodeIds.has(publishNodeId)) {
        const eId = `e|fanout|${previewNodeId}→${publishNodeId}`;
        if (!edgeSet.has(eId)) {
          edgeSet.add(eId);
          edges.push({ id: eId, source: previewNodeId, target: publishNodeId, type: 'fanout' });
        }
      }
    }
  }

  // --- Loop edges ---

  // Research self-loop (confidence loop): research → research
  const researchNodeId = stageNodeId('research', null, null);
  if (createdNodeIds.has(researchNodeId)) {
    const researchRuns = activeRuns.filter((r) => r.stage === 'research' && r.trackId === null);
    const maxAttempt = Math.max(...researchRuns.map((r) => r.attemptNo), 0);
    if (maxAttempt > 1) {
      const eId = `e|loop|confidence|${researchNodeId}`;
      if (!edgeSet.has(eId)) {
        edgeSet.add(eId);
        edges.push({
          id: eId,
          source: researchNodeId,
          target: researchNodeId,
          type: 'loop',
          data: { loopType: 'confidence' },
        });
      }
    }
  }

  // Review → Production back-edge (revision loop) — per track
  for (const trackId of trackOrder) {
    const reviewNodeId = stageNodeId('review', trackId, null);
    const prodNodeId = stageNodeId('production', trackId, null);
    if (createdNodeIds.has(reviewNodeId) && createdNodeIds.has(prodNodeId)) {
      const reviewRuns = activeRuns.filter((r) => r.stage === 'review' && r.trackId === trackId);
      const prodRuns = activeRuns.filter((r) => r.stage === 'production' && r.trackId === trackId);
      // Revision loop exists if review has multiple attempts OR production was
      // re-run after a review (max productionAttempt > 1 with review runs present).
      const maxReviewAttempt = Math.max(...reviewRuns.map((r) => r.attemptNo), 0);
      const maxProdAttempt = Math.max(...prodRuns.map((r) => r.attemptNo), 0);
      if (maxReviewAttempt > 1 || maxProdAttempt > 1) {
        const eId = `e|loop|revision|${reviewNodeId}→${prodNodeId}`;
        if (!edgeSet.has(eId)) {
          edgeSet.add(eId);
          edges.push({
            id: eId,
            source: reviewNodeId,
            target: prodNodeId,
            type: 'loop',
            data: { loopType: 'revision' },
          });
        }
      }
    }
  }

  // --- assets → preview sequence edges (per-track to per-target) ---
  // Determine preview nodes: they may have a trackId but no publishTargetId
  for (const trackId of trackOrder) {
    const assetsNodeId = stageNodeId('assets', trackId, null);
    // Find preview runs for this track
    const previewRuns = activeRuns.filter(
      (r) => r.stage === 'preview' && r.trackId === trackId,
    );
    for (const pr of previewRuns) {
      const previewId = stageNodeId('preview', pr.trackId, pr.publishTargetId);
      if (createdNodeIds.has(assetsNodeId) && createdNodeIds.has(previewId)) {
        const eId = `e|seq|${assetsNodeId}→${previewId}`;
        if (!edgeSet.has(eId)) {
          edgeSet.add(eId);
          edges.push({ id: eId, source: assetsNodeId, target: previewId, type: 'sequence' });
        }
      }
    }
  }

  // --- Preview → Publish fanout (collect by distinct publishTargetId per preview) ---
  for (const [key, runs] of groupMap) {
    const rep = runs[0];
    if (rep.stage !== 'publish' || rep.publishTargetId === null) continue;
    // find the matching preview node
    const previewId = stageNodeId('preview', rep.trackId, null);
    if (!createdNodeIds.has(previewId) || !createdNodeIds.has(key)) continue;
    const eId = `e|fanout|${previewId}→${key}`;
    if (!edgeSet.has(eId)) {
      edgeSet.add(eId);
      edges.push({ id: eId, source: previewId, target: key, type: 'fanout' });
    }
  }

  // Stable output order: sort nodes/edges deterministically
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { nodes, edges };
}
