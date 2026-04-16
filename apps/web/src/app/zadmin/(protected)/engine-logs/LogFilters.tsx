'use client';

interface Filters {
  stage: string;
  provider: string;
  groupBy: string;
  errorOnly: boolean;
}

interface LogFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

const STAGES = ['', 'brainstorm', 'research', 'production', 'review'];
const PROVIDERS = ['', 'openai', 'anthropic', 'gemini', 'ollama'];
const GROUP_BY = ['none', 'user', 'channel', 'project', 'engine'];

function Select({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="bg-[#0D1117] border border-[#1E2E40] text-[#E2E8F0] text-xs rounded-lg px-3 py-2 focus:border-[#2DD4A8] focus:outline-none transition-colors"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt === '' ? `All ${label}` : opt.charAt(0).toUpperCase() + opt.slice(1)}
        </option>
      ))}
    </select>
  );
}

export function LogFilters({ filters, onChange }: LogFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 border-b border-[#1E2E40] bg-[#0F1620]">
      <Select label="stages" value={filters.stage} options={STAGES} onChange={(stage) => onChange({ ...filters, stage })} />
      <Select label="providers" value={filters.provider} options={PROVIDERS} onChange={(provider) => onChange({ ...filters, provider })} />

      <div className="flex items-center gap-2 bg-[#0D1117] border border-[#1E2E40] rounded-lg px-3 py-2">
        <span className="text-[10px] text-[#64748B] uppercase tracking-wider">Group by</span>
        <select
          value={filters.groupBy}
          onChange={(e) => onChange({ ...filters, groupBy: e.target.value })}
          aria-label="Group by"
          className="bg-transparent text-[#E2E8F0] text-xs focus:outline-none"
        >
          {GROUP_BY.map((opt) => (
            <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-xs text-[#94A3B8] cursor-pointer">
        <input
          type="checkbox"
          checked={filters.errorOnly}
          onChange={(e) => onChange({ ...filters, errorOnly: e.target.checked })}
          className="accent-[#2DD4A8]"
        />
        Errors only
      </label>
    </div>
  );
}

export type { Filters };
