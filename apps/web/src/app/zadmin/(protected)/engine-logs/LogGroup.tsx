'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { LogCard } from './LogCard';

interface LogGroupProps {
  label: string;
  count: number;
  items: Array<{
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
  }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function LogGroup({ label, count, items, selectedId, onSelect }: LogGroupProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-[#0D1117] border-b border-[#1E2E40] hover:bg-[rgba(45,212,168,0.04)] transition-all"
      >
        <ChevronRight
          size={14}
          className={`text-[#64748B] transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="text-xs font-medium text-[#E2E8F0] flex-1 text-left truncate">{label}</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1E2E40] text-[#94A3B8]">{count}</span>
      </button>
      {expanded && items.map((log) => (
        <LogCard
          key={log.id}
          log={log}
          selected={selectedId === log.id}
          onClick={() => onSelect(log.id)}
        />
      ))}
    </div>
  );
}
