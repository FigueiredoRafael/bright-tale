import { useEffect, useState, useCallback, useRef } from 'react';

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

interface UseCachedFetchOptions {
  staleMs?: number;
  enabled?: boolean;
}

interface UseCachedFetchResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useCachedFetch<T>(
  url: string | null,
  opts: UseCachedFetchOptions = {},
): UseCachedFetchResult<T> {
  const { staleMs = 60_000, enabled = true } = opts;
  const [data, setData] = useState<T | null>(() => {
    if (!url) return null;
    const entry = cache.get(url);
    return entry ? (entry.data as T) : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!data && enabled);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!url) return;

    const entry = cache.get(url);
    if (entry && Date.now() - entry.fetchedAt < staleMs) {
      setData(entry.data as T);
      setLoading(false);
      return;
    }

    if (entry) {
      setData(entry.data as T);
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setLoading(!entry);
      const res = await fetch(url, { signal: controller.signal });
      const json = await res.json();
      if (json.error) {
        setError(json.error.message);
      } else {
        const newData = json.data as T;
        setData(newData);
        setError(null);
        cache.set(url, { data: newData, fetchedAt: Date.now() });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError('Fetch failed');
    } finally {
      setLoading(false);
    }
  }, [url, staleMs]);

  useEffect(() => {
    if (enabled) fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData, enabled]);

  return { data, error, loading, refetch: fetchData };
}

export function invalidateCache(urlPrefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(urlPrefix)) cache.delete(key);
  }
}
