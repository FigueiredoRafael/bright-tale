'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type EdgeMarkerType,
} from '@xyflow/react';
import { useRouter } from 'next/navigation';
import type { Stage, StageRunStatus } from '@brighttale/shared/pipeline/inputs';

// ─── Types exported for tests ────────────────────────────────────────────────

export type GraphLane = 'shared' | 'track' | 'publish';

export type GraphEdgeKind =
  | 'sequence'
  | 'loop-confidence'
  | 'loop-revision'
  | 'fanout-canonical'
  | 'fanout-publish';

export interface GraphNodeData extends Record<string, unknown> {
  stage: Stage;
  status: StageRunStatus;
  attemptNo: number;
  trackId: string | null;
  publishTargetId: string | null;
  lane: GraphLane;
  label: string;
}

// Use xyflow's Node generic with our data shape
export type GraphNode = Node<GraphNodeData, string>;

// Use xyflow's Edge generic — data is empty here, we only use top-level fields
export type GraphEdge = Edge<Record<string, unknown>, string> & {
  markerEnd?: EdgeMarkerType;
};

// ─── API response shape from graph-builder ───────────────────────────────────

interface ApiGraphNode {
  id: string;
  stage: Stage;
  status: StageRunStatus;
  attemptNo: number;
  trackId: string | null;
  publishTargetId: string | null;
  lane: GraphLane;
  label: string;
}

interface ApiGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: GraphEdgeKind;
}

interface ApiGraphResult {
  nodes: ApiGraphNode[];
  edges: ApiGraphEdge[];
}

// ─── Layout constants ─────────────────────────────────────────────────────────
// Each lane occupies a horizontal band. Nodes are placed left-to-right
// within their lane, sorted by the order they appear in the API response.

const LANE_Y: Record<GraphLane, number> = {
  shared: 80,
  track: 280,
  publish: 480,
};

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const H_GAP = 40;

// ─── Node type → ReactFlow custom type ───────────────────────────────────────

function nodeTypeForApiNode(
  node: ApiGraphNode,
  stageAttemptCounts: Map<string, number>,
): string {
  if (node.lane === 'publish') return 'publishTargetNode';
  // key: stage + trackId (nullable) to distinguish shared vs per-track stages
  const key = `${node.lane}:${node.stage}:${node.trackId ?? 'null'}`;
  const minAttempt = stageAttemptCounts.get(key) ?? 1;
  if (node.attemptNo > minAttempt) return 'attemptMiniNode';
  return 'stageNode';
}

// ─── Edge kind → ReactFlow type / style ──────────────────────────────────────

function edgeTypeForKind(kind: GraphEdgeKind): string {
  if (kind === 'sequence') return 'sequenceEdge';
  if (kind === 'loop-confidence' || kind === 'loop-revision') return 'loopEdge';
  return 'fanoutEdge'; // fanout-canonical | fanout-publish
}

// ─── Transform API response → ReactFlow nodes + edges ────────────────────────

function toFlowNodes(apiNodes: ApiGraphNode[]): GraphNode[] {
  // Build per-lane counters for x-position
  const laneCounters: Record<GraphLane, number> = { shared: 0, track: 0, publish: 0 };

  // Compute the minimum attemptNo per (lane:stage:trackId) group so we can
  // decide whether a node should be stageNode or attemptMiniNode.
  const stageAttemptCounts = new Map<string, number>();
  for (const n of apiNodes) {
    const key = `${n.lane}:${n.stage}:${n.trackId ?? 'null'}`;
    const cur = stageAttemptCounts.get(key);
    if (cur === undefined || n.attemptNo < cur) {
      stageAttemptCounts.set(key, n.attemptNo);
    }
  }

  return apiNodes.map((n) => {
    const col = laneCounters[n.lane]++;
    return {
      id: n.id,
      type: nodeTypeForApiNode(n, stageAttemptCounts),
      position: {
        x: col * (NODE_WIDTH + H_GAP),
        y: LANE_Y[n.lane],
      },
      data: {
        stage: n.stage,
        status: n.status,
        attemptNo: n.attemptNo,
        trackId: n.trackId,
        publishTargetId: n.publishTargetId,
        lane: n.lane,
        label: n.label,
      },
    };
  });
}

function toFlowEdges(apiEdges: ApiGraphEdge[]): GraphEdge[] {
  return apiEdges.map((e) => {
    const type = edgeTypeForKind(e.kind);
    const isLoop = type === 'loopEdge';
    const isFanout = type === 'fanoutEdge';

    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type,
      animated: isLoop,
      style: {
        stroke: isLoop ? '#f97316' : isFanout ? '#a855f7' : '#9ca3af',
        strokeDasharray: isLoop ? '6 3' : undefined,
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isLoop ? '#f97316' : isFanout ? '#a855f7' : '#9ca3af',
      },
    };
  });
}

// ─── Custom node components ───────────────────────────────────────────────────

const STATUS_COLOR: Record<StageRunStatus, string> = {
  queued: 'bg-gray-100 text-gray-600 border-gray-300',
  running: 'bg-blue-50 text-blue-700 border-blue-400',
  awaiting_user: 'bg-yellow-50 text-yellow-700 border-yellow-400',
  completed: 'bg-green-50 text-green-700 border-green-400',
  failed: 'bg-red-50 text-red-700 border-red-400',
  aborted: 'bg-gray-100 text-gray-400 border-dashed border-gray-300 opacity-60',
  skipped: 'bg-gray-100 text-gray-400 border-dashed border-gray-300',
};

// Exported for testing (T9.F154 — aborted node visual assertions)
export function StageNode({ data }: { data: GraphNodeData }) {
  const color = STATUS_COLOR[data.status] ?? 'bg-gray-100 text-gray-600 border-gray-300';
  const isAborted = data.status === 'aborted';
  return (
    <div
      data-status={isAborted ? 'aborted' : undefined}
      data-testid={isAborted ? `graph-node-aborted-${data.trackId ?? 'shared'}` : undefined}
      className={`rounded border px-3 py-2 text-xs font-medium shadow-sm ${color}`}
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="font-semibold capitalize">{data.stage}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide opacity-70">{data.status}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function AttemptMiniNode({ data }: { data: GraphNodeData }) {
  const color = STATUS_COLOR[data.status] ?? 'bg-gray-100 text-gray-600 border-gray-300';
  return (
    <div
      className={`rounded border px-2 py-1 text-[10px] font-medium shadow-sm ${color}`}
      style={{ width: 100, minHeight: 36 }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="opacity-70">#{data.attemptNo}</div>
      <div className="capitalize opacity-90">{data.status}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function PublishTargetNode({ data }: { data: GraphNodeData }) {
  const color = STATUS_COLOR[data.status] ?? 'bg-gray-100 text-gray-600 border-gray-300';
  return (
    <div
      className={`rounded-full border px-3 py-2 text-[10px] font-semibold shadow ${color}`}
      style={{ width: 120, minHeight: 40, textAlign: 'center' }}
    >
      <Handle type="target" position={Position.Left} />
      <div>publish</div>
      <div className="mt-0.5 uppercase tracking-wide opacity-60">{data.status}</div>
    </div>
  );
}

const NODE_TYPES = {
  stageNode: StageNode,
  attemptMiniNode: AttemptMiniNode,
  publishTargetNode: PublishTargetNode,
};

// ─── Lane background labels ───────────────────────────────────────────────────

const LANE_LABELS: { key: GraphLane; label: string }[] = [
  { key: 'shared', label: 'Shared' },
  { key: 'track', label: 'Track' },
  { key: 'publish', label: 'Publish' },
];

// ─── GraphView ────────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
}

export function GraphView({ projectId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<GraphEdge>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/graph`);
        const envelope = (await res.json()) as {
          data: ApiGraphResult | null;
          error: { message: string } | null;
        };
        if (cancelled) return;
        if (envelope.error) {
          setErrorMessage(envelope.error.message);
        } else if (!envelope.data) {
          setErrorMessage('No graph data returned');
        } else {
          setNodes(toFlowNodes(envelope.data.nodes));
          setEdges(toFlowEdges(envelope.data.edges));
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_event: unknown, node: unknown) => {
      const n = node as GraphNode;
      const params = new URLSearchParams();
      params.set('view', 'focus');
      params.set('stage', n.data.stage);
      if (n.data.trackId) params.set('track', n.data.trackId);
      if (n.data.publishTargetId) params.set('target', n.data.publishTargetId);
      if (n.data.attemptNo > 1) params.set('attempt', String(n.data.attemptNo));
      router.push(`/projects/${projectId}?${params.toString()}`);
    },
    [projectId, router],
  );

  if (loading) {
    return (
      <div data-testid="graph-view-loading" className="flex h-64 items-center justify-center text-sm text-gray-500">
        Loading graph…
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div data-testid="graph-view-error" className="flex h-64 items-center justify-center text-sm text-red-600">
        {errorMessage}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* Lane background labels */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {LANE_LABELS.map(({ key, label }) => (
          <div
            key={key}
            data-testid={`lane-label-${key}`}
            className="absolute left-4 text-[10px] font-semibold uppercase tracking-widest text-gray-400"
            style={{ top: LANE_Y[key] - 20 }}
          >
            {label}
          </div>
        ))}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap />
        <Controls />
        <Background variant={BackgroundVariant.Dots} />
      </ReactFlow>
    </div>
  );
}
