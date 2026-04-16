'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LogFilters, type Filters } from './LogFilters';
import { LogList, type LogItem, type Group } from './LogList';
import { PayloadInspector, type EngineLog } from './PayloadInspector';

const LIMIT = 50;

const GROUP_CONFIG: Record<string, { column: string; labelColumn: string }> = {
  user: { column: 'user_id', labelColumn: 'user_id' },
  channel: { column: 'channel_id', labelColumn: 'channel_id' },
  project: { column: 'project_id', labelColumn: 'project_id' },
  engine: { column: 'stage', labelColumn: 'stage' },
};

export function EngineLogsClient() {
  const [filters, setFilters] = useState<Filters>({ stage: '', provider: '', groupBy: 'none', errorOnly: false });
  const [items, setItems] = useState<LogItem[]>([]);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<EngineLog | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async (currentFilters: Filters, currentPage: number) => {
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from('engine_logs')
      .select('id, stage, session_type, provider, model, duration_ms, input_tokens, output_tokens, error, created_at, project_id, channel_id, user_id, session_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((currentPage - 1) * LIMIT, currentPage * LIMIT - 1);

    if (currentFilters.stage) query = query.eq('stage', currentFilters.stage);
    if (currentFilters.provider) query = query.eq('provider', currentFilters.provider);
    if (currentFilters.errorOnly) query = query.not('error', 'is', null);

    const { data, count } = await query;
    const logs = (data ?? []) as LogItem[];
    setTotal(count ?? 0);

    if (currentFilters.groupBy !== 'none') {
      const config = GROUP_CONFIG[currentFilters.groupBy];
      if (config) {
        const grouped = new Map<string, { items: LogItem[]; label: string }>();
        for (const log of logs) {
          const key = (log as unknown as Record<string, string>)[config.column] ?? 'unknown';
          const label = (log as unknown as Record<string, string>)[config.labelColumn] ?? key;
          if (!grouped.has(key)) grouped.set(key, { items: [], label });
          grouped.get(key)!.items.push(log);
        }
        setGroups(
          Array.from(grouped.entries()).map(([key, val]) => ({
            key,
            label: val.label,
            count: val.items.length,
            items: val.items,
          }))
        );
        setItems([]);
      }
    } else {
      setGroups(null);
      setItems(logs);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs(filters, page);
  }, [filters, page, fetchLogs]);

  async function handleSelect(id: string) {
    setSelectedId(id);
    const supabase = createClient();
    const { data } = await supabase.from('engine_logs').select('*').eq('id', id).single();
    setSelectedLog(data as EngineLog | null);
  }

  function handleFiltersChange(newFilters: Filters) {
    setFilters(newFilters);
    setPage(1);
    setSelectedId(null);
    setSelectedLog(null);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <LogFilters filters={filters} onChange={handleFiltersChange} />
      {loading && (
        <div className="flex items-center justify-center py-8 text-[#64748B] text-sm">Loading...</div>
      )}
      {!loading && (
        <div className="flex flex-1 min-h-0">
          <div className="w-[45%] border-r border-[#1E2E40] flex flex-col">
            <LogList
              items={items}
              groups={groups}
              selectedId={selectedId}
              onSelect={handleSelect}
              total={total}
              page={page}
              onPageChange={setPage}
              limit={LIMIT}
            />
          </div>
          <div className="w-[55%] bg-[#0A0F16]">
            <PayloadInspector log={selectedLog} />
          </div>
        </div>
      )}
    </div>
  );
}
