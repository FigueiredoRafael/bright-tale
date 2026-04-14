import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TtlCache } from '../cache.js';

describe('TtlCache', () => {
  let cache: TtlCache<string>;

  beforeEach(() => {
    cache = new TtlCache({ defaultTtlMs: 1000, maxSize: 3 });
  });

  it('stores and retrieves values', () => {
    cache.set('a', 'hello');
    expect(cache.get('a')).toBe('hello');
  });

  it('returns undefined for missing keys', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('expires entries after TTL', () => {
    vi.useFakeTimers();
    cache.set('a', 'hello');
    expect(cache.get('a')).toBe('hello');
    vi.advanceTimersByTime(1001);
    expect(cache.get('a')).toBeUndefined();
    vi.useRealTimers();
  });

  it('supports custom TTL per entry', () => {
    vi.useFakeTimers();
    cache.set('short', 'val', 100);
    cache.set('long', 'val', 5000);
    vi.advanceTimersByTime(200);
    expect(cache.get('short')).toBeUndefined();
    expect(cache.get('long')).toBe('val');
    vi.useRealTimers();
  });

  it('evicts oldest entry when maxSize exceeded', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.set('d', '4');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('d')).toBe('4');
  });

  it('clear removes all entries', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('has() returns false for expired keys', () => {
    vi.useFakeTimers();
    cache.set('a', 'val');
    vi.advanceTimersByTime(1001);
    expect(cache.has('a')).toBe(false);
    vi.useRealTimers();
  });
});
