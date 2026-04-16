'use client';

const STAGE_COLORS: Record<string, string> = {
  brainstorm: 'bg-emerald-500/20 text-emerald-400',
  research: 'bg-blue-500/20 text-blue-400',
  production: 'bg-purple-500/20 text-purple-400',
  review: 'bg-orange-500/20 text-orange-400',
};

interface LogCardProps {
  log: {
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
  };
  selected: boolean;
  onClick: () => void;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTokens(n: number | null): string {
  if (n == null) return '';
  const total = n;
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k tok`;
  return `${total} tok`;
}

export function LogCard({ log, selected, onClick }: LogCardProps) {
  const stageColor = STAGE_COLORS[log.stage] ?? 'bg-slate-500/20 text-slate-400';
  const hasError = !!log.error;
  const totalTokens = (log.input_tokens ?? 0) + (log.output_tokens ?? 0);
  const modelShort = log.model.replace(/^(claude-|gpt-|gemini-)/, '').split('-').slice(0, 2).join('-');

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-[#1E2E40] transition-all ${
        selected
          ? 'bg-[rgba(45,212,168,0.08)] border-l-2 border-l-[#2DD4A8]'
          : 'hover:bg-[rgba(45,212,168,0.04)] border-l-2 border-l-transparent'
      } ${hasError ? 'border-l-red-500' : ''}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${hasError ? 'bg-red-500/20 text-red-400' : stageColor}`}>
          {hasError ? '✗' : '●'} {log.stage}
        </span>
        <span className="text-[11px] text-[#64748B]">{modelShort}</span>
      </div>
      <p className="text-xs text-[#E2E8F0] truncate mb-1">
        {log.project_title ?? log.user_email ?? log.channel_name ?? '—'}
      </p>
      <div className="flex items-center gap-2 text-[10px] text-[#64748B]">
        {hasError ? (
          <span className="text-red-400">error</span>
        ) : (
          <span>{(log.duration_ms / 1000).toFixed(1)}s</span>
        )}
        {totalTokens > 0 && <span>· {formatTokens(totalTokens)}</span>}
        <span>· {timeAgo(log.created_at)}</span>
      </div>
    </button>
  );
}
