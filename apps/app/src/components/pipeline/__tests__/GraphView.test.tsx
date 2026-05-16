/**
 * T4.3 — GraphView tests.
 *
 * Slices covered:
 *   1. Scaffold: fetches /api/projects/:id/graph, shows loader + error states
 *   2. Renders nodes from graph response via <ReactFlow />
 *   3. Custom node types: StageNode, AttemptMiniNode, PublishTargetNode
 *   4. Edge variant types: sequence, loop, fanout
 *   5. Controls / minimap / lane backgrounds
 *   6. Node click pushes URL state for Focus view
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
// ReactNode used below in ReactFlow mock children prop
import type { GraphNode, GraphEdge } from '@/components/pipeline/GraphView';

// ── Router mock ─────────────────────────────────────────────────────────────
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}));

// ── @xyflow/react mock ────────────────────────────────────────────────────────
// We render the wrapper and assert against props passed to <ReactFlow />
// rather than doing full DOM assertions against the canvas.
// useNodesState / useEdgesState use real React state so setNodes/setEdges
// from the component actually trigger re-renders.
let capturedNodes: GraphNode[] = [];
let capturedEdges: GraphEdge[] = [];
let capturedNodeTypes: Record<string, unknown> = {};
let capturedOnNodeClick: ((event: unknown, node: unknown) => void) | undefined;

vi.mock('@xyflow/react', () => {
  const ReactFlow = vi.fn(({ nodes, edges, nodeTypes, onNodeClick, children }: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    nodeTypes: Record<string, unknown>;
    onNodeClick: (event: unknown, node: unknown) => void;
    children?: ReactNode;
  }) => {
    capturedNodes = nodes ?? [];
    capturedEdges = edges ?? [];
    capturedNodeTypes = nodeTypes ?? {};
    capturedOnNodeClick = onNodeClick;
    return (
      <div data-testid="react-flow-root">
        {nodes?.map((n: GraphNode) => (
          <div key={n.id} data-testid={`node-${n.id}`} data-node-type={n.type} />
        ))}
        {edges?.map((e: GraphEdge) => (
          <div key={e.id} data-testid={`edge-${e.id}`} data-edge-type={e.type} />
        ))}
        {children}
      </div>
    );
  });

  // Use real React state so the component's setNodes/setEdges trigger re-renders
  const useNodesState = (init: GraphNode[]) => {
    const [nodes, setNodes] = useState<GraphNode[]>(init);
    return [nodes, setNodes, vi.fn()] as const;
  };
  const useEdgesState = (init: GraphEdge[]) => {
    const [edges, setEdges] = useState<GraphEdge[]>(init);
    return [edges, setEdges, vi.fn()] as const;
  };

  return {
    ReactFlow,
    MiniMap: vi.fn(() => <div data-testid="minimap" />),
    Controls: vi.fn(() => <div data-testid="controls" />),
    Background: vi.fn(() => <div data-testid="background" />),
    BackgroundVariant: { Dots: 'dots', Lines: 'lines', Cross: 'cross' },
    useNodesState,
    useEdgesState,
    Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
    Handle: vi.fn(() => null),
    MarkerType: { ArrowClosed: 'arrowclosed' },
  };
});

// ── Fixtures ────────────────────────────────────────────────────────────────
function makeGraphNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'node-1',
    type: 'stageNode',
    position: { x: 0, y: 0 },
    data: {
      stage: 'brainstorm',
      status: 'completed',
      attemptNo: 1,
      trackId: null,
      publishTargetId: null,
      lane: 'shared',
      label: 'brainstorm #1',
    },
    ...overrides,
  };
}

function makeGraphEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id: 'edge-1',
    source: 'node-1',
    target: 'node-2',
    type: 'sequenceEdge',
    ...overrides,
  };
}

const API_GRAPH_RESPONSE = {
  nodes: [
    {
      id: 'sr-1',
      stage: 'brainstorm',
      status: 'completed',
      attemptNo: 1,
      trackId: null,
      publishTargetId: null,
      lane: 'shared',
      label: 'brainstorm #1',
    },
    {
      id: 'sr-2',
      stage: 'research',
      status: 'running',
      attemptNo: 1,
      trackId: null,
      publishTargetId: null,
      lane: 'shared',
      label: 'research #1',
    },
    {
      id: 'sr-3',
      stage: 'research',
      status: 'completed',
      attemptNo: 1,
      trackId: null,
      publishTargetId: null,
      lane: 'shared',
      label: 'research #1',
    },
    {
      id: 'sr-4',
      stage: 'publish',
      status: 'completed',
      attemptNo: 1,
      trackId: 'track-1',
      publishTargetId: 'pt-1',
      lane: 'publish',
      label: 'publish #1',
    },
  ],
  edges: [
    { id: 'sequence:sr-1->sr-2', from: 'sr-1', to: 'sr-2', kind: 'sequence' },
    { id: 'loop-confidence:sr-2->sr-3', from: 'sr-2', to: 'sr-3', kind: 'loop-confidence' },
    { id: 'fanout-canonical:sr-3->sr-4', from: 'sr-3', to: 'sr-4', kind: 'fanout-canonical' },
  ],
};

// ── Fetch mock helpers ───────────────────────────────────────────────────────
function mockFetchOk() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: API_GRAPH_RESPONSE, error: null }),
  }));
}

function mockFetchError() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } }),
  }));
}

function mockFetchNetworkError() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));
}

// ── Import after mocks ───────────────────────────────────────────────────────
import { GraphView } from '../GraphView';

const PROJECT_ID = 'proj-abc';

beforeEach(() => {
  vi.clearAllMocks();
  capturedNodes = [];
  capturedEdges = [];
  capturedNodeTypes = {};
  capturedOnNodeClick = undefined;
  pushMock.mockReset();
});

// ────────────────────────────────────────────────────────────────────────────
// Slice 1 — Scaffold: fetch lifecycle
// ────────────────────────────────────────────────────────────────────────────
describe('GraphView — fetch lifecycle', () => {
  it('renders a loader while fetching', () => {
    // fetch never resolves
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    render(<GraphView projectId={PROJECT_ID} />);
    expect(screen.getByTestId('graph-view-loading')).toBeInTheDocument();
  });

  it('calls /api/projects/:id/graph on mount', async () => {
    mockFetchOk();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.queryByTestId('graph-view-loading')).not.toBeInTheDocument());
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/graph`);
  });

  it('renders an error message when the API returns an error envelope', async () => {
    mockFetchError();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('graph-view-error')).toBeInTheDocument());
    expect(screen.getByTestId('graph-view-error')).toHaveTextContent('Project not found');
  });

  it('renders an error message on network failure', async () => {
    mockFetchNetworkError();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('graph-view-error')).toBeInTheDocument());
    expect(screen.getByTestId('graph-view-error')).toHaveTextContent('Network failure');
  });

  it('renders the ReactFlow root after successful fetch', async () => {
    mockFetchOk();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Slice 2 — Nodes rendered from /graph endpoint
// ────────────────────────────────────────────────────────────────────────────
describe('GraphView — nodes from /graph endpoint', () => {
  it('passes transformed nodes to <ReactFlow />', async () => {
    mockFetchOk();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());
    // 4 nodes from API_GRAPH_RESPONSE
    expect(capturedNodes).toHaveLength(4);
  });

  it('passes transformed edges to <ReactFlow />', async () => {
    mockFetchOk();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());
    // 3 edges from API_GRAPH_RESPONSE
    expect(capturedEdges).toHaveLength(3);
  });

  it('assigns x/y positions to nodes', async () => {
    mockFetchOk();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());
    for (const node of capturedNodes) {
      expect(node.position).toBeDefined();
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Slice 3 — Custom node types
// ────────────────────────────────────────────────────────────────────────────
describe('GraphView — custom node types', () => {
  it('registers StageNode, AttemptMiniNode, and PublishTargetNode in nodeTypes', async () => {
    mockFetchOk();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());
    expect(capturedNodeTypes).toHaveProperty('stageNode');
    expect(capturedNodeTypes).toHaveProperty('attemptMiniNode');
    expect(capturedNodeTypes).toHaveProperty('publishTargetNode');
  });

  it('maps shared-lane nodes to stageNode type', async () => {
    mockFetchOk();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());
    const sharedNodes = capturedNodes.filter((n) => n.data.lane === 'shared');
    for (const node of sharedNodes) {
      expect(node.type).toBe('stageNode');
    }
  });

  it('maps publish-lane nodes to publishTargetNode type', async () => {
    mockFetchOk();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());
    const publishNodes = capturedNodes.filter((n) => n.data.lane === 'publish');
    expect(publishNodes.length).toBeGreaterThan(0);
    for (const node of publishNodes) {
      expect(node.type).toBe('publishTargetNode');
    }
  });

  it('maps nodes with attemptNo > 1 on the same stage to attemptMiniNode type', async () => {
    const multiAttemptResponse = {
      nodes: [
        { id: 'sr-1', stage: 'research', status: 'completed', attemptNo: 1, trackId: null, publishTargetId: null, lane: 'shared', label: 'research #1' },
        { id: 'sr-2', stage: 'research', status: 'completed', attemptNo: 2, trackId: null, publishTargetId: null, lane: 'shared', label: 'research #2' },
        { id: 'sr-3', stage: 'research', status: 'running', attemptNo: 3, trackId: null, publishTargetId: null, lane: 'shared', label: 'research #3' },
      ],
      edges: [
        { id: 'loop-confidence:sr-1->sr-2', from: 'sr-1', to: 'sr-2', kind: 'loop-confidence' },
        { id: 'loop-confidence:sr-2->sr-3', from: 'sr-2', to: 'sr-3', kind: 'loop-confidence' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: multiAttemptResponse, error: null }),
    }));
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());
    // Attempt 1 is stageNode (first/head), attempts 2+ are attemptMiniNode
    const attempt1 = capturedNodes.find((n) => n.id === 'sr-1');
    const attempt2 = capturedNodes.find((n) => n.id === 'sr-2');
    const attempt3 = capturedNodes.find((n) => n.id === 'sr-3');
    expect(attempt1?.type).toBe('stageNode');
    expect(attempt2?.type).toBe('attemptMiniNode');
    expect(attempt3?.type).toBe('attemptMiniNode');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Slice 4 — Edge variants
// ────────────────────────────────────────────────────────────────────────────
describe('GraphView — edge variants', () => {
  it('maps "sequence" kind to sequenceEdge type', async () => {
    mockFetchOk();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());
    const seqEdge = capturedEdges.find((e) => e.id === 'sequence:sr-1->sr-2');
    expect(seqEdge?.type).toBe('sequenceEdge');
  });

  it('maps "loop-confidence" kind to loopEdge type', async () => {
    mockFetchOk();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());
    const loopEdge = capturedEdges.find((e) => e.id === 'loop-confidence:sr-2->sr-3');
    expect(loopEdge?.type).toBe('loopEdge');
  });

  it('maps "fanout-canonical" kind to fanoutEdge type', async () => {
    mockFetchOk();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());
    const fanoutEdge = capturedEdges.find((e) => e.id === 'fanout-canonical:sr-3->sr-4');
    expect(fanoutEdge?.type).toBe('fanoutEdge');
  });

  it('maps "loop-revision" kind to loopEdge type', async () => {
    const revisionResponse = {
      nodes: [
        { id: 'sr-1', stage: 'production', status: 'completed', attemptNo: 1, trackId: 'track-1', publishTargetId: null, lane: 'track', label: 'production #1' },
        { id: 'sr-2', stage: 'production', status: 'completed', attemptNo: 2, trackId: 'track-1', publishTargetId: null, lane: 'track', label: 'production #2' },
      ],
      edges: [
        { id: 'loop-revision:sr-1->sr-2', from: 'sr-1', to: 'sr-2', kind: 'loop-revision' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: revisionResponse, error: null }),
    }));
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());
    const revEdge = capturedEdges.find((e) => e.id === 'loop-revision:sr-1->sr-2');
    expect(revEdge?.type).toBe('loopEdge');
  });

  it('maps "fanout-publish" kind to fanoutEdge type', async () => {
    const fanoutPublishResponse = {
      nodes: [
        { id: 'sr-1', stage: 'preview', status: 'completed', attemptNo: 1, trackId: 'track-1', publishTargetId: null, lane: 'track', label: 'preview #1' },
        { id: 'sr-2', stage: 'publish', status: 'completed', attemptNo: 1, trackId: 'track-1', publishTargetId: 'pt-1', lane: 'publish', label: 'publish #1' },
      ],
      edges: [
        { id: 'fanout-publish:sr-1->sr-2', from: 'sr-1', to: 'sr-2', kind: 'fanout-publish' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: fanoutPublishResponse, error: null }),
    }));
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());
    const fpEdge = capturedEdges.find((e) => e.id === 'fanout-publish:sr-1->sr-2');
    expect(fpEdge?.type).toBe('fanoutEdge');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Slice 5 — Controls / minimap / lane backgrounds
// ────────────────────────────────────────────────────────────────────────────
describe('GraphView — controls, minimap, lane backgrounds', () => {
  it('renders <MiniMap />', async () => {
    mockFetchOk();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());
    expect(screen.getByTestId('minimap')).toBeInTheDocument();
  });

  it('renders <Controls />', async () => {
    mockFetchOk();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());
    expect(screen.getByTestId('controls')).toBeInTheDocument();
  });

  it('renders <Background />', async () => {
    mockFetchOk();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());
    expect(screen.getByTestId('background')).toBeInTheDocument();
  });

  it('renders lane labels (shared, track, publish)', async () => {
    mockFetchOk();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());
    expect(screen.getByTestId('lane-label-shared')).toBeInTheDocument();
    expect(screen.getByTestId('lane-label-track')).toBeInTheDocument();
    expect(screen.getByTestId('lane-label-publish')).toBeInTheDocument();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Slice 6 — Node click → URL state (Focus view)
// ────────────────────────────────────────────────────────────────────────────
describe('GraphView — node click → Focus URL', () => {
  it('pushes view=focus&stage=... to router when a shared-lane node is clicked', async () => {
    mockFetchOk();
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());

    const sharedNode = capturedNodes.find((n) => n.data.lane === 'shared');
    expect(sharedNode).toBeDefined();
    capturedOnNodeClick?.({}, sharedNode);

    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining('view=focus'),
    );
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining(`stage=${sharedNode?.data.stage}`),
    );
  });

  it('pushes track=... param when clicking a track-lane node', async () => {
    const trackResponse = {
      nodes: [
        { id: 'sr-5', stage: 'production', status: 'completed', attemptNo: 1, trackId: 'track-42', publishTargetId: null, lane: 'track', label: 'production #1' },
      ],
      edges: [],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: trackResponse, error: null }),
    }));
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());

    const trackNode = capturedNodes.find((n) => n.data.lane === 'track');
    capturedOnNodeClick?.({}, trackNode);

    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('track=track-42'));
  });

  it('pushes target=... param when clicking a publish-lane node', async () => {
    const publishResponse = {
      nodes: [
        { id: 'sr-6', stage: 'publish', status: 'completed', attemptNo: 1, trackId: 'track-1', publishTargetId: 'pt-99', lane: 'publish', label: 'publish #1' },
      ],
      edges: [],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: publishResponse, error: null }),
    }));
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());

    const publishNode = capturedNodes.find((n) => n.data.lane === 'publish');
    capturedOnNodeClick?.({}, publishNode);

    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('target=pt-99'));
  });

  it('pushes attempt=... param when clickNode has attemptNo > 1', async () => {
    const multiAttemptResponse = {
      nodes: [
        { id: 'sr-7', stage: 'research', status: 'completed', attemptNo: 3, trackId: null, publishTargetId: null, lane: 'shared', label: 'research #3' },
      ],
      edges: [],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: multiAttemptResponse, error: null }),
    }));
    render(<GraphView projectId={PROJECT_ID} />);
    await waitFor(() => expect(screen.getByTestId('react-flow-root')).toBeInTheDocument());

    const node = capturedNodes[0];
    capturedOnNodeClick?.({}, node);

    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('attempt=3'));
  });
});

// ── Export type check — ensure the exported types are usable ─────────────────
describe('GraphView — type exports', () => {
  it('GraphNode type has expected shape', () => {
    const node: GraphNode = makeGraphNode();
    expect(node.id).toBeDefined();
    expect(node.type).toBeDefined();
    expect(node.position).toBeDefined();
    expect(node.data).toBeDefined();
  });

  it('GraphEdge type has expected shape', () => {
    const edge: GraphEdge = makeGraphEdge();
    expect(edge.id).toBeDefined();
    expect(edge.source).toBeDefined();
    expect(edge.target).toBeDefined();
    expect(edge.type).toBeDefined();
  });
});
