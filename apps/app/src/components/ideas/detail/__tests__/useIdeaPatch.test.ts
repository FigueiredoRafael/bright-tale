import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIdeaPatch } from '../useIdeaPatch';

describe('useIdeaPatch', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('PATCHes a top-level field', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { idea: { id: '1', title: 'updated' } }, error: null }),
    });
    const idea = { id: '1', title: 'old', discovery_data: {} } as any;
    const { result } = renderHook(() => useIdeaPatch('1', idea));

    let updated: any;
    await act(async () => {
      updated = await result.current.patch({ title: 'updated' });
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/ideas/library/1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ title: 'updated' }),
    }));
    expect(updated.title).toBe('updated');
  });

  it('merges discovery_data partial changes client-side before PATCH', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { idea: { id: '1', discovery_data: { a: 1, b: 2 } } }, error: null }),
    });
    const idea = { id: '1', discovery_data: { a: 1, b: 'old' } } as any;
    const { result } = renderHook(() => useIdeaPatch('1', idea));

    await act(async () => {
      await result.current.patchDiscovery({ b: 2 });
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const sentBody = JSON.parse(callArgs[1].body);
    expect(sentBody.discovery_data).toEqual({ a: 1, b: 2 });
  });

  it('throws on API error', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ data: null, error: { code: 'INVALID', message: 'Bad value' } }),
    });
    const { result } = renderHook(() => useIdeaPatch('1', { id: '1', discovery_data: {} } as any));

    await expect(result.current.patch({ title: 'x' })).rejects.toThrow('Bad value');
  });
});
