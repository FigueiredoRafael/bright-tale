'use client';

import { LogCard } from './LogCard';
import { LogGroup } from './LogGroup';

interface LogItem {
  id: string;
  stage: string;
  provider: string;
  model: string;
  duration_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  error: string | null;
  created_at: string;
  project_title?: string;
  channel_name?: string;
  user_email?: string;
}

interface Group {
  key: string;
  label: string;
  count: number;
  items: LogItem[];
}

interface LogListProps {
  items: LogItem[];
  groups: Group[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  limit: number;
}

export function LogList({ items, groups, selectedId, onSelect, total, page, onPageChange, limit }: LogListProps) {
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {groups ? (
          groups.map((group) => (
            <LogGroup
              key={group.key}
              label={group.label}
              count={group.count}
              items={group.items}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))
        ) : (
          items.map((log) => (
            <LogCard
              key={log.id}
              log={log}
              selected={selectedId === log.id}
              onClick={() => onSelect(log.id)}
            />
          ))
        )}
        {items.length === 0 && !groups && (
          <div className="flex items-center justify-center py-12 text-[#64748B] text-sm">
            No logs found
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-[#1E2E40] bg-[#0D1117] text-xs text-[#64748B]">
        <span>{total} logs</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="px-2 py-1 rounded bg-[#1E2E40] disabled:opacity-30 hover:text-[#E2E8F0] transition-colors"
          >
            ◂
          </button>
          <span>page {page} of {totalPages || 1}</span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-2 py-1 rounded bg-[#1E2E40] disabled:opacity-30 hover:text-[#E2E8F0] transition-colors"
          >
            ▸
          </button>
        </div>
      </div>
    </div>
  );
}

export type { LogItem, Group };
