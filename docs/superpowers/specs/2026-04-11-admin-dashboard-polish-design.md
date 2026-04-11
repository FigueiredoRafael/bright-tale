# Admin Dashboard Polish — Design Spec

**Date:** 2026-04-11
**Status:** Approved
**Mockup:** `.superpowers/brainstorm/62926-1775917039/content/dark-polish-v5.html`

## Problem

The admin dashboard at `apps/web/src/app/admin/` inherits the landing page's dark theme from `globals.css`. The `@tn-figueiredo/admin` components (AdminShell, KpiSection, KpiCard) render against this background without the proper Tailwind color tokens they expect, resulting in a broken, low-quality UI.

Key issues:
- Missing Tailwind color tokens: `dash-card`, `dash-border`, `v-primary`, `v-secondary`, `vivid-*`
- Dashboard page uses inline styles with hardcoded dark fallbacks instead of Tailwind classes
- Sidebar lists 6 navigation items for pages that don't exist
- No visual hierarchy, icons, or polish in KPI cards

## Scope

**In scope:**
- Polish the existing dark theme dashboard to production quality
- Add missing Tailwind color tokens to `apps/web/globals.css`
- Refactor dashboard page from inline styles to Tailwind classes + admin package components
- Simplify sidebar to Dashboard + Usuários only
- Ensure `dark` class is on `<html>` for admin routes

**Out of scope:**
- Light theme (future work)
- Usuários page implementation (separate task, follows this one)
- Other admin pages (Pipeline, Agents, AI Configs, WordPress — removed from sidebar)

## Architecture

### Files Changed

1. **`apps/web/src/app/globals.css`** — Add admin-specific Tailwind theme tokens
2. **`apps/web/src/app/admin/(protected)/layout.tsx`** — Simplify sidebar config to 2 items, ensure dark class
3. **`apps/web/src/app/admin/(protected)/page.tsx`** — Full rewrite of dashboard page
4. **`apps/web/src/app/layout.tsx`** — May need `dark` class on `<html>` element

### Tailwind Color Tokens to Add

These tokens are required by `@tn-figueiredo/admin` components. Add them via `@theme` block in `globals.css`:

```css
/* Dashboard surface tokens */
--color-dash-card: #1e293b;
--color-dash-border: #1e3a5f;

/* Text tokens for admin components */
--color-v-primary: #f0f4f8;
--color-v-secondary: #cbd5e1;

/* Vivid accent colors (charts, badges, highlights) */
--color-vivid-green: #4ade80;
--color-vivid-orange: #ff8c42;
--color-vivid-purple: #a78bfa;
--color-vivid-blue: #60a5fa;
--color-vivid-teal: #2dd4bf;
--color-vivid-cyan: #22d3ee;
```

### Sidebar Configuration

```typescript
const config: AdminLayoutConfig = {
  appName: 'BrightTale',
  sections: [
    {
      group: 'Principal',
      items: [
        { label: 'Dashboard', path: '/admin', icon: 'LayoutDashboard' },
      ],
    },
    {
      group: 'Gestão',
      items: [
        { label: 'Usuários', path: '/admin/users', icon: 'Users' },
      ],
    },
  ],
  features: { darkMode: true },
};
```

### Dashboard Page Structure

Server component that fetches data via Supabase admin client and renders:

1. **Header row** — Title "Dashboard", subtitle, health dots (API + Supabase), "Atualizado Agora" indicator
2. **KPI grid** (2-column) with 4 section cards:
   - **Crescimento** (green) — Total users with sparkline + change %, New today
   - **Pipeline de Conteúdo** (blue) — Total projects with sparkline, Published count, Stage breakdown pills
   - **Conteúdo** (purple) — Research archives, Blog drafts, Idea archives (3-column inner grid)
   - **Sistema** (amber) — Active AI providers, Health status
3. **Cadastros Recentes** — Last 8 users with avatar initials, name, email, date, "novo" badge

### Visual Design Tokens (from approved mockup)

**Section cards:**
- Background: colored gradient tint (`rgba(30,41,59,0.45)` → section color at 0.08 opacity)
- Left border: 3px solid section color
- Border: `1px solid rgba(45,63,85,0.35)`
- Shadow: `0 4px 16px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)`
- Border-radius: 14px

**Inner KPI cards:**
- Background: `rgba(15,23,42,0.5)`
- Top border: 2px solid section color at 0.3 opacity
- Border-radius: 10px
- Hover: lift -1px, slightly brighter background
- Icon: 30x30 rounded-lg with section color at 0.1 opacity bg + 0.15 border

**Typography:**
- KPI values: 30px, weight 800, letter-spacing -0.03em
- KPI labels: 12px, weight 500, color #94a3b8
- Section titles: 12px, weight 700, uppercase, letter-spacing 0.06em
- Sub text: 11px, color #64748b

**Sparklines:**
- SVG, 90x44, positioned absolute bottom-right, opacity 0.18
- Gradient fill from section color (0.4 opacity → 0)
- Line stroke: section color, width 2

**Change badges:**
- Font 11px, weight 600, padding 2px 8px, border-radius 10px
- Up: green text + green bg at 0.1, with ↑ prefix

**Stage pills:**
- Font 10px, weight 600, padding 3px 10px, border-radius 20px
- Each stage gets its own semantic color

**User avatars:**
- 34x34, rounded-full, gradient background, initials centered
- Different gradient per user (purple, blue, green rotation)

### Data Fetching

Keep existing `fetchDashboardData()` function with `Promise.allSettled()` pattern. No changes to data layer — only presentation changes.

## Component Usage

The dashboard should use `KpiSection` and `KpiCard` from `@tn-figueiredo/admin/client` where they fit the design. For elements the package doesn't cover (sparklines, stage pills, health dots, recent users table), use custom inline components within the page file.

## Testing

- Visual verification in browser at `http://localhost:3002/admin`
- Confirm all KPI sections render with correct colors
- Confirm AdminShell sidebar shows only Dashboard + Usuários
- Confirm health badges reflect actual API/Supabase status
- Confirm stage breakdown pills render dynamically from data
- Typecheck passes: `npm run typecheck`

## Error Handling

Keep existing `Promise.allSettled()` resilience. Each metric shows 0 if its query fails. No changes needed.
