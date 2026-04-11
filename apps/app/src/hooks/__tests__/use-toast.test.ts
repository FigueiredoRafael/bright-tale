import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useToast } from '@/hooks/use-toast';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe('useToast', () => {
  it('returns the same toast function reference across re-renders', () => {
    const { result, rerender } = renderHook(() => useToast());
    const first = result.current.toast;
    rerender();
    const second = result.current.toast;
    rerender();
    const third = result.current.toast;
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('returns the same result object reference across re-renders', () => {
    const { result, rerender } = renderHook(() => useToast());
    const first = result.current;
    rerender();
    const second = result.current;
    expect(second).toBe(first);
  });
});
