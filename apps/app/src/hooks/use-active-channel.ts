'use client';

import { useEffect, useState, useCallback } from 'react';

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

/**
 * Hook to manage the user's active channel.
 *
 * - Loads all channels on mount
 * - Persists active channel ID in localStorage
 * - Falls back to first channel if stored ID no longer exists
 */
export function useActiveChannel(): UseActiveChannelResult {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/channels');
      const json = await res.json();
      const list: Channel[] = json.data?.items ?? [];
      setChannels(list);

      // Resolve active channel
      const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      const storedValid = stored && list.some((c) => c.id === stored);

      if (storedValid) {
        setActiveChannelIdState(stored);
      } else if (list.length > 0) {
        setActiveChannelIdState(list[0].id);
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, list[0].id);
        }
      } else {
        setActiveChannelIdState(null);
      }
    } catch {
      // silent — consumer shows empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

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
    refetch: fetchChannels,
  };
}
