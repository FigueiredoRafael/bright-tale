'use client';

import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'brighttale:active-channel-id';
const ACTIVE_CHANGE_EVENT = 'brighttale:active-channel-change';

export interface Channel {
  id: string;
  name: string;
  niche: string | null;
  channel_type: string;
  media_types: string[];
  video_style: string | null;
  logo_url: string | null;
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

// Module-level state — shared across all hook instances
let channelsCache: Channel[] | null = null;
let cacheTimestamp = 0;
let inflightFetch: Promise<Channel[] | null> | null = null;
let activeIdCache: string | null = null;
const CACHE_TTL_MS = 30_000;

const channelListSubscribers = new Set<(list: Channel[]) => void>();
const activeIdSubscribers = new Set<(id: string | null) => void>();

function notifyChannelList(list: Channel[]) {
  channelListSubscribers.forEach((cb) => cb(list));
}

function notifyActiveId(id: string | null) {
  activeIdSubscribers.forEach((cb) => cb(id));
}

async function fetchChannelsFromApi(): Promise<Channel[] | null> {
  if (inflightFetch) return inflightFetch;

  inflightFetch = (async () => {
    try {
      const res = await fetch('/api/channels');
      // Return null on transport/auth/server failure so callers can distinguish
      // "no channels yet" from "request failed" (avoids bogus onboarding redirects).
      if (!res.ok) return null;
      const json = await res.json();
      if (json.error) return null;
      const list: Channel[] = json.data?.items ?? [];
      channelsCache = list;
      cacheTimestamp = Date.now();
      notifyChannelList(list);
      return list;
    } catch {
      return null;
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
 * All hook instances share a module-level cache and subscribe to updates,
 * so switching channel in one component immediately updates all others.
 */
export function useActiveChannel(): UseActiveChannelResult {
  const [channels, setChannels] = useState<Channel[]>(() => channelsCache ?? []);
  const [activeChannelId, setActiveChannelIdState] = useState<string | null>(() => {
    if (activeIdCache) return activeIdCache;
    const resolved = channelsCache ? resolveActiveId(channelsCache) : null;
    activeIdCache = resolved;
    return resolved;
  });
  const [loading, setLoading] = useState(channelsCache === null);

  const refetch = useCallback(async () => {
    const list = await fetchChannelsFromApi();
    // null = fetch failed; keep loading=true so callers don't take the
    // "no channels → redirect to onboarding" branch on a transient error.
    if (list === null) return;
    setChannels(list);
    const newActive = resolveActiveId(list);
    if (newActive !== activeIdCache) {
      activeIdCache = newActive;
      notifyActiveId(newActive);
    }
    setActiveChannelIdState(newActive);
    setLoading(false);
  }, []);

  // Subscribe to cross-instance updates. Recreates subscribers on each mount
  // (Strict Mode safe — cleanup removes, re-mount re-adds).
  useEffect(() => {
    const listHandler = (list: Channel[]) => {
      setChannels(list);
      const newActive = resolveActiveId(list);
      if (newActive !== activeIdCache) activeIdCache = newActive;
      setActiveChannelIdState(newActive);
    };
    const activeHandler = (id: string | null) => {
      setActiveChannelIdState(id);
    };
    channelListSubscribers.add(listHandler);
    activeIdSubscribers.add(activeHandler);
    return () => {
      channelListSubscribers.delete(listHandler);
      activeIdSubscribers.delete(activeHandler);
    };
  }, []);

  // Initial fetch on first mount (per instance, but dedup'd by inflightFetch)
  useEffect(() => {
    const cacheFresh = channelsCache !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS;
    if (cacheFresh && channelsCache) {
      setChannels(channelsCache);
      setActiveChannelIdState(activeIdCache ?? resolveActiveId(channelsCache));
      setLoading(false);
      return;
    }
    if (channelsCache !== null) {
      setChannels(channelsCache);
      setActiveChannelIdState(activeIdCache ?? resolveActiveId(channelsCache));
      setLoading(false);
    }
    refetch();
  }, [refetch]);

  const setActiveChannelId = useCallback((id: string) => {
    activeIdCache = id;
    setActiveChannelIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, id);
      // Notify other tabs too
      window.dispatchEvent(new CustomEvent(ACTIVE_CHANGE_EVENT, { detail: id }));
    }
    notifyActiveId(id);
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
