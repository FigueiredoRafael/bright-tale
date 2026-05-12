/**
 * Slice 4 (#12) — useProjectStream hook.
 *
 * Subscribes to `project:{projectId}` for Realtime stage_runs + job_events
 * changes. Initialises stageRuns from the snapshot endpoint.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Supabase Realtime channel mock ──────────────────────────────────────────

interface ChannelMock {
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  // Captured handlers for synthetic event emission.
  handlers: Record<string, (payload: { new?: unknown; eventType?: string }) => void>;
  statusListener: ((status: string) => void) | null;
}

const channelMock: ChannelMock = {
  on: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  handlers: {},
  statusListener: null,
};

function resetChannelMock() {
  channelMock.handlers = {};
  channelMock.statusListener = null;
  channelMock.on = vi.fn((_evt: string, opts: { table?: string; event?: string }, handler: (payload: unknown) => void) => {
    const key = `${opts.table}:${opts.event ?? '*'}`;
    channelMock.handlers[key] = handler as (payload: { new?: unknown; eventType?: string }) => void;
    return channelMock;
  });
  channelMock.subscribe = vi.fn((cb: (status: string) => void) => {
    channelMock.statusListener = cb;
    return channelMock;
  });
  channelMock.unsubscribe = vi.fn();
}

const supabaseMock = {
  channel: vi.fn(() => channelMock),
  removeChannel: vi.fn(),
};

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => supabaseMock,
}));

// ─── Snapshot fetch mock ─────────────────────────────────────────────────────

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { useProjectStream } from '../useProjectStream';

const PROJECT_ID = 'proj-123';

const baseSnapshotRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'sr-1',
  projectId: PROJECT_ID,
  stage: 'brainstorm' as const,
  status: 'completed' as const,
  awaitingReason: null,
  payloadRef: null,
  attemptNo: 1,
  inputJson: null,
  errorMessage: null,
  startedAt: null,
  finishedAt: null,
  createdAt: '2026-05-11T00:00:00Z',
  updatedAt: '2026-05-11T00:00:00Z',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetChannelMock();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ data: { stageRuns: [] }, error: null }),
  });
});

describe('useProjectStream', () => {
  it('fetches the snapshot endpoint on mount and populates stageRuns by stage', async () => {
    const snapshot = [
      baseSnapshotRow({ id: 'sr-bs', stage: 'brainstorm', status: 'completed' }),
      baseSnapshotRow({ id: 'sr-rs', stage: 'research', status: 'queued' }),
    ];
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { stageRuns: snapshot }, error: null }),
    });

    const { result } = renderHook(() => useProjectStream(PROJECT_ID));

    await waitFor(() => {
      expect(result.current.stageRuns.brainstorm?.id).toBe('sr-bs');
      expect(result.current.stageRuns.research?.id).toBe('sr-rs');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/stages`);
  });

  it('opens a Realtime channel scoped to project:<id> (with per-instance suffix) and subscribes', async () => {
    renderHook(() => useProjectStream(PROJECT_ID));

    await waitFor(() => {
      // Per-instance suffix prevents collisions when multiple consumers
      // subscribe on the same page; we only assert the prefix here.
      const channelName = (supabaseMock.channel as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(channelName.startsWith(`project:${PROJECT_ID}`)).toBe(true);
      expect(channelMock.subscribe).toHaveBeenCalled();
    });
  });

  it('sets isConnected=true when the channel reports SUBSCRIBED status', async () => {
    const { result } = renderHook(() => useProjectStream(PROJECT_ID));

    await waitFor(() => {
      expect(channelMock.statusListener).not.toBeNull();
    });

    act(() => {
      channelMock.statusListener!('SUBSCRIBED');
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('sets isConnected=false on CHANNEL_ERROR / CLOSED, and back to true on re-SUBSCRIBED', async () => {
    const { result } = renderHook(() => useProjectStream(PROJECT_ID));

    await waitFor(() => expect(channelMock.statusListener).not.toBeNull());

    act(() => channelMock.statusListener!('SUBSCRIBED'));
    expect(result.current.isConnected).toBe(true);

    act(() => channelMock.statusListener!('CHANNEL_ERROR'));
    expect(result.current.isConnected).toBe(false);

    act(() => channelMock.statusListener!('SUBSCRIBED'));
    expect(result.current.isConnected).toBe(true);
  });

  it('merges a stage_runs INSERT/UPDATE Realtime event into the reducer (by stage)', async () => {
    const { result } = renderHook(() => useProjectStream(PROJECT_ID));

    await waitFor(() => expect(channelMock.handlers['stage_runs:*']).toBeDefined());

    act(() => {
      channelMock.handlers['stage_runs:*']({
        eventType: 'INSERT',
        new: {
          id: 'sr-rt',
          project_id: PROJECT_ID,
          stage: 'brainstorm',
          status: 'running',
          awaiting_reason: null,
          payload_ref: null,
          attempt_no: 1,
          input_json: null,
          error_message: null,
          started_at: '2026-05-11T00:01:00Z',
          finished_at: null,
          created_at: '2026-05-11T00:00:00Z',
          updated_at: '2026-05-11T00:01:00Z',
        },
      });
    });

    expect(result.current.stageRuns.brainstorm?.id).toBe('sr-rt');
    expect(result.current.stageRuns.brainstorm?.status).toBe('running');
  });

  it('sets liveEvent on every job_events INSERT', async () => {
    const { result } = renderHook(() => useProjectStream(PROJECT_ID));

    await waitFor(() => expect(channelMock.handlers['job_events:INSERT']).toBeDefined());

    act(() => {
      channelMock.handlers['job_events:INSERT']({
        new: {
          id: 'je-1',
          project_id: PROJECT_ID,
          session_id: 'sess-1',
          session_type: 'brainstorm',
          stage: 'brainstorm',
          message: 'Calling AI…',
          metadata: { provider: 'openai' },
          created_at: '2026-05-11T00:01:00Z',
        },
      });
    });

    expect(result.current.liveEvent?.id).toBe('je-1');
    expect(result.current.liveEvent?.message).toBe('Calling AI…');
  });

  it('cleans up the channel on unmount', async () => {
    const { unmount } = renderHook(() => useProjectStream(PROJECT_ID));

    await waitFor(() => expect(channelMock.subscribe).toHaveBeenCalled());

    unmount();

    expect(supabaseMock.removeChannel).toHaveBeenCalledWith(channelMock);
  });
});
