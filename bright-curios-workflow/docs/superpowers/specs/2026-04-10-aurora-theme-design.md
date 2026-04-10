# Aurora Theme — Design Spec

**Date:** 2026-04-10
**Status:** Approved (pending review)
**Scope:** Two workstreams — (A) extend `@tn-figueiredo/shared/theme` with optional rich design tokens; (B) consume the new schema in `bright-tale` to implement the Aurora (Teal) theme with light + dark modes.

---

## 1. Context

`bright-tale` (Next.js 16 + Tailwind CSS v4 + shadcn/ui "new-york") currently uses the default Geist fonts and a neutral oklch-based palette. The selected design direction is **Aurora**, a teal-primary theme inspired by Linear/Vercel/Raycast that avoids the "AI Purple Problem" and follows dark-mode-first principles.

`bright-tale` is standalone but will consume reusable packages from the `@tn-figueiredo` ecosystem (private GitHub Packages registry). The ecosystem already exposes `@tn-figueiredo/shared/theme` (currently at `0.7.0`) with `createTheme()` and a minimal `AppTheme` schema covering semantic (shadcn-compatible) tokens only.

The Aurora spec requires richer tokens than the current `AppTheme` supports: brand color scales, accent with hover/foreground, uniform dark/light surface sets, semantic colors, a vivid palette for charts, named typography scale, box shadows with brand glow, and CSS-unit scales for padding/gap/radii. Rather than extend locally inside `bright-tale`, we will **extend the shared package** so future apps can adopt the same schema.

## 2. Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Extend `@tn-figueiredo/shared/theme` with **additive optional** fields (no breaking change) | Backward compatible with `tonagarantia/apps/*`; minor bump `0.7.0 → 0.8.0` |
| 2 | Each app defines its own theme instance via `createTheme()` using the shared schema | Cross-app consistency of shape, per-app freedom of values |
| 3 | `bright-tale` adopts **Aurora (Teal)** | Matches approved design direction |
| 4 | Fonts: **Plus Jakarta Sans** (display) + **Inter** (body) + **JetBrains Mono** (mono) via `next/font/google` | Matches Aurora spec |
| 5 | Mode: **respect `prefers-color-scheme`**, fallback **dark** | "dark-first" but not opinionated |
| 6 | Source of truth: `src/lib/theme/aurora.ts` (TS) + `src/app/globals.css` mirror, guaranteed by a **Vitest parity test** | Keeps TS as canonical without needing a code generator |
| 7 | **Out of scope for this cycle:** refactor of existing components, Storybook stories, animation tokens, theme toggle wiring in `Topbar` | YAGNI; reduce blast radius |

---

## 3. Workstream A — Extend `@tn-figueiredo/shared/theme`

### 3.1 Goal
Ship `@tn-figueiredo/shared@0.8.0` with new optional fields on `AppTheme` that enable rich design systems (palette, surfaces, shadows, extended typography, CSS scales) while leaving every current consumer untouched.

### 3.2 Design principles
- **Additive only**: every new field is `readonly` + `optional`. No existing `AppTheme` value becomes invalid.
- **Layering explicit** (documented in JSDoc):
  - `colors` = **semantic layer** (what shadcn / NativeWind consumes; 15 tokens)
  - `palette` = **reference layer** (raw brand scales, vivid, surfaces)
  - If both are provided, the consumer is responsible for consistency. Automatic derivation (`paletteToSemantic()` helper) is deferred to a future minor.
- **Coherent namespacing**: all typographic tokens live under `typography.*`; all CSS-unit spatial scales live under `scales.*`. Nothing new at the root.
- **Uniform shapes**: `SurfaceSet` has the same shape for light and dark; apps duplicate values when a level (e.g. `elevated`) doesn't differ between the two.
- **Open records** for convention-oriented buckets (`vivid`, `shadows`, `typography.scale`): flexibility without over-typing.

### 3.3 `packages/shared/src/theme/types.ts` — full updated content

```ts
// ════════════════ Existing (unchanged) ════════════════

export interface ThemeColors {
  readonly primary: string;
  readonly primaryForeground: string;
  readonly secondary: string;
  readonly secondaryForeground: string;
  readonly background: string;
  readonly foreground: string;
  readonly muted: string;
  readonly mutedForeground: string;
  readonly accent: string;
  readonly accentForeground: string;
  readonly destructive: string;
  readonly border: string;
  readonly ring: string;
  readonly card: string;
  readonly cardForeground: string;
}

export interface ThemeSpacing {
  readonly xs: number;
  readonly sm: number;
  readonly md: number;
  readonly lg: number;
  readonly xl: number;
  readonly '2xl': number;
}

export interface ThemeRadii {
  readonly sm: number;
  readonly md: number;
  readonly lg: number;
  readonly full: number;
}

// ════════════════ New — Optional Rich Tokens ════════════════

/**
 * 10-step color scale (Tailwind-compatible). Step 950 is optional
 * to support Tailwind v4.
 */
export interface ColorScale {
  readonly 50: string;
  readonly 100: string;
  readonly 200: string;
  readonly 300: string;
  readonly 400: string;
  readonly 500: string;
  readonly 600: string;
  readonly 700: string;
  readonly 800: string;
  readonly 900: string;
  readonly 950?: string;
}

/**
 * Brand palette: the full scale plus a foreground (text color that
 * reads well on brand[500]). Apps use `foreground` for text/CTAs
 * placed on top of brand surfaces.
 */
export interface BrandPalette {
  readonly scale: ColorScale;
  readonly foreground?: string;
}

/**
 * CTA / accent color set:
 * - `main` — default
 * - `hover` — interactive state
 * - `light` — soft background (pills, tinted alerts)
 * - `foreground` — text placed on `main`
 */
export interface AccentColors {
  readonly main: string;
  readonly hover: string;
  readonly light: string;
  readonly foreground?: string;
}

/**
 * Uniform surface set — same shape for light and dark modes.
 * Apps duplicate values (e.g. base === surface) when a level
 * does not differ in that mode.
 *
 * - `base`     — lowest z (page background)
 * - `surface`  — default container
 * - `elevated` — modals, popovers
 * - `card`     — cards
 * - `border`   — hairlines
 * - `text`     — typographic hierarchy on these surfaces
 */
export interface SurfaceSet {
  readonly base: string;
  readonly surface: string;
  readonly elevated: string;
  readonly card: string;
  readonly border: string;
  readonly text: {
    readonly primary: string;
    readonly secondary: string;
    readonly muted: string;
  };
}

export interface SemanticColors {
  readonly success: string;
  readonly warning: string;
  readonly error: string;
  readonly info: string;
}

/**
 * Reference palette — raw design system values.
 *
 * Layering note: `colors` (semantic layer) and `palette` (reference
 * layer) may coexist. If both are provided, the consumer is
 * responsible for keeping them consistent.
 */
export interface ThemePalette {
  readonly brand: BrandPalette;
  readonly accent: AccentColors;
  readonly surfaces: {
    readonly light: SurfaceSet;
    readonly dark: SurfaceSet;
  };
  readonly semantic: SemanticColors;
  /** Chart / highlight colors, keyed by name (e.g. teal, orange). */
  readonly vivid: Readonly<Record<string, string>>;
}

/** Single typography token (size + line-height + weight). */
export interface TypeToken {
  readonly size: string; // e.g. "40px"
  readonly line: string; // e.g. "48px"
  readonly weight: number | string; // 400 | "600" | "bold"
  /** Doc-only: describes intended use (e.g. "Page titles"). */
  readonly use?: string;
}

/** One font family with role + loaded weights. */
export interface FontFace {
  readonly family: string;
  readonly weights: readonly (number | string)[];
  readonly role?: string;
}

/**
 * Extended typography. Legacy `fontFamily` + `fontSize` (numeric)
 * remain valid for RN / mobile consumers. Web apps use the new
 * optional `families` + `scale` fields.
 */
export interface ThemeTypography {
  readonly fontFamily: { readonly sans: string; readonly mono: string };
  readonly fontSize: {
    readonly xs: number;
    readonly sm: number;
    readonly base: number;
    readonly lg: number;
    readonly xl: number;
    readonly '2xl': number;
    readonly '3xl': number;
  };

  // NEW optional additions
  readonly families?: {
    readonly display: FontFace;
    readonly body: FontFace;
    readonly mono: FontFace;
  };
  /**
   * Named tokens (e.g. display, heading-lg, body, caption).
   * Keys are free so each app can use its own naming conventions.
   */
  readonly scale?: Readonly<Record<string, TypeToken>>;
}

/**
 * Web-oriented CSS-unit scales. Kept separate from `spacing` / `radii`
 * (which are numeric for RN). Apps that ship for web fill these.
 */
export interface ThemeScales {
  readonly padding?: Readonly<Record<string, string>>;
  readonly gap?: Readonly<Record<string, string>>;
  readonly radii?: Readonly<Record<string, string>>;
}

/**
 * Box shadows. Open record so apps can define named effects
 * beyond elevation (e.g. `glow`, `glow-success`, `inner`).
 * Suggested convention: `sm | md | lg | glow`.
 */
export type ThemeShadows = Readonly<Record<string, string>>;

// ════════════════ AppTheme (extended) ════════════════
export interface AppTheme {
  // v1 (unchanged, still required)
  readonly colors: {
    readonly light: ThemeColors;
    readonly dark: ThemeColors;
  };
  readonly spacing: ThemeSpacing;
  readonly typography: ThemeTypography;
  readonly radii: ThemeRadii;

  // v2 additive optional
  readonly palette?: ThemePalette;
  readonly shadows?: ThemeShadows;
  readonly scales?: ThemeScales;
}
```

### 3.4 `create-theme.ts` — unchanged
The existing `deepFreeze` implementation already recursively freezes nested objects of arbitrary depth. The only change is that `createTheme` now receives a richer input when apps opt in. No code changes are required; tests validate the deep-freeze behaviour for the new nested levels.

### 3.5 `theme/index.ts` — barrel updated

```ts
export type {
  AppTheme,
  ThemeColors,
  ThemeSpacing,
  ThemeTypography,
  ThemeRadii,
  ColorScale,
  BrandPalette,
  AccentColors,
  SurfaceSet,
  SemanticColors,
  ThemePalette,
  TypeToken,
  FontFace,
  ThemeScales,
  ThemeShadows,
} from './types.js';
export { createTheme } from './create-theme.js';
```

The root `src/index.ts` already re-exports `./theme/index.js`, so the new types become available both via `@tn-figueiredo/shared` and `@tn-figueiredo/shared/theme`.

### 3.6 Tests (`packages/shared/src/__tests__/theme.test.ts`)

Keep the 10 existing tests. Add:

1. **Backward-compat compile-time**: a `const v1Only: AppTheme = { /* only v1 fields */ }` declaration. Compilation passes = new fields are truly optional.
2. **Backward-compat runtime**: `createTheme(v1Only)` produces a frozen object; `theme.palette`, `theme.shadows`, `theme.scales` are `undefined`.
3. **Preserves `palette`**: with full content, every sub-field round-trips (brand.scale, brand.foreground, accent.main/hover/light/foreground, surfaces.light, surfaces.dark, semantic, vivid).
4. **Deep-freeze 3 levels**: `palette.surfaces.dark.text` is frozen.
5. **Deep-freeze `palette.brand.scale`** (numeric-key object).
6. **Preserves `shadows`** (open record, including `glow`).
7. **Preserves `typography.families` and `typography.scale`**; the `weights` array inside each `FontFace` is frozen.
8. **Preserves `scales.padding` / `gap` / `radii`**; each sub-record is frozen.
9. **`palette.vivid` accepts arbitrary keys** (test with `{ teal, orange, custom1, custom2 }`).
10. **`SurfaceSet` shape uniformity**: the same factory builds a valid light and dark surface set.

Also extend `__tests__/subpath-imports.test.ts`:

11. `import type { ThemePalette, ColorScale, SurfaceSet, FontFace } from '@tn-figueiredo/shared/theme'` compiles and does not throw at runtime.

### 3.7 README update — `packages/shared/README.md`

Expand the `./theme` section to approximately 40 lines covering:

- One-paragraph layering explanation (semantic `colors` vs reference `palette`).
- Minimal example (v1 only — still valid).
- Rich example (Aurora-style, with `palette`, `shadows`, `scales`, `typography.scale`).
- Explicit note: *"All new fields are optional and additive. No migration is required for existing consumers."*
- Pointer to `AppTheme` in `types.ts` for the complete field list.

### 3.8 Local validation (pre-changeset)

Run at the monorepo root:

```bash
cd ~/Workspace/tnf-ecosystem
npm run build       # turbo run build — shared compiles
npm run typecheck   # turbo run typecheck — all packages
npm run test        # turbo run test — new tests included
```

Then validate against the real tonagarantia consumers via workspace link:

```bash
# 1. Link the local shared package
cd ~/Workspace/tnf-ecosystem/packages/shared && npm link

# 2. In each consumer that imports @tn-figueiredo/shared:
cd ~/Workspace/tonagarantia
npm link @tn-figueiredo/shared
(cd apps/web && npm run typecheck && npm run build)
(cd apps/api && npm run typecheck)      # if the script exists
(cd apps/mobile && npm run typecheck)   # RN consumer
```

If any typecheck fails, fix it in `packages/shared` before creating the changeset — the failure is a backward-compat regression and must be resolved.

### 3.9 Changeset

```bash
cd ~/Workspace/tnf-ecosystem
npx changeset add
# select: @tn-figueiredo/shared
# bump: minor
```

Changeset file content:

```md
---
'@tn-figueiredo/shared': minor
---

Extend `AppTheme` with optional rich design tokens.

Adds `palette` (brand scale, accent with foreground, uniform light/dark
surface sets, semantic colors, vivid record), `shadows` (open record),
`scales` (padding/gap/radii as CSS-unit records), and extended
`typography` (named `families` and `scale` token record).

All new fields are optional — no migration required for existing
consumers. Enables Aurora-style design systems in web apps
(Bright-Tale onwards).
```

### 3.10 Release flow (verified)

1. Create a working branch (e.g. `feat/shared-theme-v2`), open a PR into `main`.
2. Merge the PR. Push to `main` triggers `.github/workflows/release.yml`.
3. `changesets/action@v1` detects the pending changeset → opens / updates a **"Version Packages"** PR that bumps `0.7.0 → 0.8.0` and appends a CHANGELOG entry.
4. Merge the "Version Packages" PR. CI re-runs and executes `npm run publish-packages` → `turbo run build && changeset publish`.
5. `@tn-figueiredo/shared@0.8.0` is published on `https://npm.pkg.github.com`.

### 3.11 Consumers to validate post-publish

| Consumer | Location | Validation |
|----------|----------|------------|
| `tonagarantia/apps/web` | `~/Workspace/tonagarantia/apps/web` | `npm run typecheck && npm run build` |
| `tonagarantia/apps/api` | `~/Workspace/tonagarantia/apps/api` | `npm run typecheck` (if script exists) |
| `tonagarantia/apps/mobile` | `~/Workspace/tonagarantia/apps/mobile` | `npm run typecheck` (RN consumer) |
| `tonagarantia/packages/shared` (internal shim) | `~/Workspace/tonagarantia/packages/shared` | Keep `^0.7.0` range (semver allows 0.8.x) or bump explicitly |

### 3.12 Acceptance checklist — Workstream A

- [ ] `npm run build` passes in `tnf-ecosystem`
- [ ] `npm run typecheck` passes at repo root
- [ ] `npm run test` passes (10 existing + 11 new theme tests + 1 new subpath import test)
- [ ] All listed tonagarantia consumers typecheck against the local build
- [ ] `packages/shared/README.md` theme section expanded
- [ ] Changeset file committed on the feature branch
- [ ] Feature branch merged into `main`
- [ ] CI opens a "Version Packages" PR bumping to `0.8.0`
- [ ] Version Packages PR merged; CI publishes successfully
- [ ] `@tn-figueiredo/shared@0.8.0` visible on GitHub Packages
- [ ] Smoke install in a scratch project: `npm i @tn-figueiredo/shared@0.8.0` + `import type { ThemePalette } from '@tn-figueiredo/shared/theme'` compiles

### 3.13 Rollback plan

- **Type-level regression in a consumer**: release `0.8.1` with a fix via a new patch changeset. Backward compat is guaranteed by construction, so this is the expected path.
- **Severe regression in an unexpected consumer**: `npm deprecate @tn-figueiredo/shared@0.8.0 "Reverted — use 0.7.0"` and pin affected consumers back to `^0.7.0`.
- Because the change is strictly additive and optional, the risk of a forced rollback is low.

---

## 4. Workstream B — Consume Aurora in `bright-tale`

### 4.1 Goal
Install `@tn-figueiredo/shared@^0.8.0`, the three Aurora fonts, and create all files required to consume the theme in `bright-tale` (light + dark). **Do not** refactor existing components; migration happens incrementally in a later cycle.

### 4.2 Files to create

- `bright-curios-workflow/.npmrc`
- `bright-curios-workflow/src/lib/theme/aurora.ts`
- `bright-curios-workflow/src/lib/theme/index.ts`
- `bright-curios-workflow/src/lib/theme/__tests__/aurora.test.ts`
- `bright-curios-workflow/src/lib/theme/__tests__/css-parity.test.ts`
- `bright-curios-workflow/src/components/theme/theme-provider.tsx`
- `bright-curios-workflow/src/components/theme/theme-toggle.tsx`

### 4.3 Files to modify

- `bright-curios-workflow/src/app/globals.css` — replace oklch neutral tokens with Aurora values and add brand / accent / vivid / surface / shadow / radii tokens
- `bright-curios-workflow/src/app/layout.tsx` — swap Geist fonts for Plus Jakarta + Inter + JetBrains Mono, add `suppressHydrationWarning`, wrap in `<ThemeProvider>`, update metadata
- `bright-curios-workflow/package.json` — add `@tn-figueiredo/shared` dependency

### 4.4 `.npmrc`

```
@tn-figueiredo:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

The `${NODE_AUTH_TOKEN}` environment variable resolves against the user's shell / CI. The user already consumes `@tn-figueiredo` packages in tonagarantia, so a token with `read:packages` scope is typically present in `~/.npmrc`. If installation fails with `401`, generate a token at `github.com/settings/tokens` with `read:packages` and export it as `NODE_AUTH_TOKEN`. Document this in a short note appended to `bright-curios-workflow/README.md`.

### 4.5 Install

```bash
cd bright-curios-workflow
npm install @tn-figueiredo/shared@^0.8.0
```

### 4.6 `src/lib/theme/aurora.ts`

```ts
import { createTheme, type AppTheme } from '@tn-figueiredo/shared/theme';

// ══ Reference palette — raw Aurora design tokens ══
const palette = {
  brand: {
    scale: {
      50:  '#E6FCFA',
      100: '#B2F5EA',
      200: '#81E6D9',
      300: '#4FD1C5',
      400: '#38B2AC',
      500: '#2DD4BF',
      600: '#0D9488',
      700: '#0F766E',
      800: '#115E59',
      900: '#134E4A',
    },
    foreground: '#FFFFFF',
  },
  accent: {
    main: '#FF6B35',
    hover: '#E85D2C',
    light: '#FFF0EB',
    foreground: '#FFFFFF',
  },
  surfaces: {
    dark: {
      base:     '#050A0D',
      surface:  '#0F1620',
      elevated: '#141E2A',
      card:     '#1A2535',
      border:   '#243348',
      text: {
        primary:   '#F1F5F9',
        secondary: '#94A3B8',
        muted:     '#64748B',
      },
    },
    light: {
      base:     '#F7F9FC',
      surface:  '#FFFFFF',
      elevated: '#FFFFFF',
      card:     '#FFFFFF',
      border:   '#E2E8F0',
      text: {
        primary:   '#0F172A',
        secondary: '#475569',
        muted:     '#94A3B8',
      },
    },
  },
  semantic: {
    success: '#22C55E',
    warning: '#F59E0B',
    error:   '#EF4444',
    info:    '#3B82F6',
  },
  vivid: {
    teal:   '#2DD4BF',
    cyan:   '#22D3EE',
    blue:   '#60A5FA',
    purple: '#A78BFA',
    orange: '#FF6B35',
    green:  '#34D399',
  },
} as const;

// ══ Semantic layer (shadcn interop) ══
const semanticLight = {
  background:          palette.surfaces.light.base,
  foreground:          palette.surfaces.light.text.primary,
  card:                palette.surfaces.light.card,
  cardForeground:      palette.surfaces.light.text.primary,
  primary:             palette.brand.scale[500],
  primaryForeground:   palette.brand.foreground!,
  secondary:           palette.surfaces.light.surface,
  secondaryForeground: palette.surfaces.light.text.primary,
  muted:               palette.surfaces.light.surface,
  mutedForeground:     palette.surfaces.light.text.muted,
  accent:              palette.accent.main,
  accentForeground:    palette.accent.foreground!,
  destructive:         palette.semantic.error,
  border:              palette.surfaces.light.border,
  ring:                palette.brand.scale[500],
} as const;

const semanticDark = {
  background:          palette.surfaces.dark.base,
  foreground:          palette.surfaces.dark.text.primary,
  card:                palette.surfaces.dark.card,
  cardForeground:      palette.surfaces.dark.text.primary,
  primary:             palette.brand.scale[500],
  primaryForeground:   '#0A1017', // dark ink on teal for contrast
  secondary:           palette.surfaces.dark.surface,
  secondaryForeground: palette.surfaces.dark.text.primary,
  muted:               palette.surfaces.dark.surface,
  mutedForeground:     palette.surfaces.dark.text.muted,
  accent:              palette.accent.main,
  accentForeground:    palette.accent.foreground!,
  destructive:         palette.semantic.error,
  border:              palette.surfaces.dark.border,
  ring:                palette.brand.scale[500],
} as const;

export const aurora = createTheme({
  colors: { light: semanticLight, dark: semanticDark },

  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24 },
  radii:   { sm: 4, md: 8, lg: 12, full: 9999 },

  typography: {
    fontFamily: { sans: 'Inter', mono: 'JetBrains Mono' },
    fontSize:   { xs: 12, sm: 14, base: 15, lg: 18, xl: 20, '2xl': 24, '3xl': 32 },

    families: {
      display: { family: 'Plus Jakarta Sans', weights: [600, 700, 800], role: 'Headings, hero, CTAs' },
      body:    { family: 'Inter',             weights: [400, 500, 600], role: 'Body, UI, forms' },
      mono:    { family: 'JetBrains Mono',    weights: [400, 500],      role: 'Code, YAML, technical data' },
    },

    scale: {
      display:      { size: '40px', line: '48px', weight: 800, use: 'Hero' },
      'heading-lg': { size: '32px', line: '40px', weight: 700, use: 'Page titles' },
      'heading-md': { size: '24px', line: '32px', weight: 700, use: 'Section titles' },
      'heading-sm': { size: '20px', line: '28px', weight: 600, use: 'Card titles, KPIs' },
      'body-lg':    { size: '18px', line: '28px', weight: 400, use: 'Lead paragraphs' },
      body:         { size: '15px', line: '24px', weight: 400, use: 'Default body' },
      'body-sm':    { size: '14px', line: '20px', weight: 400, use: 'Secondary text' },
      label:        { size: '13px', line: '18px', weight: 500, use: 'Labels, badges' },
      caption:      { size: '12px', line: '16px', weight: 500, use: 'Captions, footnotes' },
      tiny:         { size: '11px', line: '14px', weight: 500, use: 'Status indicators' },
    },
  },

  palette,

  shadows: {
    sm:   '0 1px 2px rgba(0,0,0,0.05)',
    md:   '0 4px 6px -1px rgba(0,0,0,0.1)',
    lg:   '0 10px 15px -3px rgba(0,0,0,0.1)',
    glow: '0 0 20px rgba(45,212,191,0.15)',
  },

  scales: {
    radii:   { none: '0px', sm: '4px', md: '8px', lg: '12px', xl: '16px', '2xl': '20px', full: '9999px' },
    padding: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px', '2xl': '24px', '3xl': '32px' },
    gap:     { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px', '2xl': '32px' },
  },
} satisfies AppTheme);

export type AuroraTheme = typeof aurora;
```

### 4.7 `src/lib/theme/index.ts`

```ts
export { aurora, type AuroraTheme } from './aurora';
```

### 4.8 `src/app/globals.css` — full reshape

**Tailwind v4 architecture rules this section follows:**

1. **Static tokens** (brand scale, vivid, semantic, radii, shadows, fonts) go inside `@theme` so Tailwind v4 generates utilities for them (e.g. `bg-brand-500`, `text-vivid-teal`, `rounded-lg`, `shadow-glow`, `font-display`). These values are declared exactly once.
2. **Mode-dependent tokens** (shadcn semantic layer: `--background`, `--primary`, etc.) are declared with the `@theme inline → var(--foo)` indirection pattern. The indirection variables (`--background`, etc.) are declared in `:root` for light mode and overridden in `.dark {}` for dark mode. `@theme inline` ensures utilities like `bg-background` emit `background-color: var(--background)` (not the inlined literal).
3. **Per-mode tokens that don't need Tailwind utilities** (surfaces, text hierarchy, `--brand-glow` override) live directly in `:root` / `.dark` as plain CSS custom properties. Consumers read them via `var(--color-surface-card)` in component CSS. `--brand-glow` is a special case: it's declared per-mode in `:root` / `.dark` but is referenced indirectly from `@theme inline` so that `shadow-glow` is available as a Tailwind utility AND adapts to dark mode.

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

/* ═══ Static design tokens (generate Tailwind utilities) ═══ */
@theme {
  /* Brand scale 50 → 900 */
  --color-brand-50:  #E6FCFA;
  --color-brand-100: #B2F5EA;
  --color-brand-200: #81E6D9;
  --color-brand-300: #4FD1C5;
  --color-brand-400: #38B2AC;
  --color-brand-500: #2DD4BF;
  --color-brand-600: #0D9488;
  --color-brand-700: #0F766E;
  --color-brand-800: #115E59;
  --color-brand-900: #134E4A;

  /* Accent */
  --color-accent-main:  #FF6B35;
  --color-accent-hover: #E85D2C;
  --color-accent-light: #FFF0EB;

  /* Semantic colors */
  --color-success: #22C55E;
  --color-warning: #F59E0B;
  --color-error:   #EF4444;
  --color-info:    #3B82F6;

  /* Vivid (charts / highlights) */
  --color-vivid-teal:   #2DD4BF;
  --color-vivid-cyan:   #22D3EE;
  --color-vivid-blue:   #60A5FA;
  --color-vivid-purple: #A78BFA;
  --color-vivid-orange: #FF6B35;
  --color-vivid-green:  #34D399;

  /* Fonts — wired to next/font CSS variables declared in layout.tsx */
  --font-sans:    var(--font-inter);
  --font-display: var(--font-plus-jakarta);
  --font-mono:    var(--font-jetbrains-mono);

  /* Radii — literal values so rounded-* utilities resolve directly */
  --radius-none: 0px;
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-xl:   16px;
  --radius-2xl:  20px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm:   0 1px 2px rgba(0,0,0,0.05);
  --shadow-md:   0 4px 6px -1px rgba(0,0,0,0.1);
  --shadow-lg:   0 10px 15px -3px rgba(0,0,0,0.1);
}

/* ═══ shadcn semantic tokens — indirected so dark can override ═══ */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  /* Brand-tinted glow indirected to the per-mode --brand-glow var
     declared in :root / .dark below. Different names (--shadow-glow
     here vs --brand-glow below) avoid a self-reference collision. */
  --shadow-glow: var(--brand-glow);
}

/* ═══ Light mode — shadcn semantic values + per-mode surfaces ═══ */
:root {
  /* shadcn semantic (referenced by @theme inline above) */
  --background: #F7F9FC;
  --foreground: #0F172A;
  --card: #FFFFFF;
  --card-foreground: #0F172A;
  --popover: #FFFFFF;
  --popover-foreground: #0F172A;
  --primary: #2DD4BF;
  --primary-foreground: #FFFFFF;
  --secondary: #FFFFFF;
  --secondary-foreground: #0F172A;
  --muted: #FFFFFF;
  --muted-foreground: #94A3B8;
  --accent: #FF6B35;
  --accent-foreground: #FFFFFF;
  --destructive: #EF4444;
  --border: #E2E8F0;
  --input: #E2E8F0;
  --ring: #2DD4BF;

  /* Per-mode surface hierarchy (not Tailwind-utility-generated) */
  --color-surface-base:     #F7F9FC;
  --color-surface-surface:  #FFFFFF;
  --color-surface-elevated: #FFFFFF;
  --color-surface-card:     #FFFFFF;
  --color-surface-border:   #E2E8F0;
  --color-text-primary:     #0F172A;
  --color-text-secondary:   #475569;
  --color-text-muted:       #94A3B8;

  /* Per-mode brand glow (consumed by @theme inline → --shadow-glow) */
  --brand-glow: 0 0 20px rgba(45,212,191,0.15);
}

/* ═══ Dark mode — shadcn overrides + dark surfaces ═══ */
.dark {
  --background: #050A0D;
  --foreground: #F1F5F9;
  --card: #1A2535;
  --card-foreground: #F1F5F9;
  --popover: #141E2A;
  --popover-foreground: #F1F5F9;
  --primary: #2DD4BF;
  --primary-foreground: #0A1017;
  --secondary: #0F1620;
  --secondary-foreground: #F1F5F9;
  --muted: #0F1620;
  --muted-foreground: #64748B;
  --accent: #FF6B35;
  --accent-foreground: #FFFFFF;
  --destructive: #EF4444;
  --border: #243348;
  --input: #243348;
  --ring: #2DD4BF;

  --color-surface-base:     #050A0D;
  --color-surface-surface:  #0F1620;
  --color-surface-elevated: #141E2A;
  --color-surface-card:     #1A2535;
  --color-surface-border:   #243348;
  --color-text-primary:     #F1F5F9;
  --color-text-secondary:   #94A3B8;
  --color-text-muted:       #64748B;

  /* Stronger glow in dark mode (consumed by @theme inline → --shadow-glow) */
  --brand-glow: 0 0 20px rgba(45,212,191,0.25);
}

/* ═══ Named type scale (component-layer utilities) ═══ */
@layer components {
  .text-display    { font-size: 40px; line-height: 48px; font-weight: 800; font-family: var(--font-display); }
  .text-heading-lg { font-size: 32px; line-height: 40px; font-weight: 700; font-family: var(--font-display); }
  .text-heading-md { font-size: 24px; line-height: 32px; font-weight: 700; font-family: var(--font-display); }
  .text-heading-sm { font-size: 20px; line-height: 28px; font-weight: 600; font-family: var(--font-display); }
  .text-body-lg    { font-size: 18px; line-height: 28px; font-weight: 400; }
  .text-body       { font-size: 15px; line-height: 24px; font-weight: 400; }
  .text-body-sm    { font-size: 14px; line-height: 20px; font-weight: 400; }
  .text-label      { font-size: 13px; line-height: 18px; font-weight: 500; }
  .text-caption    { font-size: 12px; line-height: 16px; font-weight: 500; }
  .text-tiny       { font-size: 11px; line-height: 14px; font-weight: 500; }
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground font-sans antialiased; }
}
```

**Note:** the named type scale is implemented as classes in `@layer components` instead of pushing it into Tailwind v4's `@theme` block. This avoids clashing with Tailwind's built-in `text-*` utility generation (which itself produces `text-xs`..`text-3xl` from `--text-*`) and keeps the Aurora names available as plain CSS utilities.

### 4.9 `src/components/theme/theme-provider.tsx`

```tsx
'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
```

`enableSystem` makes next-themes respect `prefers-color-scheme` on first visit; `defaultTheme="dark"` is the final fallback when the system preference is unavailable. Together this matches decision 5.

### 4.10 `src/components/theme/theme-toggle.tsx`

```tsx
'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
```

Integration into `Topbar.tsx` is **not** part of this cycle.

### 4.11 `src/app/layout.tsx` — full replacement

```tsx
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/theme/theme-provider';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
  weight: ['600', '700', '800'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'BrightCurios — Content Workflow',
  description:
    'AI-assisted content production pipeline with brainstorm, research, production, and review stages.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${plusJakarta.variable} ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### 4.12 Tests

#### `src/lib/theme/__tests__/aurora.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { aurora } from '../aurora';

describe('aurora theme', () => {
  it('is a frozen object', () => {
    expect(Object.isFrozen(aurora)).toBe(true);
  });

  it('brand[500] is the Aurora teal', () => {
    expect(aurora.palette!.brand.scale[500]).toBe('#2DD4BF');
  });

  it('accent.main is the Aurora orange', () => {
    expect(aurora.palette!.accent.main).toBe('#FF6B35');
  });

  it('semantic light.primary equals palette brand[500]', () => {
    expect(aurora.colors.light.primary).toBe(aurora.palette!.brand.scale[500]);
  });

  it('semantic dark.background equals palette surfaces.dark.base', () => {
    expect(aurora.colors.dark.background).toBe(aurora.palette!.surfaces.dark.base);
  });

  it('shadows.glow carries the brand rgba', () => {
    expect(aurora.shadows!.glow).toContain('rgba(45,212,191');
  });

  it('typography.scale.display is 40/48/800', () => {
    const t = aurora.typography.scale!.display;
    expect(t.size).toBe('40px');
    expect(t.line).toBe('48px');
    expect(t.weight).toBe(800);
  });

  it('scales.radii.full is 9999px', () => {
    expect(aurora.scales!.radii!.full).toBe('9999px');
  });
});
```

#### `src/lib/theme/__tests__/css-parity.test.ts`

The parser has to match three kinds of scopes because the globals.css is split between `@theme { … }` (static tokens),`:root { … }` (light indirection + surfaces), and `.dark { … }` (dark overrides).

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { aurora } from '../aurora';

const cssPath = join(__dirname, '..', '..', '..', 'app', 'globals.css');
const css = readFileSync(cssPath, 'utf-8');

type Scope = 'theme' | 'root' | 'dark';

function extractBlock(scope: Scope): string {
  // @theme { … } — match the first non-inline @theme block
  if (scope === 'theme') {
    const m = css.match(/@theme\s*\{([\s\S]*?)\n\}/);
    return m ? m[1] : '';
  }
  if (scope === 'root') {
    const m = css.match(/:root\s*\{([\s\S]*?)\n\}/);
    return m ? m[1] : '';
  }
  const m = css.match(/\.dark\s*\{([\s\S]*?)\n\}/);
  return m ? m[1] : '';
}

function getVar(varName: string, scope: Scope): string | null {
  const block = extractBlock(scope);
  if (!block) return null;
  const escaped = varName.replace(/-/g, '\\-');
  const line = block.match(new RegExp(`^\\s*${escaped}\\s*:\\s*([^;]+);`, 'm'));
  return line ? line[1].trim() : null;
}

describe('globals.css ↔ aurora.ts parity', () => {
  // Static tokens — live in @theme
  it('@theme --color-brand-500 matches aurora brand[500]', () => {
    expect(getVar('--color-brand-500', 'theme')).toBe(aurora.palette!.brand.scale[500]);
  });

  it('@theme --color-success matches aurora semantic.success', () => {
    expect(getVar('--color-success', 'theme')).toBe(aurora.palette!.semantic.success);
  });

  it('@theme --color-vivid-teal matches aurora vivid.teal', () => {
    expect(getVar('--color-vivid-teal', 'theme')).toBe(aurora.palette!.vivid.teal);
  });

  it('@theme --radius-lg matches aurora scales.radii.lg', () => {
    expect(getVar('--radius-lg', 'theme')).toBe(aurora.scales!.radii!.lg);
  });

  it('@theme --shadow-md matches aurora shadows.md', () => {
    expect(getVar('--shadow-md', 'theme')).toBe(aurora.shadows!.md);
  });

  // Mode-dependent tokens — live in :root / .dark
  it(':root --primary matches aurora colors.light.primary', () => {
    expect(getVar('--primary', 'root')).toBe(aurora.colors.light.primary);
  });

  it(':root --accent matches aurora colors.light.accent', () => {
    expect(getVar('--accent', 'root')).toBe(aurora.colors.light.accent);
  });

  it('.dark --background matches aurora colors.dark.background', () => {
    expect(getVar('--background', 'dark')).toBe(aurora.colors.dark.background);
  });

  it(':root --color-surface-card matches aurora surfaces.light.card', () => {
    expect(getVar('--color-surface-card', 'root')).toBe(aurora.palette!.surfaces.light.card);
  });

  it('.dark --color-surface-card matches aurora surfaces.dark.card', () => {
    expect(getVar('--color-surface-card', 'dark')).toBe(aurora.palette!.surfaces.dark.card);
  });
});
```

These 10 anchor tests catch drift in the most meaningful places (brand scale, semantic, vivid, radii, shadow, mode-dependent primary/accent/background, and surfaces in both modes). Adding more anchors is cheap if regressions appear.

### 4.13 `bright-curios-workflow/README.md` — short section addition

Append (near the "Generate encryption secret" section):

```md
### GitHub Packages authentication

This project depends on `@tn-figueiredo/shared` published on GitHub Packages.
`.npmrc` references `NODE_AUTH_TOKEN` from the environment.

If `npm install` fails with `401 Unauthorized`:

1. Create a classic GitHub token at <https://github.com/settings/tokens>
   with the `read:packages` scope.
2. Export it: `export NODE_AUTH_TOKEN=<token>` (add to your shell profile).
3. Retry `npm install`.
```

### 4.14 Acceptance checklist — Workstream B

- [ ] `.npmrc` committed (without the token)
- [ ] `npm install @tn-figueiredo/shared@^0.8.0` succeeds
- [ ] `npm run dev` starts without errors; three Aurora fonts load without visible FOUT
- [ ] Opening `/` with system = light renders with `#F7F9FC` background
- [ ] Opening `/` with system = dark renders with `#050A0D` background
- [ ] With no stored preference and `prefers-color-scheme` unavailable, the app falls back to dark
- [ ] Toggling via `useTheme().setTheme('light' | 'dark')` in a test component switches instantly without flash
- [ ] Existing shadcn components (Button, Card, Dialog) render correctly in both modes without code changes
- [ ] No hydration warnings in the console (`suppressHydrationWarning` on `<html>`)
- [ ] `npm run test` — `aurora.test.ts` (8 cases) and `css-parity.test.ts` (10 cases) pass
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] README updated with the NODE_AUTH_TOKEN note

### 4.15 Conscious trade-offs (out of scope)

- **Automatic CSS generator** from `aurora.ts` → replaced by the parity test. If drift becomes a frequent problem, write `scripts/gen-theme-css.ts` in a future cycle.
- **Migrating existing components** to use Aurora-named utilities (`.text-heading-lg`, `--color-brand-500`) — out of scope. Scheduled for a dedicated "design system adoption" cycle.
- **Storybook stories for the new theme** — out of scope.
- **Animation tokens** (durations, easings, keyframes) — not in the Aurora spec; YAGNI.
- **`ThemeToggle` integration in `Topbar.tsx`** — component exists; visual placement is in a later cycle.
- **Visual regression testing** (Storybook + Chromatic) — out of scope for this phase.

---

## 5. Dependencies between workstreams

Workstream B **depends on** Workstream A being published (`@tn-figueiredo/shared@0.8.0` available on GitHub Packages). Concretely:

1. Complete Workstream A through step 3.10 (release published).
2. Only then install the new version in `bright-tale` and start Workstream B.

An alternative for parallel development is to temporarily point `bright-curios-workflow/package.json` at `"@tn-figueiredo/shared": "file:../../tnf-ecosystem/packages/shared"` during development, then swap to `^0.8.0` before merging the `bright-tale` PR. This is useful for iterating locally without waiting for CI publish.

## 6. Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `@tn-figueiredo/shared@0.8.0` publish fails (CI hiccup) | Low | Med | Manual publish via `npm run publish-packages` from a clean checkout with auth set |
| Backward-compat regression in `tonagarantia` consumers | Low | High | Local `npm link` validation before changeset (step 3.8) |
| Font loading causes layout shift | Med | Low | `display: 'swap'` on all three; body falls back to Inter via `font-sans` |
| CSS / TS drift between `aurora.ts` and `globals.css` | Med | Med | Parity test with 8 anchors |
| Existing shadcn component visually regresses in dark mode | Low | Med | Manual visual check on Button, Card, Dialog during acceptance (checklist item) |
| `NODE_AUTH_TOKEN` missing in CI environment | Med | Med | README note + plan to set secret in CI before first deploy |

---

## 7. Definition of done

This spec is delivered when:

1. `@tn-figueiredo/shared@0.8.0` is published and consumable.
2. All bright-tale files listed in §4.2–§4.3 exist and match the spec.
3. Both acceptance checklists (§3.12 and §4.14) are fully green.
4. `npm run dev`, `npm run test`, `npm run lint`, and `npm run build` all pass locally in `bright-curios-workflow`.
5. The app renders the Aurora theme in both modes and respects the user's system preference with dark as fallback.
