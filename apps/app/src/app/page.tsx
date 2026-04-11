"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Pipeline from "@/components/dashboard/Pipeline";
import EmptyState from "@/components/dashboard/EmptyState";
import StartWorkflowButton from "@/components/projects/StartWorkflowButton";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Layers, Activity, Lightbulb, Database, ChevronRight,
  FileText, Search, Eye, Check, AlignLeft, TrendingUp,
} from "lucide-react";

/* ── Types ── */
type Project = {
  id: string;
  title: string;
  current_stage: string;
  status: string;
  created_at: string;
  updated_at: string;
};

/* ── Stage config ── */
const STAGE_META: Record<string, { color: string; icon: React.ElementType }> = {
  discovery:  { color: "#A78BFA", icon: Search },
  research:   { color: "#60A5FA", icon: FileText },
  production: { color: "#FF8555", icon: AlignLeft },
  review:     { color: "#FBBF24", icon: Eye },
  publish:    { color: "#4ADE80", icon: Check },
};

function stageColor(stage: string) { return STAGE_META[stage]?.color ?? "#64748B"; }
function StageIcon({ stage, className }: { stage: string; className?: string }) {
  const Icon = STAGE_META[stage]?.icon ?? Layers;
  return <Icon className={className} />;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* ── Stat Card (CSS-only hover via .stat-glow class from globals.css) ── */
function StatCard({ label, value, sub, icon: Icon, iconBg, iconColor, glow, dimmed }: {
  label: string; value: number; sub: string;
  icon: React.ElementType; iconBg: string; iconColor: string; glow: string; dimmed?: boolean;
}) {
  return (
    <div className="stat-glow bg-card border border-border rounded-[14px] p-5 flex justify-between items-start" data-glow={glow}>
      <div>
        <div className="text-[11px] font-medium text-muted-foreground mb-2">{label}</div>
        <div className={`text-[32px] font-extrabold font-display leading-none tracking-tight ${dimmed ? "text-[#2D3F55]" : "text-foreground"}`}>
          {value}
        </div>
        {sub && (
          <div className={`flex items-center gap-1 mt-2 text-[11px] font-medium ${sub.startsWith("+") ? "text-success" : "text-muted-foreground"}`}>
            {sub.startsWith("+") && <TrendingUp className="h-3 w-3" />}
            {sub}
          </div>
        )}
      </div>
      <div className="w-[42px] h-[42px] rounded-xl flex items-center justify-center shrink-0" style={{ background: iconBg, color: iconColor }}>
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
    </div>
  );
}

/* ── Loading skeleton ── */
function StatSkeleton() {
  return <div className="bg-card border border-border rounded-[14px] h-[106px] animate-pulse" />;
}

/* ── Main ── */
export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) return;
        const json = await res.json();
        setProjects(json.data?.projects || []);
      } catch {
        // ignore — stats show 0
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const total = projects.length;
  const activeCount = projects.filter((p) => p.status === "active").length;
  const recentWeek = projects.filter(
    (p) => Date.now() - new Date(p.created_at).getTime() < 7 * 86400000
  ).length;
  const recent = [...projects]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);
  const stageCounts: Record<string, number> = {};
  for (const p of projects) {
    stageCounts[p.current_stage] = (stageCounts[p.current_stage] ?? 0) + 1;
  }
  const hasProjects = !loading && total > 0;

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-[fadeInUp_0.4s_ease_both]">
        {/* Stats Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <StatCard label="Total Projects" value={total} sub={recentWeek > 0 ? `+${recentWeek} this week` : ""} icon={Layers} iconBg="rgba(45,212,168,0.08)" iconColor="#2DD4A8" glow="teal" dimmed={!hasProjects} />
            <StatCard label="Active Now" value={activeCount} sub={activeCount > 0 ? `${activeCount} in progress` : ""} icon={Activity} iconBg="rgba(52,211,153,0.08)" iconColor="#34D399" glow="green" dimmed={!hasProjects} />
            <StatCard label="Ideas" value={0} sub="" icon={Lightbulb} iconBg="rgba(167,139,250,0.08)" iconColor="#A78BFA" glow="purple" dimmed />
            <StatCard label="Templates" value={0} sub="" icon={Database} iconBg="rgba(34,211,238,0.08)" iconColor="#22D3EE" glow="cyan" dimmed />
          </div>
        )}

        {hasProjects ? (
          <>
            {/* Pipeline */}
            <Pipeline stageCounts={stageCounts} total={total} />

            {/* Two columns */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
              {/* Recent Projects */}
              <div className="bg-card border border-border rounded-[14px] p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-display text-[15px] font-semibold">Recent Projects</h2>
                  <Link href="/projects" className="text-primary text-xs font-medium flex items-center gap-1 hover:text-[#4ADE80] transition-colors">
                    View all <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
                <div className="flex flex-col gap-1">
                  {recent.map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="group flex items-center justify-between px-3 py-2.5 rounded-[10px] border border-transparent hover:bg-white/[0.015] hover:border-primary/[0.08] transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: `${stageColor(p.current_stage)}14`, color: stageColor(p.current_stage) }}>
                          <StageIcon stage={p.current_stage} className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-foreground truncate">{p.title}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="inline-flex px-2 py-[2px] rounded-md text-[10px] font-semibold" style={{ background: `${stageColor(p.current_stage)}1F`, color: stageColor(p.current_stage) }}>
                              {p.current_stage}
                            </span>
                            <span className="text-[11px] text-[#475569]">{timeAgo(p.updated_at)}</span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-[#2D3F55] group-hover:text-primary transition-colors shrink-0" />
                    </Link>
                  ))}
                </div>
              </div>

              {/* Right column */}
              <div className="flex flex-col gap-4">
                {/* Quick Actions */}
                <div className="bg-card border border-border rounded-[14px] p-6">
                  <h2 className="font-display text-[15px] font-semibold mb-3">Quick Actions</h2>
                  <div className="flex flex-col gap-1.5">
                    <StartWorkflowButton className="w-full justify-center bg-gradient-to-br from-[#FF6B35] to-[#E85D2C] text-white font-semibold shadow-[0_2px_12px_rgba(255,107,53,0.2)] hover:shadow-[0_4px_20px_rgba(255,107,53,0.35)] hover:-translate-y-px" />
                    {[
                      { href: "/projects", label: "View All Projects", icon: Layers },
                      { href: "/templates", label: "Manage Templates", icon: Database },
                      { href: "/research", label: "Research Library", icon: FileText },
                    ].map((a) => (
                      <Link key={a.href} href={a.href} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-[9px] border border-border text-xs font-medium text-[#94A3B8] hover:border-[#2D3F55] hover:text-foreground hover:bg-white/[0.02] transition-all">
                        <a.icon className="h-4 w-4 shrink-0" />
                        {a.label}
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Activity Feed */}
                <div className="bg-card border border-border rounded-[14px] p-6 flex-1">
                  <div className="flex justify-between items-center mb-3.5">
                    <h2 className="font-display text-[15px] font-semibold">Recent Activity</h2>
                    <Link href="/projects" className="text-primary text-xs font-medium flex items-center gap-1 hover:text-[#4ADE80] transition-colors">
                      View all <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                  <div className="flex flex-col gap-3.5">
                    {recent.map((p) => (
                      <div key={`activity-${p.id}`} className="flex items-start gap-2.5">
                        <div className="relative mt-[5px] shrink-0">
                          <div className="w-2 h-2 rounded-full" style={{ background: stageColor(p.current_stage) }} />
                          <div className="absolute inset-[-3px] rounded-full opacity-25" style={{ background: stageColor(p.current_stage) }} />
                        </div>
                        <div>
                          <div className="text-xs text-[#94A3B8] leading-relaxed">
                            <strong className="text-[#E2E8F0] font-medium">{p.title}</strong>{" "}
                            in {p.current_stage}
                          </div>
                          <div className="text-[11px] text-[#475569] mt-0.5">{timeAgo(p.updated_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : !loading ? (
          <EmptyState />
        ) : (
          <div className="space-y-5">
            <div className="h-48 rounded-[14px] bg-card border border-border animate-pulse" />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
