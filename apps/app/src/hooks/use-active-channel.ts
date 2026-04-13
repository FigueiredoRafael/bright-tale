'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

const STORAGE_KEY = 'brighttale:active-channel-id';

export interface Channel {
  id: string;
  name: string;
  niche: string | null;
  channel_type: string;
  language: string;
  market: string;
}

interface UseActiveChannelResult {
  channels: Channel[];
  activeChannel: Channel | null;
  activeChannelId: string | null;
  setActiveChannelId: (id: string) => void;
  loading: boolean;
  refetch: () => Promise<void>;
}

// Module-level cache — shared across all hook instances, survives re-mounts
let channelsCache: Channel[] | null = null;
let cacheTimestamp = 0;
let inflightFetch: Promise<Channel[]> | null = null;
const CACHE_TTL_MS = 30_000;
const subscribers = new Set<(list: Channel[]) => void>();

async function fetchChannelsFromApi(): Promise<Channel[]> {
  // Deduplicate concurrent fetches
  if (inflightFetch) return inflightFetch;

  inflightFetch = (async () => {
    try {
      const res = await fetch('/api/channels');
      const json = await res.json();
      const list: Channel[] = json.data?.items ?? [];
      channelsCache = list;
      cacheTimestamp = Date.now();
      subscribers.forEach((cb) => cb(list));
      return list;
    } finally {
      inflightFetch = null;
    }
  })();

  return inflightFetch;
}

function resolveActiveId(list: Channel[]): string | null {
  if (typeof window === 'undefined') return list[0]?.id ?? null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && list.some((c) => c.id === stored)) return stored;
  if (list.length > 0) {
    localStorage.setItem(STORAGE_KEY, list[0].id);
    return list[0].id;
  }
  return null;
}

/**
 * Hook to access the user's channels + active channel.
 *
 * Uses a module-level cache (30s TTL) so navigating between pages doesn't
 * flicker through "Create Channel First" while the API call is in flight.
 */
export function useActiveChannel(): UseActiveChannelResult {
  const [channels, setChannels] = useState<Channel[]>(() => channelsCache ?? []);
  const [activeChannelId, setActiveChannelIdState] = useState<string | null>(() =>
    channelsCache ? resolveActiveId(channelsCache) : null,
  );
  // Only show loading if we have no cache at all
  const [loading, setLoading] = useState(channelsCache === null);
  const mountedRef = useRef(false);

  const refetch = useCallback(async () => {
    try {
      const list = await fetchChannelsFromApi();
      setChannels(list);
      setActiveChannelIdState(resolveActiveId(list));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    // Subscribe to cache updates from other instances
    const handler = (list: Channel[]) => {
      setChannels(list);
      setActiveChannelIdState(resolveActiveId(list));
    };
    subscribers.add(handler);

    const cacheFresh = channelsCache !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS;

    if (cacheFresh && channelsCache) {
      // Cache hit — instant render, no network call
      setChannels(channelsCache);
      setActiveChannelIdState(resolveActiveId(channelsCache));
      setLoading(false);
    } else {
      // Stale or empty — kick off fetch. If we have stale cache, show it meanwhile.
      if (channelsCache !== null) {
        setChannels(channelsCache);
        setActiveChannelIdState(resolveActiveId(channelsCache));
        setLoading(false);
      }
      refetch();
    }

    return () => {
      subscribers.delete(handler);
    };
  }, [refetch]);

  const setActiveChannelId = useCallback((id: string) => {
    setActiveChannelIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;

  return {
    channels,
    activeChannel,
    activeChannelId,
    setActiveChannelId,
    loading,
    refetch,
  };
}

/**
 * Invalidate the cache — call after creating/deleting a channel.
 */
export function invalidateChannelCache() {
  channelsCache = null;
  cacheTimestamp = 0;
}
