import { EngineLogsClient } from './EngineLogsClient';

export const dynamic = 'force-dynamic';

export default function EngineLogsPage() {
  return (
    <div className="h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2E40]">
        <div>
          <h1 className="text-lg font-bold text-[#F0F4F8]">Engine Logs</h1>
          <p className="text-xs text-[#64748B]">Full LLM input/output payload inspector</p>
        </div>
      </div>
      <EngineLogsClient />
    </div>
  );
}
