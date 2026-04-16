'use client';

import { JsonViewer } from './JsonViewer';

interface EngineLog {
  id: string;
  stage: string;
  session_type: string;
  provider: string;
  model: string;
  input_json: unknown;
  output_json: unknown;
  duration_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  error: string | null;
  created_at: string;
  project_id: string | null;
  channel_id: string | null;
  session_id: string | null;
  user_id: string;
}

interface PayloadInspectorProps {
  log: EngineLog | null;
}

function MetaRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-[#1E2E40] last:border-0">
      <span className="text-xs text-[#64748B]">{label}</span>
      <span className="text-xs text-[#E2E8F0] font-mono">{value ?? '—'}</span>
    </div>
  );
}

function formatTokens(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function PayloadInspector({ log }: PayloadInspectorProps) {
  if (!log) {
    return (
      <div className="flex items-center justify-center h-full text-[#64748B] text-sm">
        Select a log to inspect
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full">
      <JsonViewer label="Input" data={log.input_json} />
      <JsonViewer label="Output" data={log.output_json} />

      {log.error && (
        <div className="border border-red-800/40 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-red-900/20 border-b border-red-800/40">
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Error</span>
          </div>
          <pre className="p-4 text-xs text-red-300 bg-[#0A0F16] overflow-auto max-h-[200px] font-mono whitespace-pre-wrap">
            {log.error}
          </pre>
        </div>
      )}

      <div className="border border-[#1E2E40] rounded-lg p-4 bg-[#0D1117]">
        <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">Meta</p>
        <MetaRow label="Duration" value={`${(log.duration_ms / 1000).toFixed(2)}s`} />
        <MetaRow label="Tokens In" value={formatTokens(log.input_tokens)} />
        <MetaRow label="Tokens Out" value={formatTokens(log.output_tokens)} />
        <MetaRow label="Provider" value={log.provider} />
        <MetaRow label="Model" value={log.model} />
        <MetaRow label="Stage" value={log.stage} />
        <MetaRow label="Session Type" value={log.session_type} />
        <MetaRow label="Session ID" value={log.session_id} />
        <MetaRow label="Project ID" value={log.project_id} />
        <MetaRow label="Channel ID" value={log.channel_id} />
        <MetaRow label="User ID" value={log.user_id} />
      </div>
    </div>
  );
}

export type { EngineLog };
