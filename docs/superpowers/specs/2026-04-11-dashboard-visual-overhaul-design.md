# Dashboard Visual Overhaul — Design Spec

**Date:** 2026-04-11
**Status:** Approved
**Mockup:** `.superpowers/brainstorm/85052-1775920192/content/dashboard-v4.html`

## Problem

The `apps/app` dashboard has visual issues:

1. Sidebar cuts off mid-page (doesn't stretch to viewport bottom)
2. Background `#050A0D` is near-black, disconnected from the brand palette used in `apps/web`
3. Active nav uses `bg-accent` (orange) — jarring; orange is for CTAs only
4. Dashboard content is bare: 3 plain cards + "No projects yet" text
5. No dark mode personality — could be any SaaS; no brand presence
6. Topbar is static ("Dashboard" always), no theme toggle

## Design Direction

**Brand Dark + Polish** (approved Option B from brainstorming).

Uses the `apps/web` surface scale with brand personality: logo badge, teal active states, subtle glows, gradient accents, pipeline visualization, activity feed.

## Surface & Color System

All colors align with `apps/web` CSS variables.

### Background Hierarchy (Dark Mode)

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-deep` / `--background` | `#0A1017` | Page background, main content area |
| `--bg-surface` / sidebar bg | `#0F1620` | Sidebar background |
| `--bg-elevated` / card bg | `#141E2A` | Cards, stat boxes, pipeline, sections |
| `--bg-card-hover` | `#1E2D40` | Hover states on elevated surfaces |
| `--border` | `#1E2E40` | All borders, separators |
| `--border-light` | `#2D3F55` | Hover border states |

### Text Hierarchy

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#F0F4F8` | Headings, stat values, project names |
| `--text-secondary` | `#94A3B8` | Body text, activity descriptions |
| `--text-muted` | `#64748B` | Labels, timestamps, stat labels |
| `--text-dim` | `#475569` | Disabled text, section labels, sidebar footer |

### Brand Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Brand teal | `#2DD4A8` | Active nav, logo, links, "View all", avatar border, primary glow |
| Accent orange | `#FF6B35` | CTA buttons only ("Start Workflow"), gradient `#FF6B35 → #E85D2C` |

### Stage Colors (Pipeline + Badges)

| Stage | Color | Hex |
|-------|-------|-----|
| Discovery | Purple | `#A78BFA` |
| Research | Blue | `#60A5FA` |
| Production | Orange | `#FF8555` |
| Review | Yellow | `#FBBF24` |
| Publish | Green | `#4ADE80` |

Each stage color is used at 12% opacity for badge backgrounds and 8% for project icon backgrounds.

## Layout Architecture

### Sidebar (248px, sticky full-height)

```
+--[ 3px brand gradient strip ]--+
|                                |
|  [BC badge]  Bright Curios     |
|                                |
|  > Dashboard        (active)   |  <- teal bg + left indicator bar
|    Projects                    |
|    Ideas                       |
|    Research                    |
|    Blogs                       |
|    Videos                      |
|    Shorts                      |
|    Podcasts                    |
|    Templates                   |
|    Image Bank                  |
|    Assets                      |
|  ─────────────────────         |
|  SETTINGS                      |
|    All Settings                |
|    Image Generation            |
|                                |
|  ─────────────────────         |
|  v0.1                          |
+--------------------------------+
```

**Key details:**
- `position:sticky; top:0; height:100vh` — stretches to bottom
- `::before` gradient strip: `linear-gradient(90deg, #2DD4A8, #14967A, #0D7A65)` at top
- Logo badge: 34x34, `border-radius:10px`, gradient `#2DD4A8 → #0D7A65`, `box-shadow: 0 0 20px rgba(45,212,168,0.25)`
- "Bright" in teal (`#2DD4A8`), "Curios" in `--text-primary`
- Nav scroll area: `mask-image` gradient fade at bottom, 3px thin scrollbar
- Active item: `bg-primary/8`, color `#2DD4A8`, 3px left indicator bar with `box-shadow glow`
- Inactive items: `#64748B`, hover → `#94A3B8` + `bg-white/3%`
- All icons: SVG Lucide icons (16x16, stroke-width:2)
- Footer: `font-family: JetBrains Mono`, `#475569`

### Topbar (sticky, blur backdrop)

```
Dashboard                    [Search...] [Start Workflow] [theme] [U]
```

- `position:sticky; top:0; z-index:10`
- `background:rgba(10,16,23,0.85); backdrop-filter:blur(16px)`
- Title: Plus Jakarta Sans 17px/700
- Search: border box, 200px, `#1E2E40` border, hover → `#2D3F55`
- Start Workflow: gradient orange, `box-shadow: 0 2px 12px rgba(255,107,53,0.25)`
- Theme toggle: 34x34 icon button, moon/sun icon
- Avatar: 34x34 circle, `bg-primary/10`, border `primary/15`, teal "U"

### Main Content (max-width: 1140px, padding: 28px)

Content sections stack vertically:

1. **Stats Grid** (4 columns)
2. **Pipeline Card**
3. **Two-Column Section** (Recent Projects + Quick Actions/Activity)

## Component Specifications

### 1. Stats Grid

4 equal columns, 14px gap.

Each card:
- Background: `#141E2A`, border `#1E2E40`, `border-radius:14px`, padding 20px
- Hover: border color shifts to card's own color at 20% opacity, `box-shadow` glow at 6%, `translateY(-2px)`
- Label: 11px/500, `#64748B`
- Value: 32px/800, Plus Jakarta Sans, `#F0F4F8`, `letter-spacing:-1px`
- Sub-text: 11px/500, green `#4ADE80` with trend arrow for "+N this week", or `#64748B` for neutral info
- Icon: 42x42, `border-radius:12px`, color-specific `bg at 8%`

**Cards:**

| Card | Icon | Glow Color | Sub-text |
|------|------|-----------|----------|
| Total Projects | Layers (grid) | Teal | "+N this week" (green) |
| Active Now | Activity (pulse) | Green | "+N this week" (green) |
| Ideas | Lightbulb | Purple | "N viable" (neutral) |
| Templates | Database | Cyan | "N active" (neutral) |

### 2. Pipeline Card

Full-width card showing project distribution across workflow stages.

**Structure:**
- Header: "Pipeline" title + "N projects across 5 stages" subtitle
- Track: horizontal line connecting 5 stage bubbles (`linear-gradient` through all 5 stage colors)
- Stage bubbles: 44x44, `border-radius:12px`, stage color at 12% bg, bold number inside
- Hover on bubble: `scale(1.1)` + tooltip below ("N projects in Stage")
- Progress bar: 6px rounded bar, segmented proportionally by count, each segment in stage color
- Legend: dot + abbreviated label for each stage (Disc, Res, Prod, Rev, Pub)
- Subtle `radial-gradient` glow at top of card (`rgba(45,212,168,0.025)`)

### 3. Recent Projects List (left column, ~60% width)

Card with header "Recent Projects" + "View all →" link in teal.

Each project item:
- 10px/12px padding, `border-radius:10px`, transparent border
- Hover: `bg-white/1.5%`, border `primary/8%`, arrow turns teal
- Icon: 36x36, `border-radius:9px`, stage-colored bg at 8%, stage-specific Lucide icon
- Name: 13px/500, `#F0F4F8`, truncate with ellipsis
- Meta row: stage badge + "Xh ago" timestamp
- Badge: 10px/600, stage color at 12% bg, `border-radius:6px`
- Arrow: chevron-right, `#2D3F55` → `#2DD4A8` on hover

**Project icons per stage:**

| Stage | Icon |
|-------|------|
| Discovery | Search |
| Research | FileText |
| Production | AlignLeft (lines) |
| Review | Eye |
| Publish | Check |

### 4. Quick Actions (right column top)

Stacked button list:
- Primary: "Start New Workflow" — gradient orange, white text, `box-shadow`
- Secondary buttons: border `#1E2E40`, color `#94A3B8`, hover → `#2D3F55` border + `#F0F4F8` text
- Each with Lucide icon (16x16) on left
- Buttons: View All Projects, Manage Templates, Research Library

### 5. Activity Feed (right column bottom, flex:1)

Header: "Recent Activity" + "View all →" link.

Each activity item:
- 8px dot in stage color + `::after` pseudo-glow (opacity 0.25, no filter:blur)
- Text: `#94A3B8` with `<strong>` project name in `#E2E8F0`
- Timestamp: `#475569`, 11px

### 6. Empty State (0 projects)

Replaces pipeline + two-column section when no projects exist.

**Stats row:** Same 4 cards but values show "0" in `#2D3F55` (dimmed), icons at 5% opacity.

**Hero card:**
- Full-width, centered, 60px vertical padding
- Radial glow at top (`rgba(45,212,168,0.05)`)
- Icon: 64x64, `border-radius:20px`, `bg-primary/8%` + `border primary/12%`, lightning bolt SVG
- Outer glow ring: `::after` pseudo at -8px inset, `bg-primary/4%`
- Title: "Welcome to Bright Curios", 20px/700 Plus Jakarta Sans
- Description: "Your AI-powered content workflow starts here...", 14px, `#64748B`, max-width 400px
- CTA button: "Start Your First Workflow", 14px/600, gradient orange, `box-shadow`, `border-radius:10px`

**Getting Started Steps:** 3 cards below hero.

| Step | Color | Title | Description |
|------|-------|-------|-------------|
| 1 | Purple | Brainstorm Ideas | Generate content ideas with AI assistance and pick the best ones. |
| 2 | Blue | Research & Produce | Deep-dive into your topic, then create blog, video, shorts & podcast content. |
| 3 | Green | Review & Publish | Quality check with AI review, then publish directly to WordPress. |

## Animations

- `fadeInUp`: stats (0s delay), pipeline (0.05s), two-col (0.1s) — `translateY(8px)` + opacity
- Stat card hover: `translateY(-2px)` + border glow + box-shadow, 0.3s ease
- Pipeline bubble hover: `scale(1.1)`, 0.2s
- Project item hover: border color shift, 0.2s
- CTA button hover: `translateY(-1px)` + increased shadow, 0.2s

## Files to Modify

| File | Changes |
|------|---------|
| `apps/app/src/app/globals.css` | Update `--background` to `#0A1017`, add surface tokens, add `--sidebar` token pointing to `#0F1620` |
| `apps/app/src/components/layout/DashboardLayout.tsx` | Sidebar sticky full-height flex layout |
| `apps/app/src/components/layout/Sidebar.tsx` | Brand logo badge, teal active states with indicator bar, gradient strip, scroll mask, Lucide SVG icons |
| `apps/app/src/components/layout/Topbar.tsx` | Sticky blur backdrop, theme toggle, dynamic title |
| `apps/app/src/app/page.tsx` | Full dashboard rewrite: stats grid, pipeline, recent projects, quick actions, activity feed, empty state |
| `apps/app/src/components/theme/theme-provider.tsx` | Ensure next-themes with `defaultTheme="dark"` |

## Scope Boundaries

- **In scope:** Dashboard page, layout shell (sidebar/topbar), globals.css tokens, theme provider
- **Out of scope:** Other pages (projects, blogs, research, etc.), API changes, new data endpoints
- **Data:** Stats and activity use existing `/api/projects` endpoint. Trend data ("+3 this week") is computed client-side by filtering projects with `created_at` within the last 7 days. Activity feed shows the 5 most recent projects sorted by `updated_at`, displaying "{title} moved to {stage}" as the activity text. No new API endpoints needed.
- **Responsive:** Mobile handled by existing `hidden md:flex` pattern on sidebar. Stats grid goes to 2-col on tablet, 1-col on mobile. Pipeline stages wrap or scroll horizontally on small screens.
