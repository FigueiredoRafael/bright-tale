'use client';

import { useEffect, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Search, Database } from 'lucide-react';

type EntityType = 'ideas' | 'research-sessions' | 'content-drafts' | 'content-assets';

const ENDPOINT_MAP: Record<EntityType, string> = {
  'ideas': '/api/ideas/library',
  'research-sessions': '/api/research-sessions',
  'content-drafts': '/api/content-drafts',
  'content-assets': '/api/assets',
};

const DATA_EXTRACTORS: Record<EntityType, (json: Record<string, unknown>) => unknown[]> = {
  'ideas': (json) => (json.data as Record<string, unknown>)?.ideas as unknown[] ?? json.data as unknown[] ?? [],
  'research-sessions': (json) => {
    const d = json.data as Record<string, unknown>;
    if (Array.isArray(d)) return d;
    if (d && typeof d === 'object') {
      const obj = d as Record<string, unknown>;
      return (obj.sessions ?? obj.items ?? []) as unknown[];
    }
    return [];
  },
  'content-drafts': (json) => {
    const d = json.data as Record<string, unknown>;
    if (Array.isArray(d)) return d;
    if (d && typeof d === 'object') {
      const obj = d as Record<string, unknown>;
      return (obj.drafts ?? obj.items ?? []) as unknown[];
    }
    return [];
  },
  'content-assets': (json) => {
    const d = json.data;
    if (Array.isArray(d)) return d;
    if (d && typeof d === 'object') {
      const obj = d as Record<string, unknown>;
      return (obj.items ?? obj.assets ?? []) as unknown[];
    }
    return [];
  },
};

interface ImportPickerProps<T = Record<string, unknown>> {
  entityType: EntityType;
  channelId?: string;
  filters?: Record<string, string>;
  renderItem: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
}

export function ImportPicker<T = Record<string, unknown>>({
  entityType,
  channelId,
  filters,
  renderItem,
  onSelect,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No items found',
}: ImportPickerProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (channelId) params.set('channel_id', channelId);
      if (filters) {
        for (const [k, v] of Object.entries(filters)) {
          params.set(k, v);
        }
      }
      params.set('limit', '50');

      const url = `${ENDPOINT_MAP[entityType]}?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const json = await res.json();
      const extracted = DATA_EXTRACTORS[entityType](json);
      setItems(extracted as T[]);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [entityType, channelId, filters, search]);

  useEffect(() => {
    const timer = setTimeout(fetchItems, 300); // debounce search
    return () => clearTimeout(timer);
  }, [fetchItems]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{emptyMessage}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-left"
              onClick={() => onSelect(item)}
            >
              {renderItem(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
