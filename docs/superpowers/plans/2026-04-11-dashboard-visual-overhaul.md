# Dashboard Visual Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the apps/app dashboard with the Brand Dark + Polish design: aligned surface colors, full-height sidebar with brand identity, pipeline visualization, activity feed, and polished empty state.

**Architecture:** 7 files modified, 1 created. globals.css gets aligned dark tokens + stage color utilities. Layout components (Sidebar, Topbar, DashboardLayout) get the new brand shell. Dashboard page.tsx is rewritten with extracted sub-components for stats, pipeline, and empty state.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4, next-themes, Lucide React icons, existing `/api/projects` endpoint.

**Spec:** `docs/superpowers/specs/2026-04-11-dashboard-visual-overhaul-design.md`
**Mockup:** `.superpowers/brainstorm/85052-1775920192/content/dashboard-v4.html`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `apps/app/src/app/globals.css` | Dark + light tokens, stage color utilities, keyframes |
| `apps/app/src/components/layout/DashboardLayout.tsx` | Flex shell + ambient orb |
| `apps/app/src/components/layout/Sidebar.tsx` | Brand sidebar with logo, teal nav, full-height |
| `apps/app/src/components/layout/Topbar.tsx` | Sticky blur topbar, theme toggle, dynamic title |
| `apps/app/src/app/page.tsx` | Dashboard page — data fetching, stats, routing to populated/empty |
| `apps/app/src/components/dashboard/Pipeline.tsx` | Pipeline visualization (extracted to keep page.tsx focused) |
| `apps/app/src/components/dashboard/EmptyState.tsx` | Empty state hero + getting-started steps |
| `apps/app/src/components/theme/theme-provider.tsx` | Already done (next-themes, defaultTheme="dark") |

---

### Task 1: Update globals.css — tokens, stage utilities, keyframes

**Files:**
- Modify: `apps/app/src/app/globals.css`

- [ ] **Step 1: Update `.dark` block with aligned surface tokens**

Replace the `.dark { ... }` block in `apps/app/src/app/globals.css` with:

```css
.dark {
  --background: #0A1017;
  --foreground: #F0F4F8;
  --card: #141E2A;
  --card-foreground: #F0F4F8;
  --popover: #0F1620;
  --popover-foreground: #F0F4F8;
  --primary: #2DD4A8;
  --primary-foreground: #0A1017;
  --secondary: #0F1620;
  --secondary-foreground: #F0F4F8;
  --muted: #0F1620;
  --muted-foreground: #64748B;
  --accent: #FF6B35;
  --accent-foreground: #FFFFFF;
  --destructive: #EF4444;
  --border: #1E2E40;
  --input: #1E2E40;
  --ring: #2DD4A8;

  --sidebar: #0F1620;
  --sidebar-foreground: #F0F4F8;
  --sidebar-border: #1E2E40;

  --color-surface-base:     #0A1017;
  --color-surface-surface:  #0F1620;
  --color-surface-elevated: #141E2A;
  --color-surface-card:     #141E2A;
  --color-surface-border:   #1E2E40;
  --color-text-primary:     #F0F4F8;
  --color-text-secondary:   #94A3B8;
  --color-text-muted:       #64748B;

  --brand-glow: 0 0 20px rgba(45,212,191,0.25);
}
```

- [ ] **Step 2: Add `--sidebar` tokens to `:root` (light mode)**

Add these lines inside the existing `:root { ... }` block, after the `--ring` line:

```css
  --sidebar: #FFFFFF;
  --sidebar-foreground: #0F172A;
  --sidebar-border: #E2E8F0;
```

- [ ] **Step 3: Add `--sidebar` to `@theme inline`**

Add these lines inside the `@theme inline { ... }` block, after the `--color-ring` line:

```css
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-border: var(--sidebar-border);
```

- [ ] **Step 4: Add stage color utilities + keyframes to `@layer components`**

Add these inside the existing `@layer components { ... }` block, after the `.text-tiny` line:

```css
  /* Stage badge backgrounds — used as bg-stage-{name} */
  .bg-stage-discovery { background: rgba(167,139,250,0.12); color: #A78BFA; }
  .bg-stage-research  { background: rgba(96,165,250,0.12);  color: #60A5FA; }
  .bg-stage-production { background: rgba(255,133,85,0.12); color: #FF8555; }
  .bg-stage-review    { background: rgba(251,191,36,0.12);  color: #FBBF24; }
  .bg-stage-publish   { background: rgba(74,222,128,0.12);  color: #4ADE80; }

  /* Stat card hover glow — apply data-glow="color" via className */
  .stat-glow { transition: border-color 0.3s, box-shadow 0.3s, transform 0.3s; }
  .stat-glow:hover { transform: translateY(-2px); }
  .stat-glow[data-glow="teal"]:hover   { border-color: rgba(45,212,168,0.2);  box-shadow: 0 0 28px rgba(45,212,168,0.06); }
  .stat-glow[data-glow="green"]:hover  { border-color: rgba(52,211,153,0.2);  box-shadow: 0 0 28px rgba(52,211,153,0.06); }
  .stat-glow[data-glow="purple"]:hover { border-color: rgba(167,139,250,0.2); box-shadow: 0 0 28px rgba(167,139,250,0.06); }
  .stat-glow[data-glow="cyan"]:hover   { border-color: rgba(34,211,238,0.2);  box-shadow: 0 0 28px rgba(34,211,238,0.06); }
```

- [ ] **Step 5: Add fadeInUp keyframe**

Add at the end of the file, after the `@layer base` block:

```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 6: Verify build**

Run: `npm run build --workspace=apps/app 2>&1 | grep -E "error|Error|✓"`
Expected: `✓ Compiled successfully`

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/app/globals.css
git commit -m "style(app): align dark tokens with apps/web, add stage utilities + keyframes"
```

---

### Task 2: Rewrite Sidebar with brand identity

**Files:**
- Modify: `apps/app/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Replace entire file**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Home, Layers, FileText, Database, Settings, Archive,
    Lightbulb, PenLine, Video, Zap, Mic, Images, Wand2,
} from "lucide-react";

const navItems = [
    { href: "/", label: "Dashboard", icon: Home, exact: true },
    { href: "/projects", label: "Projects", icon: Layers },
    { href: "/ideas", label: "Ideas", icon: Lightbulb },
    { href: "/research", label: "Research", icon: FileText },
    { href: "/blogs", label: "Blogs", icon: PenLine },
    { href: "/videos", label: "Videos", icon: Video },
    { href: "/shorts", label: "Shorts", icon: Zap },
    { href: "/podcasts", label: "Podcasts", icon: Mic },
    { href: "/templates", label: "Templates", icon: Database },
    { href: "/images", label: "Image Bank", icon: Images },
    { href: "/assets", label: "Assets", icon: Archive },
];

const settingsItems = [
    { href: "/settings", label: "All Settings", icon: Settings, exact: true },
    { href: "/settings/image-generation", label: "Image Generation", icon: Wand2 },
];

export default function Sidebar() {
    const pathname = usePathname();

    function isActive(href: string, exact = false) {
        return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
    }

    function navClass(href: string, exact = false) {
        const active = isActive(href, exact);
        return `relative flex items-center gap-2.5 px-3 py-[9px] rounded-lg text-[13px] transition-all ${
            active
                ? "bg-primary/[0.08] text-primary font-medium"
                : "text-muted-foreground hover:text-[#94A3B8] hover:bg-white/[0.03]"
        }`;
    }

    return (
        <aside className="hidden md:flex md:flex-col w-[248px] bg-sidebar border-r border-sidebar-border sticky top-0 h-screen">
            {/* Brand gradient strip */}
            <div className="h-[3px] bg-gradient-to-r from-[#2DD4A8] via-[#14967A] to-[#0D7A65] shrink-0" />

            {/* Logo */}
            <div className="flex items-center gap-2.5 px-6 pt-5 pb-7">
                <div className="w-[34px] h-[34px] rounded-[10px] bg-gradient-to-br from-[#2DD4A8] to-[#0D7A65] flex items-center justify-center shadow-[0_0_20px_rgba(45,212,168,0.25)] shrink-0">
                    <span className="text-white text-xs font-extrabold font-display">BC</span>
                </div>
                <span className="font-display text-[17px] font-bold tracking-tight">
                    <span className="text-primary">Bright</span> Curios
                </span>
            </div>

            {/* Scrollable nav with bottom fade */}
            <nav className="flex-1 overflow-y-auto px-3 pb-2 [mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent)] [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
                <div className="flex flex-col gap-0.5">
                    {navItems.map((item) => (
                        <Link key={item.href} href={item.href} className={navClass(item.href, item.exact)}>
                            {isActive(item.href, item.exact) && (
                                <div className="absolute left-0 top-[7px] bottom-[7px] w-[3px] rounded-r bg-primary shadow-[0_0_8px_rgba(45,212,168,0.5)]" />
                            )}
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                        </Link>
                    ))}

                    <div className="mt-4 pt-4 border-t border-border/50">
                        <p className="px-3 mb-1.5 text-[10px] font-semibold text-[#475569] uppercase tracking-wider">Settings</p>
                        {settingsItems.map((item) => (
                            <Link key={item.href} href={item.href} className={navClass(item.href, item.exact)}>
                                {isActive(item.href, item.exact) && (
                                    <div className="absolute left-0 top-[7px] bottom-[7px] w-[3px] rounded-r bg-primary shadow-[0_0_8px_rgba(45,212,168,0.5)]" />
                                )}
                                <item.icon className="h-4 w-4 shrink-0" />
                                <span>{item.label}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </nav>

            <div className="px-5 py-3 border-t border-border/50 shrink-0">
                <span className="text-[11px] text-[#475569] font-mono">v0.1</span>
            </div>
        </aside>
    );
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit --project apps/app/tsconfig.json 2>&1 | head -5`
Expected: no output (0 errors)

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/components/layout/Sidebar.tsx
git commit -m "style(app): sidebar with brand logo, teal active indicator, full-height sticky"
```

---

### Task 3: Rewrite Topbar — sticky blur, dynamic title, theme toggle

**Files:**
- Modify: `apps/app/src/components/layout/Topbar.tsx`

- [ ] **Step 1: Replace entire file**

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import StartWorkflowButton from "@/components/projects/StartWorkflowButton";
import { Search, Moon, Sun } from "lucide-react";

const PAGE_TITLES: Record<string, string> = {
    "/": "Dashboard",
    "/projects": "Projects",
    "/ideas": "Ideas",
    "/research": "Research",
    "/blogs": "Blogs",
    "/videos": "Videos",
    "/shorts": "Shorts",
    "/podcasts": "Podcasts",
    "/templates": "Templates",
    "/images": "Image Bank",
    "/assets": "Assets",
    "/settings": "Settings",
    "/settings/image-generation": "Image Generation",
    "/settings/ai": "AI Settings",
    "/settings/agents": "Agents",
    "/settings/wordpress": "WordPress",
};

function getPageTitle(pathname: string): string {
    if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
    const segments = pathname.split("/").filter(Boolean);
    while (segments.length > 0) {
        const path = "/" + segments.join("/");
        if (PAGE_TITLES[path]) return PAGE_TITLES[path];
        segments.pop();
    }
    return "Dashboard";
}

export default function Topbar() {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const title = getPageTitle(pathname);

    return (
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border px-7 py-3.5 bg-[rgba(10,16,23,0.85)] backdrop-blur-[16px]">
            <h1 className="font-display text-[17px] font-bold tracking-tight">{title}</h1>

            <div className="flex items-center gap-2.5">
                <div className="hidden sm:flex items-center gap-2 rounded-[9px] border border-border bg-secondary/60 px-3.5 py-[7px] w-[200px] hover:border-[#2D3F55] transition-colors">
                    <Search className="h-3.5 w-3.5 text-[#475569] shrink-0" />
                    <input
                        placeholder="Search..."
                        className="border-0 bg-transparent outline-none text-xs text-foreground placeholder:text-[#475569] w-full"
                    />
                </div>

                <StartWorkflowButton className="bg-gradient-to-br from-[#FF6B35] to-[#E85D2C] text-white shadow-[0_2px_12px_rgba(255,107,53,0.25)] hover:shadow-[0_4px_20px_rgba(255,107,53,0.4)] hover:-translate-y-px" />

                <button
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="w-[34px] h-[34px] rounded-[9px] border border-border flex items-center justify-center text-muted-foreground hover:border-[#2D3F55] hover:text-[#94A3B8] transition-all"
                    title="Toggle theme"
                >
                    <Sun className="h-[15px] w-[15px] hidden dark:block" />
                    <Moon className="h-[15px] w-[15px] block dark:hidden" />
                </button>

                <div className="w-[34px] h-[34px] rounded-full bg-primary/10 border border-primary/15 flex items-center justify-center text-primary text-xs font-semibold">
                    U
                </div>
            </div>
        </header>
    );
}
```

- [ ] **Step 2: Verify types + commit**

Run: `npx tsc --noEmit --project apps/app/tsconfig.json 2>&1 | head -5`
Expected: no output

```bash
git add apps/app/src/components/layout/Topbar.tsx
git commit -m "style(app): topbar sticky blur, dynamic title, theme toggle"
```

---

### Task 4: Update DashboardLayout — full-height flex + ambient orb

**Files:**
- Modify: `apps/app/src/components/layout/DashboardLayout.tsx`

- [ ] **Step 1: Replace entire file**

```tsx
"use client";

import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background relative">
            {/* Ambient brand orb — subtle teal glow top-right */}
            <div className="fixed top-[-200px] right-[-120px] w-[550px] h-[550px] rounded-full bg-[radial-gradient(circle,rgba(45,212,168,0.035)_0%,transparent_65%)] pointer-events-none z-0" />

            <div className="flex relative z-[1]">
                <Sidebar />
                <div className="flex-1 flex flex-col min-w-0">
                    <Topbar />
                    <main className="flex-1 p-7 max-w-[1140px]">{children}</main>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Verify build + commit**

Run: `npm run build --workspace=apps/app 2>&1 | grep -E "error|Error|✓"`
Expected: `✓ Compiled successfully`

```bash
git add apps/app/src/components/layout/DashboardLayout.tsx
git commit -m "style(app): dashboard layout full-height sidebar, ambient orb"
```

---

### Task 5: Create Pipeline component

**Files:**
- Create: `apps/app/src/components/dashboard/Pipeline.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { Layers } from "lucide-react";

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
      {/* Subtle glow */}
      <div className="absolute top-[-60px] left-1/2 -translate-x-1/2 w-[400px] h-[100px] bg-[radial-gradient(ellipse,rgba(45,212,168,0.025),transparent)] pointer-events-none" />

      <div className="flex justify-between items-center mb-5 relative">
        <h2 className="font-display text-[15px] font-semibold">Pipeline</h2>
        <span className="text-[11px] text-[#475569]">{total} project{total !== 1 ? "s" : ""} across 5 stages</span>
      </div>

      {/* Stages with connecting track */}
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
              {/* Tooltip */}
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-popover border border-[#2D3F55] rounded-md px-2.5 py-1 text-[10px] text-[#94A3B8] whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
                {s.count} project{s.count !== 1 ? "s" : ""} in {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Progress bar + legend */}
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
```

- [ ] **Step 2: Verify types + commit**

Run: `npx tsc --noEmit --project apps/app/tsconfig.json 2>&1 | head -5`
Expected: no output

```bash
git add apps/app/src/components/dashboard/Pipeline.tsx
git commit -m "feat(app): pipeline visualization component with stage bubbles, tooltips, progress bar"
```

---

### Task 6: Create EmptyState component

**Files:**
- Create: `apps/app/src/components/dashboard/EmptyState.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import StartWorkflowButton from "@/components/projects/StartWorkflowButton";
import { Zap } from "lucide-react";

const STEPS = [
  { num: "1", color: "#A78BFA", title: "Brainstorm Ideas", desc: "Generate content ideas with AI assistance and pick the best ones." },
  { num: "2", color: "#60A5FA", title: "Research & Produce", desc: "Deep-dive into your topic, then create blog, video, shorts & podcast content." },
  { num: "3", color: "#4ADE80", title: "Review & Publish", desc: "Quality check with AI review, then publish directly to WordPress." },
];

export default function EmptyState() {
  return (
    <>
      {/* Hero */}
      <div className="bg-card border border-border rounded-[14px] py-16 px-10 text-center relative overflow-hidden">
        <div className="absolute top-[-80px] left-1/2 -translate-x-1/2 w-[400px] h-[160px] bg-[radial-gradient(ellipse,rgba(45,212,168,0.05),transparent)] pointer-events-none" />
        <div className="relative">
          <div className="w-16 h-16 rounded-[20px] bg-primary/[0.08] border border-primary/[0.12] mx-auto mb-5 flex items-center justify-center">
            <Zap className="h-7 w-7 text-primary" strokeWidth={1.5} />
          </div>
          <h2 className="font-display text-xl font-bold mb-2">Welcome to Bright Curios</h2>
          <p className="text-muted-foreground text-sm max-w-[400px] mx-auto mb-6 leading-relaxed">
            Your AI-powered content workflow starts here. Create your first project to brainstorm, research, produce, and publish content across all formats.
          </p>
          <StartWorkflowButton className="bg-gradient-to-br from-[#FF6B35] to-[#E85D2C] text-white text-sm font-semibold px-7 py-3 rounded-[10px] shadow-[0_4px_16px_rgba(255,107,53,0.25)] hover:shadow-[0_6px_24px_rgba(255,107,53,0.4)] hover:-translate-y-0.5" />
        </div>
      </div>

      {/* Getting started steps */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
        {STEPS.map((step) => (
          <div key={step.num} className="bg-card border border-border rounded-[14px] p-6 text-center hover:border-primary/15 transition-colors">
            <div
              className="w-7 h-7 rounded-lg mx-auto mb-3 flex items-center justify-center font-display text-[13px] font-bold"
              style={{ background: `${step.color}1F`, color: step.color }}
            >
              {step.num}
            </div>
            <div className="text-[13px] font-semibold mb-1">{step.title}</div>
            <div className="text-muted-foreground text-xs leading-relaxed">{step.desc}</div>
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify types + commit**

Run: `npx tsc --noEmit --project apps/app/tsconfig.json 2>&1 | head -5`
Expected: no output

```bash
git add apps/app/src/components/dashboard/EmptyState.tsx
git commit -m "feat(app): empty state hero with getting-started steps"
```

---

### Task 7: Rewrite dashboard page.tsx — data fetching, stats, projects, activity

**Files:**
- Modify: `apps/app/src/app/page.tsx`

- [ ] **Step 1: Replace entire file**

```tsx
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
```

Note: Activity feed text says "in {stage}" instead of "moved to {stage}" — we don't have event history, only current state. This is honest about what the data represents.

Note: Ideas and Templates show 0 with dimmed styling. When future API endpoints exist (`/api/ideas`, `/api/templates`), these can be wired up with additional fetch calls.

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit --project apps/app/tsconfig.json 2>&1 | head -5`
Expected: no output (0 errors)

- [ ] **Step 3: Verify build**

Run: `npm run build --workspace=apps/app 2>&1 | grep -E "error|Error|✓"`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/app/page.tsx
git commit -m "feat(app): dashboard page — stats grid, pipeline, recent projects, activity, empty state"
```

---

### Task 8: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit --project apps/app/tsconfig.json 2>&1`
Expected: no output (0 errors)

- [ ] **Step 2: Full build**

Run: `npm run build --workspace=apps/app 2>&1 | tail -5`
Expected: `✓ Compiled successfully` + all 19 pages generated

- [ ] **Step 3: Run tests**

Run: `npm run test:app 2>&1 | tail -10`
Expected: 2/2 tests pass

- [ ] **Step 4: Zero hardcoded colors**

Run: `grep -rn "bg-white\|bg-gray-\|text-gray-\|border-gray-\|bg-zinc-" apps/app/src/ | wc -l`
Expected: `0`

- [ ] **Step 5: Visual check in browser**

Open `http://localhost:3000` and verify all items from the spec:
- [ ] Background is `#0A1017` (not near-black `#050A0D`)
- [ ] Sidebar full-height with 3px gradient strip at top
- [ ] Logo badge BC with teal gradient glow
- [ ] "Bright" in teal, "Curios" in white
- [ ] Active nav: teal background + left indicator bar with glow
- [ ] Topbar: sticky blur, dynamic title, theme toggle (moon/sun), orange CTA
- [ ] 4 stat cards: hover shows per-card colored glow
- [ ] Empty state: hero card with glow + 3 getting-started step cards
- [ ] Pipeline visible when projects exist
- [ ] Recent projects with stage-colored icons and badges
- [ ] Activity feed with glowing dots
