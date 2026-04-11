"use client";

const STAGES = [
  { key: "discovery", label: "Discovery", abbr: "Disc", color: "#A78BFA" },
  { key: "research", label: "Research", abbr: "Res", color: "#60A5FA" },
  { key: "production", label: "Production", abbr: "Prod", color: "#FF8555" },
  { key: "review", label: "Review", abbr: "Rev", color: "#FBBF24" },
  { key: "publish", label: "Publish", abbr: "Pub", color: "#4ADE80" },
] as const;

interface PipelineProps {
  stageCounts: Record<string, number>;
  total: number;
}

export default function Pipeline({ stageCounts, total }: PipelineProps) {
  if (total === 0) return null;

  const counts = STAGES.map((s) => ({ ...s, count: stageCounts[s.key] ?? 0 }));

  return (
    <div className="bg-card border border-border rounded-[14px] p-6 relative overflow-hidden">
      <div className="absolute top-[-60px] left-1/2 -translate-x-1/2 w-[400px] h-[100px] bg-[radial-gradient(ellipse,rgba(45,212,168,0.025),transparent)] pointer-events-none" />

      <div className="flex justify-between items-center mb-5 relative">
        <h2 className="font-display text-[15px] font-semibold">Pipeline</h2>
        <span className="text-[11px] text-[#475569]">{total} project{total !== 1 ? "s" : ""} across 5 stages</span>
      </div>

      <div className="relative px-5">
        <div className="absolute top-[22px] left-[56px] right-[56px] h-[2px] bg-gradient-to-r from-[#A78BFA33] via-[#FF855533] to-[#4ADE8033] rounded-full" />
        <div className="flex relative z-[1] overflow-x-auto">
          {counts.map((s) => (
            <div key={s.key} className="flex-1 min-w-[64px] flex flex-col items-center gap-2 group relative">
              <div
                className="w-[44px] h-[44px] rounded-xl flex items-center justify-center text-lg font-bold font-display transition-transform duration-200 group-hover:scale-110"
                style={{ background: `${s.color}1F`, color: s.color }}
              >
                {s.count}
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">{s.label}</span>
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-popover border border-[#2D3F55] rounded-md px-2.5 py-1 text-[10px] text-[#94A3B8] whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
                {s.count} project{s.count !== 1 ? "s" : ""} in {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-8 pt-3.5 border-t border-border/40">
        <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5 flex-1 mr-4">
          {counts.map((s) =>
            s.count > 0 ? (
              <div key={s.key} className="rounded-sm" style={{ flex: s.count, background: s.color }} />
            ) : null
          )}
          {total === 0 && <div className="flex-1 rounded-sm bg-border/30" />}
        </div>
        <div className="flex gap-3 shrink-0">
          {counts.map((s) => (
            <div key={s.key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
              {s.abbr}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
