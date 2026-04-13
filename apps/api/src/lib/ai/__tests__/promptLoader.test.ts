/**
 * F2-027 — promptLoader tests.
 * Verifies cache behavior and slug lookup without hitting Supabase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadAgentPrompt, clearPromptCache } from '../promptLoader.js';

vi.mock('../../supabase/index.js', () => {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(),
  };
  const client = {
    from: vi.fn(() => builder),
    _builder: builder,
  };
  return {
    createServiceClient: () => client,
    __esClient: client,
  };
});

import * as supabaseModule from '../../supabase/index.js';
const client = (supabaseModule as unknown as { __esClient: { _builder: { maybeSingle: ReturnType<typeof vi.fn> } } }).__esClient;

beforeEach(() => {
  clearPromptCache();
  vi.clearAllMocks();
});

describe('loadAgentPrompt', () => {
  it('returns instructions when row exists', async () => {
    client._builder.maybeSingle.mockResolvedValueOnce({ data: { instructions: 'BE THOUGHTFUL' }, error: null });
    expect(await loadAgentPrompt('brainstorm')).toBe('BE THOUGHTFUL');
  });

  it('returns null on missing row', async () => {
    client._builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await loadAgentPrompt('nonexistent')).toBeNull();
  });

  it('caches hits and does not call DB twice within TTL', async () => {
    client._builder.maybeSingle.mockResolvedValueOnce({ data: { instructions: 'CACHED' }, error: null });
    const first = await loadAgentPrompt('research');
    const second = await loadAgentPrompt('research');
    expect(first).toBe('CACHED');
    expect(second).toBe('CACHED');
    expect(client._builder.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('clearPromptCache forces re-fetch', async () => {
    client._builder.maybeSingle.mockResolvedValueOnce({ data: { instructions: 'V1' }, error: null });
    await loadAgentPrompt('review');
    clearPromptCache('review');
    client._builder.maybeSingle.mockResolvedValueOnce({ data: { instructions: 'V2' }, error: null });
    expect(await loadAgentPrompt('review')).toBe('V2');
  });
});
