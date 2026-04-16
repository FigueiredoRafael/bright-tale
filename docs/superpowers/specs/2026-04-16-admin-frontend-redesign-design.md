# Admin Frontend Redesign — Design Spec

**Date:** 2026-04-16
**Status:** Approved

## Goal

Elevate the admin dashboard from functional-but-basic to a polished, professional interface with glassmorphism dark theme, light/dark toggle, interactive pipeline visualization, proper data charts, and consistent design system across all 5 pages.

## Approach

**Component-Level Overhaul** — Build shared design primitives (themed cards, chart wrappers, table components), then restyle each page using those building blocks. This ensures consistency across pages and makes new pages automatically inherit the look.

## Architecture

### Theme System

- **`next-themes`** for system-preference detection + manual toggle
- Toggle button in top-right header area
- Default follows OS preference (`system`)
- ~20 semantic CSS custom properties in `globals.css` scoped under `:root` (light) and `.dark` (dark)

**Token categories:**
- Surfaces: `--admin-bg`, `--admin-card`, `--admin-surface`, `--admin-sidebar`
- Borders: `--admin-border`, `--admin-border-subtle`
- Text: `--admin-text-primary`, `--admin-text-secondary`, `--admin-text-dim`
- Semantic: `--admin-success`, `--admin-warning`, `--admin-error`

**Dark palette:**
- bg: `#0C1017`, card: `#131A24`, border: `#1C2635`
- text-primary: `#F1F5F9`, text-secondary: `#94A3B8`, text-dim: `#64748B`

**Light palette:**
- bg: `#F8FAFC`, card: `#FFFFFF`, border: `#E2E8F0`
- text-primary: `#0F172A`, text-secondary: `#64748B`, text-dim: `#94A3B8`

**Brand colors (constant across themes):**
- Brand teal: `#1DB990`
- Accent orange: `#FF6B35`
- Purple: `#A78BFA`
- Blue: `#4A90D9`
- Success green: `#4ADE80`
- Warning amber: `#F59E0B`
- Error red: `#FF5252`

### Glassmorphism Card Pattern

**Dark mode:**
```css
background: linear-gradient(135deg, rgba(19,26,36,0.8), rgba(19,26,36,0.4));
backdrop-filter: blur(12px);
border: 1px solid rgba(255,255,255,0.06);
border-radius: 12px;
```

**Light mode:**
```css
background: white;
border: 1px solid var(--admin-border);
border-radius: 12px;
box-shadow: 0 1px 3px rgba(0,0,0,0.06);
```

**Glow accent:** 2px gradient top-edge on featured cards:
```css
/* Pseudo-element or absolute div */
position: absolute;
top: 0; left: 15%; right: 15%; height: 2px;
background: linear-gradient(90deg, transparent, [stage-color], transparent);
```

### Stage Color System

Consistent across all pages (pipeline, badges, charts, icons):

| Stage | Color | Usage |
|-------|-------|-------|
| Brainstorm | `#A78BFA` (purple) | Pipeline card, badge, chart line |
| Research | `#4A90D9` (blue) | Pipeline card, badge, chart line |
| Production | `#1DB990` (teal) | Pipeline card, badge, chart line |
| Review | `#F59E0B` (amber) | Pipeline card, badge, chart line |
| Published | `#4ADE80` (green) | Badge, status indicator |

### Chart Library

**Recharts** — React-native, tree-shakeable, composable.

Components used:
- `LineChart` / `AreaChart` — dashboard platform activity, analytics credit usage
- `BarChart` (horizontal) — analytics cost by stage
- `PieChart` (donut) — analytics provider distribution

Custom theme config for all Recharts:
- Grid: `rgba(255,255,255,0.04)` (dark) / `#E2E8F0` (light)
- Axis text: `#64748B`
- Tooltip: glassmorphism card with dark background
- Lines: stage colors with gradient fill area

**Sparklines:** Inline SVG in KPI cards — lightweight, no Recharts dependency. Small area charts showing 7-day trend.

---

## Page Designs

### 1. Dashboard

**Layout (top to bottom):**

| Row | Content | Width |
|-----|---------|-------|
| Header | Title, date, system badge, date range toggle (7d/30d) | Full |
| Row 1 | 4 KPI cards: Users, Active Projects, Published, Credits Used. Each has sparkline + delta | 4-col grid |
| Row 2 | "Platform Activity" line chart (Recharts) with 4 series + interactive legend cards below | Full |
| Row 3 | Pipeline by Stage (stacked bar) + System Status (health list) | 1:1 grid |
| Row 4 | Content Library (Ideas/Research/Drafts/Assets counts) + Recent Activity feed | 1:2 grid |

**KPI cards:** Glassmorphism + colored top glow + inline SVG sparkline (right side) + big number + delta indicator (▲/▼ with color).

**Line chart:** Recharts `ResponsiveContainer` → `LineChart` with `CartesianGrid`, `XAxis`, `YAxis`, `Tooltip`, 4 `Line` components. Curved lines (`type="monotone"`), gradient fill areas.

**Legend cards:** 4 horizontal cards below chart. Each has:
- 3px color bar on top edge
- Series label + checkmark toggle box
- Current period value (big number)
- Delta vs previous period
- Click toggles chart line visibility (Recharts `hide` prop)
- Active: color-tinted background, full opacity
- Toggled off: 45% opacity, dimmed bar, empty checkbox

**Pipeline stacked bar:** Horizontal bar with stage colors, legend dots below.

**System status:** Service list (API, Database, AI Providers, WordPress) with pulsing green dots + status text.

**Content library:** Vertical stat list with stage-colored icons: Ideas, Research, Drafts, Assets — each with icon + label + count.

**Recent activity feed:** Timeline with gradient icon circles, event descriptions, user/timestamp, stage-colored pill badges. Events: drafts created, publishes, reviews, brainstorms, signups.

### 2. Agents Page

**Layout:**

| Row | Content |
|-----|---------|
| Header | Title + subtitle |
| Pipeline | Interactive card-based flow visualization |
| Table | Agent list with stage badges |

**Pipeline visualization:**
- Horizontal flow: Brainstorm → Research → Production (fan-out) → Review
- Each stage is a glassmorphism card with stage color tinting
- Card content: stage icon (gradient square), stage number, agent name, status dot (green/amber/red with glow)
- **Production fan-out:** Dashed teal border groups a 2x2 grid of sub-agent cards (Blog, Video, Podcast, Shorts). "Stage 3 — Production" label floats above container. Each sub-card is compact with its own status.
- Animated dashed SVG arrows between stages (CSS `stroke-dashoffset` animation)
- Hover: border glow intensifies in stage color + subtle box-shadow
- Click: navigates to agent editor page

**Agent table:**
- Color indicator dot (stage color) + agent name
- Monospace slug column
- Stage pill badge (stage-colored background)
- Relative timestamp
- "Edit →" link in brand teal

### 3. Analytics Page

**Layout:**

| Row | Content | Width |
|-----|---------|-------|
| Header | Title, subtitle, date range toggle (7d/30d/90d) | Full |
| Row 1 | 4 KPI cards: Total Cost, Credits Used, Tokens, API Calls | 4-col grid |
| Row 2 | Credit usage area chart + Cost by Stage horizontal bars | 3:2 grid |
| Row 3 | Top Organizations leaderboard + Provider donut chart | 1:1 grid |
| Row 4 | Recent usage table (filterable) | Full |

**Credit usage chart:** Recharts `AreaChart` with single teal line + gradient fill. Same dark theme.

**Cost by Stage:** Horizontal progress bars with stage colors. Label + cost value above each bar.

**Top Orgs:** Ranked list with numbered gradient badges (1st teal, 2nd blue, 3rd purple), org name, credit count, inline progress bar.

**Provider donut:** Recharts `PieChart` with `innerRadius`/`outerRadius` for donut effect. Center shows total call count. Side legend with color dots, provider name, percentage.

**Recent usage table:** Columns: Provider, Model (monospace), Stage (colored pill), Tokens, Cost, Time. Filter dropdowns for provider and stage.

### 4. Users Page

**Layout:**

| Row | Content |
|-----|---------|
| Header | Title + subtitle |
| Row 1 | 5 KPI cards: Total, Active, Premium, Admins, New Today |
| Filters | Search bar + Plan/Status/Role dropdown filters |
| Table | User list with avatars, badges, actions |

**Changes from current:**
- Gradient avatar circles with initials (not plain)
- Pill badges for plan (colored: Pro=teal, Free=gray), role (Admin=orange, User=gray), status (green glow dot)
- Icon action buttons: edit (pencil) + delete (trash) with subtle borders
- Delete button border turns red on hover
- Glassmorphism search bar + filter dropdowns

### 5. Organizations Page

**Layout:**

| Row | Content |
|-----|---------|
| Header | Title + subtitle |
| Row 1 | 4 KPI cards: Total Orgs, Paid Plans, Credits Used, Total Members |
| Table | Org list with avatars, credit bars, actions |

**Changes from current:**
- Square gradient avatars with initials (to distinguish from round user avatars)
- Inline credit progress bar in credits column (bar + "used / limit" text)
- Plan pill badges (same pattern as users)
- Edit action button

---

## Shared Components to Build/Modify

| Component | Action | Description |
|-----------|--------|-------------|
| `AdminCard` | New | Glassmorphism card wrapper with optional top glow color |
| `AdminKpiCard` | New | KPI card with label, value, delta, optional sparkline, glow color |
| `AdminTable` | New | Styled table wrapper with header, hover rows, glassmorphism container |
| `AdminBadge` | New | Pill badge with color variants (stage, plan, role, status) |
| `AdminChart` | New | Recharts wrapper with dark/light theme config |
| `SparklineSvg` | New | Inline SVG sparkline (data points → area path) |
| `ThemeToggle` | New | Sun/Moon icon button, uses `next-themes` `useTheme()` |
| `PipelineGraph` | Rewrite | Interactive card-based pipeline with production fan-out |
| `LegendCard` | New | Interactive chart legend card with toggle, value, delta |
| `StatusDot` | New | Pulsing status indicator (green/amber/red) |

---

## Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| `next-themes` | Light/dark theme toggle | latest |
| `recharts` | Charts (line, area, bar, pie) | ^2.x |

Both are lightweight, no heavy dependencies.

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/web/src/app/globals.css` | Add semantic admin CSS vars for light/dark |
| `apps/web/src/app/admin/(protected)/layout.tsx` | Wrap in ThemeProvider, add ThemeToggle to header |
| `apps/web/src/components/admin/AdminCard.tsx` | Create |
| `apps/web/src/components/admin/AdminKpiCard.tsx` | Create |
| `apps/web/src/components/admin/AdminTable.tsx` | Create |
| `apps/web/src/components/admin/AdminBadge.tsx` | Create |
| `apps/web/src/components/admin/AdminChart.tsx` | Create |
| `apps/web/src/components/admin/SparklineSvg.tsx` | Create |
| `apps/web/src/components/admin/ThemeToggle.tsx` | Create |
| `apps/web/src/components/admin/LegendCard.tsx` | Create |
| `apps/web/src/components/admin/StatusDot.tsx` | Create |
| `apps/web/src/components/admin/PipelineGraph.tsx` | Rewrite |
| `apps/web/src/app/admin/(protected)/page.tsx` | Rewrite dashboard |
| `apps/web/src/app/admin/(protected)/agents/page.tsx` | Restyle with new components |
| `apps/web/src/app/admin/(protected)/analytics/page.tsx` | Rewrite with charts |
| `apps/web/src/app/admin/(protected)/users/page.tsx` | Restyle table + filters |
| `apps/web/src/app/admin/(protected)/users/components/*` | Update UsersTable, UsersFilters |
| `apps/web/src/app/admin/(protected)/orgs/page.tsx` | Restyle table |
| `apps/web/src/app/admin/(protected)/orgs/components/*` | Update OrgsTable |

---

## Non-Goals

- No changes to API endpoints or database
- No changes to authentication flow
- No new admin features (only visual/UX overhaul)
- No changes to `apps/app` or `apps/api`
- No removal of `@tn-figueiredo/admin` package (AdminShell stays, just themed)
