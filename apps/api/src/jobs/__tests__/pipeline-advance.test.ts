/**
 * Slice 3 (#11) — pipeline-advance Inngest function.
 *
 * Reacts to `pipeline/stage.run.finished` events by delegating to
 * `advanceAfter`. The function itself is dumb; orchestrator decides
 * whether to enqueue the next Stage Run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client.js', () => ({
  inngest: {
    createFunction: (_config: unknown, handler: unknown) => handler,
  },
}));

const advanceAfterMock = vi.fn();
vi.mock('../../lib/pipeline/orchestrator.js', () => ({
  advanceAfter: advanceAfterMock,
}));

describe('pipeline-advance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to advanceAfter with the stageRunId from the event', async () => {
    const { pipelineAdvance } = await import('../pipeline-advance.js');

    await (pipelineAdvance as unknown as (args: { event: { data: { stageRunId: string } } }) => Promise<void>)({
      event: { data: { stageRunId: 'sr-123' } },
    });

    expect(advanceAfterMock).toHaveBeenCalledTimes(1);
    expect(advanceAfterMock).toHaveBeenCalledWith('sr-123');
  });

  it('returns void without throwing when advanceAfter resolves', async () => {
    advanceAfterMock.mockResolvedValueOnce(undefined);
    const { pipelineAdvance } = await import('../pipeline-advance.js');

    const result = await (pipelineAdvance as unknown as (args: { event: { data: { stageRunId: string } } }) => Promise<void>)({
      event: { data: { stageRunId: 'sr-456' } },
    });

    expect(result).toBeUndefined();
  });
});
