# Aurora Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `@tn-figueiredo/shared@0.8.0` with additive rich design tokens, then consume it in `bright-tale` to apply the Aurora (Teal) theme with Plus Jakarta + Inter + JetBrains Mono fonts and light/dark modes driven by `next-themes`.

**Architecture:** Two phases that must run in order. Phase 1 extends `packages/shared/src/theme` in the `tnf-ecosystem` monorepo with optional `palette`, `shadows`, `scales` and extended `typography` on `AppTheme`, then publishes via Changesets. Phase 2 wires the new schema into `bright-tale` via a TypeScript theme module (`src/lib/theme/aurora.ts`), a Tailwind v4 `@theme` block in `globals.css`, a `ThemeProvider` client component wrapping `next-themes`, and a Vitest parity test that locks `globals.css` to `aurora.ts`.

**Tech Stack:**
- tnf-ecosystem: TypeScript, Vitest, Turbo, Changesets, GitHub Packages
- bright-tale: Next.js 16, React 19, Tailwind CSS v4 (CSS-first), shadcn/ui, `next-themes`, Vitest, `next/font/google`

**Spec:** `bright-curios-workflow/docs/superpowers/specs/2026-04-10-aurora-theme-design.md` (canonical source of truth for decisions and values)

**Repos referenced:**
- `~/Workspace/tnf-ecosystem` — monorepo hosting `@tn-figueiredo/shared` (Phase 1)
- `~/Workspace/BrightCurios/bright-tale/bright-curios-workflow` — Next.js app (Phase 2)
- `~/Workspace/tonagarantia` — used only for pre-publish validation in Phase 1

## Preconditions

Before starting, verify each repo has `node_modules` installed and that `NODE_AUTH_TOKEN` is available in the shell for GitHub Packages authentication.

```bash
# tnf-ecosystem
cd ~/Workspace/tnf-ecosystem && test -d node_modules || npm install

# tonagarantia (needed for Task 13 validation)
cd ~/Workspace/tonagarantia && test -d node_modules || npm install

# bright-tale workflow (will receive the package in Task 19)
cd ~/Workspace/BrightCurios/bright-tale/bright-curios-workflow && test -d node_modules || npm install

# Confirm auth token for GitHub Packages
echo "NODE_AUTH_TOKEN: ${NODE_AUTH_TOKEN:+present}${NODE_AUTH_TOKEN:-missing}"
```
If `missing`, generate a classic PAT at <https://github.com/settings/tokens> with `read:packages` (and `write:packages` for publishing later — only needed in CI, not locally) and export it in the shell profile.

**Known pre-existing state in tnf-ecosystem:** the `main` branch has uncommitted modifications in `packages/auth/package.json` and `packages/auth/tsup.config.ts`. **Do NOT touch those files in any commit of this plan.** If you accidentally stage them, unstage with `git restore --staged packages/auth/`.

**Rollback:** if anything in Phase 1 publishing goes wrong, consult `bright-curios-workflow/docs/superpowers/specs/2026-04-10-aurora-theme-design.md` §3.13 for the rollback plan (either release a `0.8.1` fix or `npm deprecate` the broken version).

---

## Phase 1 — Extend and publish `@tn-figueiredo/shared@0.8.0`

### Task 1: Create a feature branch in tnf-ecosystem

**Files:** none (git state change only)

- [ ] **Step 1: Confirm working tree state**

Run:
```bash
cd ~/Workspace/tnf-ecosystem
git status
```
Expected: clean `main` or only the pre-existing modifications in `packages/auth/package.json` and `packages/auth/tsup.config.ts`. If any OTHER files are modified, stop and investigate — do not proceed blindly.

- [ ] **Step 2: Fetch latest main**

Run:
```bash
cd ~/Workspace/tnf-ecosystem
git fetch origin main
```
Expected: fetch completes. `git pull --ff-only` is avoided because the dirty `packages/auth/*` working-tree files would block a merge.

- [ ] **Step 3: Create the feature branch from origin/main**

Run:
```bash
cd ~/Workspace/tnf-ecosystem
git checkout -b feat/shared-theme-rich-tokens origin/main
```
Expected: `Switched to a new branch 'feat/shared-theme-rich-tokens'`. The pre-existing `packages/auth/*` modifications will carry over onto the new branch as uncommitted changes — leave them untouched, and only stage files explicitly listed in each task's commit step.

---

### Task 2: Add `ColorScale`, `BrandPalette`, and `AccentColors` interfaces

**Files:**
- Modify: `~/Workspace/tnf-ecosystem/packages/shared/src/theme/types.ts`

- [ ] **Step 1: Append the three interfaces to `types.ts`**

Append to the end of `packages/shared/src/theme/types.ts`:

```ts

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
```

- [ ] **Step 2: Typecheck**

Run:
```bash
cd ~/Workspace/tnf-ecosystem/packages/shared
npx tsc --noEmit
```
Expected: no output (typecheck passes).

- [ ] **Step 3: Commit**

```bash
cd ~/Workspace/tnf-ecosystem
git add packages/shared/src/theme/types.ts
git commit -m "feat(shared): add ColorScale, BrandPalette, AccentColors types"
```

---

### Task 3: Add `SurfaceSet`, `SemanticColors`, and `ThemePalette` interfaces

**Files:**
- Modify: `packages/shared/src/theme/types.ts`

- [ ] **Step 1: Append the three interfaces to `types.ts`**

Append after the previously-added `AccentColors` interface:

```ts

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
```

- [ ] **Step 2: Typecheck**

Run:
```bash
cd ~/Workspace/tnf-ecosystem/packages/shared
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd ~/Workspace/tnf-ecosystem
git add packages/shared/src/theme/types.ts
git commit -m "feat(shared): add SurfaceSet, SemanticColors, ThemePalette types"
```

---

### Task 4: Add `TypeToken`, `FontFace`, and extend `ThemeTypography`

**Files:**
- Modify: `packages/shared/src/theme/types.ts`

- [ ] **Step 1: Append `TypeToken` and `FontFace` interfaces**

Append after `ThemePalette`:

```ts

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
```

- [ ] **Step 2: Extend the existing `ThemeTypography` interface**

Locate the existing `ThemeTypography` interface (lines ~28–34 of the file). Replace it with:

```ts
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
```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd ~/Workspace/tnf-ecosystem/packages/shared
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd ~/Workspace/tnf-ecosystem
git add packages/shared/src/theme/types.ts
git commit -m "feat(shared): add TypeToken, FontFace and extend ThemeTypography with families/scale"
```

---

### Task 5: Add `ThemeScales`, `ThemeShadows`, and extend `AppTheme`

**Files:**
- Modify: `packages/shared/src/theme/types.ts`

- [ ] **Step 1: Append `ThemeScales` and `ThemeShadows`**

Append after the `ThemeTypography` interface (before the existing `ThemeRadii` / `AppTheme`):

```ts

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
```

- [ ] **Step 2: Extend `AppTheme`**

Locate the existing `AppTheme` interface at the bottom of the file:

```ts
export interface AppTheme {
  readonly colors: { readonly light: ThemeColors; readonly dark: ThemeColors };
  readonly spacing: ThemeSpacing;
  readonly typography: ThemeTypography;
  readonly radii: ThemeRadii;
}
```

Replace it with:

```ts
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

- [ ] **Step 3: Typecheck**

Run:
```bash
cd ~/Workspace/tnf-ecosystem/packages/shared
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd ~/Workspace/tnf-ecosystem
git add packages/shared/src/theme/types.ts
git commit -m "feat(shared): extend AppTheme with optional palette, shadows, scales"
```

---

### Task 6: Update the theme barrel to export the new types

**Files:**
- Modify: `packages/shared/src/theme/index.ts`

- [ ] **Step 1: Replace `theme/index.ts`**

Current content:
```ts
export type { AppTheme, ThemeColors, ThemeSpacing, ThemeTypography, ThemeRadii } from './types.js';
export { createTheme } from './create-theme.js';
```

Replace with:
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

- [ ] **Step 2: Typecheck**

Run:
```bash
cd ~/Workspace/tnf-ecosystem/packages/shared
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd ~/Workspace/tnf-ecosystem
git add packages/shared/src/theme/index.ts
git commit -m "feat(shared): export new theme types from barrel"
```

---

### Task 7: Write backward-compatibility regression test

**Files:**
- Modify: `packages/shared/src/__tests__/theme.test.ts`

- [ ] **Step 1: Add a compile-time + runtime backward-compat test**

Append to `packages/shared/src/__tests__/theme.test.ts` (just before the closing of the `describe('createTheme', …)` block):

```ts

  it('accepts a minimal v1-only AppTheme without new optional fields', () => {
    // Compile-time guarantee: v1 shape must remain assignable to AppTheme.
    const v1Only: AppTheme = {
      colors: {
        light: sampleColors,
        dark: sampleColors,
      },
      spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48 },
      typography: {
        fontFamily: { sans: 'Inter', mono: 'JetBrains Mono' },
        fontSize: { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30 },
      },
      radii: { sm: 4, md: 8, lg: 12, full: 9999 },
    };
    const theme = createTheme(v1Only);
    expect(theme.palette).toBeUndefined();
    expect(theme.shadows).toBeUndefined();
    expect(theme.scales).toBeUndefined();
    expect(Object.isFrozen(theme)).toBe(true);
  });
```

- [ ] **Step 2: Run the test**

Run:
```bash
cd ~/Workspace/tnf-ecosystem/packages/shared
npm run build
npx vitest run src/__tests__/theme.test.ts
```
Expected: all existing tests plus the new "accepts a minimal v1-only AppTheme" test pass.

- [ ] **Step 3: Commit**

```bash
cd ~/Workspace/tnf-ecosystem
git add packages/shared/src/__tests__/theme.test.ts
git commit -m "test(shared): lock backward compat for minimal v1 AppTheme"
```

---

### Task 8: Write `palette` preservation and deep-freeze tests

**Files:**
- Modify: `packages/shared/src/__tests__/theme.test.ts`

- [ ] **Step 1: Add a rich-theme fixture and preservation tests**

Append after the test added in Task 7 (inside the same `describe` block):

```ts

  const richPalette = {
    brand: {
      scale: {
        50:  '#E6FCFA', 100: '#B2F5EA', 200: '#81E6D9', 300: '#4FD1C5',
        400: '#38B2AC', 500: '#2DD4BF', 600: '#0D9488', 700: '#0F766E',
        800: '#115E59', 900: '#134E4A',
      },
      foreground: '#FFFFFF',
    },
    accent: { main: '#FF6B35', hover: '#E85D2C', light: '#FFF0EB', foreground: '#FFFFFF' },
    surfaces: {
      light: {
        base: '#F7F9FC', surface: '#FFFFFF', elevated: '#FFFFFF',
        card: '#FFFFFF', border: '#E2E8F0',
        text: { primary: '#0F172A', secondary: '#475569', muted: '#94A3B8' },
      },
      dark: {
        base: '#050A0D', surface: '#0F1620', elevated: '#141E2A',
        card: '#1A2535', border: '#243348',
        text: { primary: '#F1F5F9', secondary: '#94A3B8', muted: '#64748B' },
      },
    },
    semantic: { success: '#22C55E', warning: '#F59E0B', error: '#EF4444', info: '#3B82F6' },
    vivid: { teal: '#2DD4BF', orange: '#FF6B35', custom1: '#123456', custom2: '#789ABC' },
  } as const;

  const richTheme: AppTheme = {
    colors: { light: sampleColors, dark: sampleColors },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48 },
    typography: {
      fontFamily: { sans: 'Inter', mono: 'JetBrains Mono' },
      fontSize: { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30 },
    },
    radii: { sm: 4, md: 8, lg: 12, full: 9999 },
    palette: richPalette,
  };

  it('preserves palette.brand scale and foreground', () => {
    const theme = createTheme(richTheme);
    expect(theme.palette?.brand.scale[500]).toBe('#2DD4BF');
    expect(theme.palette?.brand.foreground).toBe('#FFFFFF');
  });

  it('preserves palette.accent including foreground', () => {
    const theme = createTheme(richTheme);
    expect(theme.palette?.accent.main).toBe('#FF6B35');
    expect(theme.palette?.accent.foreground).toBe('#FFFFFF');
  });

  it('preserves palette.surfaces for both light and dark', () => {
    const theme = createTheme(richTheme);
    expect(theme.palette?.surfaces.light.base).toBe('#F7F9FC');
    expect(theme.palette?.surfaces.dark.base).toBe('#050A0D');
    expect(theme.palette?.surfaces.dark.text.primary).toBe('#F1F5F9');
  });

  it('deep-freezes palette.surfaces.dark.text (3 levels)', () => {
    const theme = createTheme(richTheme);
    expect(Object.isFrozen(theme.palette)).toBe(true);
    expect(Object.isFrozen(theme.palette?.surfaces)).toBe(true);
    expect(Object.isFrozen(theme.palette?.surfaces.dark)).toBe(true);
    expect(Object.isFrozen(theme.palette?.surfaces.dark.text)).toBe(true);
  });

  it('deep-freezes palette.brand.scale', () => {
    const theme = createTheme(richTheme);
    expect(Object.isFrozen(theme.palette?.brand)).toBe(true);
    expect(Object.isFrozen(theme.palette?.brand.scale)).toBe(true);
  });

  it('palette.vivid accepts arbitrary keys', () => {
    const theme = createTheme(richTheme);
    expect(theme.palette?.vivid.teal).toBe('#2DD4BF');
    expect(theme.palette?.vivid.custom1).toBe('#123456');
    expect(theme.palette?.vivid.custom2).toBe('#789ABC');
  });
```

- [ ] **Step 2: Run the tests**

Run:
```bash
cd ~/Workspace/tnf-ecosystem/packages/shared
npm run build
npx vitest run src/__tests__/theme.test.ts
```
Expected: all 6 new tests pass alongside the existing suite.

- [ ] **Step 3: Commit**

```bash
cd ~/Workspace/tnf-ecosystem
git add packages/shared/src/__tests__/theme.test.ts
git commit -m "test(shared): cover palette preservation and deep-freeze"
```

---

### Task 9: Write `shadows`, `typography.families/scale`, and `scales` tests

**Files:**
- Modify: `packages/shared/src/__tests__/theme.test.ts`

- [ ] **Step 1: Add tests for the remaining new fields**

Append inside the same `describe` block, after the Task 8 tests:

```ts

  const richThemeFull: AppTheme = {
    ...richTheme,
    typography: {
      fontFamily: { sans: 'Inter', mono: 'JetBrains Mono' },
      fontSize: { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30 },
      families: {
        display: { family: 'Plus Jakarta Sans', weights: [600, 700, 800], role: 'display' },
        body:    { family: 'Inter',             weights: [400, 500, 600], role: 'body' },
        mono:    { family: 'JetBrains Mono',    weights: [400, 500],      role: 'mono' },
      },
      scale: {
        display: { size: '40px', line: '48px', weight: 800, use: 'Hero' },
        body:    { size: '15px', line: '24px', weight: 400, use: 'Default body' },
      },
    },
    shadows: {
      sm:   '0 1px 2px rgba(0,0,0,0.05)',
      md:   '0 4px 6px -1px rgba(0,0,0,0.1)',
      lg:   '0 10px 15px -3px rgba(0,0,0,0.1)',
      glow: '0 0 20px rgba(45,212,191,0.15)',
    },
    scales: {
      padding: { xs: '4px', sm: '8px', md: '12px' },
      gap:     { xs: '4px', sm: '8px', md: '12px' },
      radii:   { none: '0px', sm: '4px', lg: '12px', full: '9999px' },
    },
  };

  it('preserves typography.families and freezes weights arrays', () => {
    const theme = createTheme(richThemeFull);
    expect(theme.typography.families?.display.family).toBe('Plus Jakarta Sans');
    expect(theme.typography.families?.display.weights).toEqual([600, 700, 800]);
    expect(Object.isFrozen(theme.typography.families)).toBe(true);
    expect(Object.isFrozen(theme.typography.families?.display)).toBe(true);
    expect(Object.isFrozen(theme.typography.families?.display.weights)).toBe(true);
  });

  it('preserves typography.scale named tokens', () => {
    const theme = createTheme(richThemeFull);
    expect(theme.typography.scale?.display.size).toBe('40px');
    expect(theme.typography.scale?.display.line).toBe('48px');
    expect(theme.typography.scale?.display.weight).toBe(800);
    expect(theme.typography.scale?.body.size).toBe('15px');
  });

  it('preserves shadows as open record including glow', () => {
    const theme = createTheme(richThemeFull);
    expect(theme.shadows?.sm).toBe('0 1px 2px rgba(0,0,0,0.05)');
    expect(theme.shadows?.glow).toContain('rgba(45,212,191');
    expect(Object.isFrozen(theme.shadows)).toBe(true);
  });

  it('preserves scales.padding, scales.gap, scales.radii', () => {
    const theme = createTheme(richThemeFull);
    expect(theme.scales?.padding?.sm).toBe('8px');
    expect(theme.scales?.gap?.md).toBe('12px');
    expect(theme.scales?.radii?.full).toBe('9999px');
    expect(Object.isFrozen(theme.scales)).toBe(true);
    expect(Object.isFrozen(theme.scales?.padding)).toBe(true);
    expect(Object.isFrozen(theme.scales?.gap)).toBe(true);
    expect(Object.isFrozen(theme.scales?.radii)).toBe(true);
  });
```

- [ ] **Step 2: Run the tests**

Run:
```bash
cd ~/Workspace/tnf-ecosystem/packages/shared
npm run build
npx vitest run src/__tests__/theme.test.ts
```
Expected: all 4 new tests pass.

- [ ] **Step 3: Commit**

```bash
cd ~/Workspace/tnf-ecosystem
git add packages/shared/src/__tests__/theme.test.ts
git commit -m "test(shared): cover shadows, typography.scale/families, scales"
```

---

### Task 10: Extend the subpath imports test to exercise new theme types

**Files:**
- Modify: `packages/shared/src/__tests__/subpath-imports.test.ts`

The existing file is a single top-level `describe('subpath imports', …)` with `it(...)` blocks that use `await import('../<subpath>/index.js')` and assert runtime exports. The `./theme` test currently only checks `createTheme`. New theme types are type-only (no runtime presence), so the meaningful test for them is a compile-time import.

- [ ] **Step 1: Add a top-level type-only import at the top of the file**

Edit `packages/shared/src/__tests__/subpath-imports.test.ts`. Replace the first line:

```ts
import { describe, it, expect } from 'vitest';
```

with:

```ts
import { describe, it, expect } from 'vitest';
// Compile-time assertion: new theme types are exported from the subpath.
// These are type-only imports (erased at runtime); the build fails if any
// of them is missing from `./theme`.
import type {
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
} from '../theme/index.js';
// Reference each imported type so the import is not pruned.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ThemeSubpathExports =
  | AppTheme | ThemeColors | ThemeSpacing | ThemeTypography | ThemeRadii
  | ColorScale | BrandPalette | AccentColors | SurfaceSet | SemanticColors
  | ThemePalette | TypeToken | FontFace | ThemeScales | ThemeShadows;
```

- [ ] **Step 2: Leave the existing `./theme` runtime test unchanged**

The existing `it('./theme exports createTheme', …)` block stays as-is. It already validates runtime resolution of the subpath.

- [ ] **Step 3: Run the tests**

```bash
cd ~/Workspace/tnf-ecosystem/packages/shared
npm run build
npx vitest run src/__tests__/subpath-imports.test.ts
```
Expected: all 10 pre-existing tests still pass. The build (tsc via `npm run build` → `turbo run build`) also succeeds, which is the compile-time proof that the new type imports resolve.

- [ ] **Step 4: Commit**

```bash
cd ~/Workspace/tnf-ecosystem
git add packages/shared/src/__tests__/subpath-imports.test.ts
git commit -m "test(shared): assert new theme types export via subpath (type-level)"
```

---

### Task 11: Expand the theme section of the shared README

**Files:**
- Modify: `packages/shared/README.md`

- [ ] **Step 1: Replace the existing `./theme` section**

Locate the current section:

```md
### `./theme`

createTheme factory with light/dark mode support.

```ts
import { createTheme } from '@tn-figueiredo/shared/theme';
```
```

Replace with:

````md
### `./theme`

Framework-agnostic theme schema for apps across the ecosystem. Provides
`createTheme()` (a deep-freezing factory) and the `AppTheme` interface
with optional rich design tokens.

**Layering**

- `colors` — **semantic layer**, 15 tokens (primary, background, card,
  accent, destructive…). This is what shadcn/ui and NativeWind consume.
- `palette` (optional) — **reference layer**: raw brand scale (50→900),
  accent with foreground, uniform light/dark `SurfaceSet`s, semantic
  colors, and a free-form `vivid` record for chart/highlight colors.

If both layers are provided, the consumer is responsible for keeping
them consistent.

**Minimal usage (v1, still valid):**

```ts
import { createTheme } from '@tn-figueiredo/shared/theme';

export const theme = createTheme({
  colors: {
    light: { /* 15 semantic tokens */ } as const,
    dark:  { /* 15 semantic tokens */ } as const,
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48 },
  typography: {
    fontFamily: { sans: 'Inter', mono: 'JetBrains Mono' },
    fontSize: { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30 },
  },
  radii: { sm: 4, md: 8, lg: 12, full: 9999 },
});
```

**Rich usage (v0.8+):**

```ts
import { createTheme } from '@tn-figueiredo/shared/theme';

export const theme = createTheme({
  colors: { light: { /* … */ }, dark: { /* … */ } },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48 },
  typography: {
    fontFamily: { sans: 'Inter', mono: 'JetBrains Mono' },
    fontSize: { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30 },
    families: {
      display: { family: 'Plus Jakarta Sans', weights: [600, 700, 800] },
      body:    { family: 'Inter',             weights: [400, 500, 600] },
      mono:    { family: 'JetBrains Mono',    weights: [400, 500] },
    },
    scale: {
      display: { size: '40px', line: '48px', weight: 800, use: 'Hero' },
      body:    { size: '15px', line: '24px', weight: 400, use: 'Body' },
    },
  },
  radii: { sm: 4, md: 8, lg: 12, full: 9999 },
  palette: {
    brand: { scale: { /* 50..900 */ }, foreground: '#FFFFFF' },
    accent: { main: '#FF6B35', hover: '#E85D2C', light: '#FFF0EB', foreground: '#FFFFFF' },
    surfaces: { light: { /* SurfaceSet */ }, dark: { /* SurfaceSet */ } },
    semantic: { success: '#22C55E', warning: '#F59E0B', error: '#EF4444', info: '#3B82F6' },
    vivid: { teal: '#2DD4BF', orange: '#FF6B35' },
  },
  shadows: { sm: '…', md: '…', lg: '…', glow: '0 0 20px rgba(45,212,191,0.15)' },
  scales: {
    padding: { xs: '4px', sm: '8px' },
    gap:     { xs: '4px', sm: '8px' },
    radii:   { none: '0px', sm: '4px', lg: '12px', full: '9999px' },
  },
});
```

All v2 fields (`palette`, `shadows`, `scales`, `typography.families`,
`typography.scale`) are **optional and additive**. No migration is
required for existing consumers. See `src/theme/types.ts` for the full
type surface.

```ts
import { createTheme, type AppTheme, type ThemePalette } from '@tn-figueiredo/shared/theme';
```
````

- [ ] **Step 2: Commit**

```bash
cd ~/Workspace/tnf-ecosystem
git add packages/shared/README.md
git commit -m "docs(shared): document rich theme tokens in README"
```

---

### Task 12: Run full local validation in the monorepo

**Files:** none

- [ ] **Step 1: Run build**

```bash
cd ~/Workspace/tnf-ecosystem
npm run build
```
Expected: `turbo run build` — all packages build, including `shared`.

- [ ] **Step 2: Run typecheck**

```bash
cd ~/Workspace/tnf-ecosystem
npm run typecheck
```
Expected: `turbo run typecheck` — no TS errors in any package.

- [ ] **Step 3: Run tests**

```bash
cd ~/Workspace/tnf-ecosystem
npm run test
```
Expected: all packages' test suites pass, including the 11 new runtime tests added to `theme.test.ts` in Tasks 7 (1), 8 (6), and 9 (4). Task 10 adds compile-time type assertions only — no new `it()` blocks — so the `subpath-imports.test.ts` count remains at 10 runtime tests.

- [ ] **Step 4: Confirm clean git state**

```bash
cd ~/Workspace/tnf-ecosystem
git status
```
Expected: clean (all work committed) except for the pre-existing `packages/auth/*` modifications that were present before Task 1 (do not touch them).

---

### Task 13: Validate tonagarantia consumers against the local build

**Files:** none (only temporary `npm link` — reverted at the end)

- [ ] **Step 1: Link the local shared package**

```bash
cd ~/Workspace/tnf-ecosystem/packages/shared
npm link
```
Expected: success line ending in `@tn-figueiredo/shared` being globally linked.

- [ ] **Step 2: Consume the link in tonagarantia**

```bash
cd ~/Workspace/tonagarantia
npm link @tn-figueiredo/shared
```
Expected: `up to date` or similar; `ls node_modules/@tn-figueiredo/shared` should show a symlink.

- [ ] **Step 3: Typecheck `apps/web`**

```bash
cd ~/Workspace/tonagarantia/apps/web
npm run typecheck || npx tsc --noEmit
```
Expected: no type errors. If errors appear, they are **backward-compat regressions** — fix them in `packages/shared/src/theme/types.ts` before proceeding.

- [ ] **Step 4: Build `apps/web`**

```bash
cd ~/Workspace/tonagarantia/apps/web
npm run build
```
Expected: successful Next.js build.

- [ ] **Step 5: Typecheck `apps/api` (if script exists)**

```bash
cd ~/Workspace/tonagarantia/apps/api
npm run typecheck 2>/dev/null || npx tsc --noEmit 2>/dev/null || echo "no typecheck script"
```
Expected: pass, or graceful skip if no typecheck script.

- [ ] **Step 6: Typecheck `apps/mobile` (if script exists)**

```bash
cd ~/Workspace/tonagarantia/apps/mobile
npm run typecheck 2>/dev/null || npx tsc --noEmit 2>/dev/null || echo "no typecheck script"
```
Expected: pass, or graceful skip.

- [ ] **Step 7: Unlink and restore the published shared package in tonagarantia**

```bash
cd ~/Workspace/tonagarantia
npm unlink @tn-figueiredo/shared
npm install @tn-figueiredo/shared
cd ~/Workspace/tnf-ecosystem/packages/shared
npm unlink
```
Expected: tonagarantia `node_modules/@tn-figueiredo/shared` is restored to the published `0.7.0` package (real directory, not a symlink). The second `npm install` is required because `npm unlink` alone leaves the dependency tree broken — npm needs to re-fetch the registry copy.

- [ ] **Step 8: Verify the restore**

```bash
cd ~/Workspace/tonagarantia
ls -la node_modules/@tn-figueiredo/shared | head -2
```
Expected: regular directory, not a symlink (no `->` arrow in the `ls -l` output).

---

### Task 14: Create the Changeset for `@tn-figueiredo/shared`

**Files:**
- Create: `~/Workspace/tnf-ecosystem/.changeset/shared-theme-rich-tokens.md`

- [ ] **Step 1: Create the changeset file**

Create `~/Workspace/tnf-ecosystem/.changeset/shared-theme-rich-tokens.md` with exact contents:

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

- [ ] **Step 2: Verify changeset is detected**

```bash
cd ~/Workspace/tnf-ecosystem
npx changeset status
```
Expected output mentions `@tn-figueiredo/shared` with a pending minor bump (from `0.7.0` to `0.8.0`).

- [ ] **Step 3: Commit**

```bash
cd ~/Workspace/tnf-ecosystem
git add .changeset/shared-theme-rich-tokens.md
git commit -m "chore(changeset): shared theme rich tokens (minor)"
```

---

### Task 15: Push feature branch and open PR

**Files:** none

- [ ] **Step 1: Push the branch**

```bash
cd ~/Workspace/tnf-ecosystem
git push -u origin feat/shared-theme-rich-tokens
```
Expected: branch published on GitHub.

- [ ] **Step 2: Open a PR against main**

Using `gh`:
```bash
gh pr create --base main --title "feat(shared): extend AppTheme with optional rich design tokens" --body "$(cat <<'EOF'
## Summary
- Adds optional `palette`, `shadows`, `scales`, and extended `typography` fields to `AppTheme`
- Backward compatible: all new fields are optional. Existing consumers unchanged.
- README updated with layering explanation and rich-usage example.
- 11 new runtime tests + compile-time type assertions covering preservation, deep-freeze, and backward compat.

## Context
Enables Aurora-style design systems in consumer apps (starting with
Bright-Tale). See the design spec in bright-tale:
`bright-curios-workflow/docs/superpowers/specs/2026-04-10-aurora-theme-design.md`.

## Test plan
- [x] `turbo run build` passes
- [x] `turbo run typecheck` passes
- [x] `turbo run test` passes (11 new runtime theme tests + type-level assertions included)
- [x] Validated against tonagarantia (`apps/web`, `apps/api`, `apps/mobile`) via `npm link` — no regressions

## Release
Changeset will bump `@tn-figueiredo/shared` to `0.8.0`.
EOF
)"
```
Expected: PR URL printed.

- [ ] **Step 3: Wait for CI to go green, then merge via GitHub UI or `gh pr merge`**

```bash
gh pr checks --watch
gh pr merge --squash --delete-branch
```
Expected: PR merged into `main`.

---

### Task 16: Merge the Version Packages PR to publish `0.8.0`

**Files:** none

- [ ] **Step 1: Wait for the Version Packages PR to appear**

After the feat PR merges, the `.github/workflows/release.yml` job runs `changesets/action@v1`, which opens a **"Version Packages"** PR. Wait for it (usually <2 min).

```bash
cd ~/Workspace/tnf-ecosystem
gh pr list --state open --search "Version Packages"
```
Expected: a single open PR titled `Version Packages` (or similar) bumping `@tn-figueiredo/shared` from `0.7.0` to `0.8.0` and appending a CHANGELOG entry.

- [ ] **Step 2: Review and merge the Version Packages PR**

```bash
gh pr view <NUMBER>
gh pr merge <NUMBER> --squash
```
Expected: PR merged; CI re-runs and executes `npm run publish-packages` (`turbo run build && changeset publish`).

- [ ] **Step 3: Ensure `NODE_AUTH_TOKEN` is set**

```bash
[ -n "$NODE_AUTH_TOKEN" ] && echo "token ok" || echo "MISSING — export NODE_AUTH_TOKEN before next step"
```
Expected: `token ok`. If missing, export a GitHub PAT with `read:packages` scope:
```bash
export NODE_AUTH_TOKEN=<github-token-with-read-packages-scope>
```

- [ ] **Step 4: Verify `0.8.0` is published**

```bash
npm view @tn-figueiredo/shared versions --registry https://npm.pkg.github.com
```
Expected: list includes `0.8.0`. If the CI run is still in progress, wait up to ~3 minutes and retry.

---

## Phase 2 — Consume Aurora in `bright-tale`

> **Tip for parallel development:** if you want to start Phase 2 before `0.8.0` is published, you can temporarily set `bright-curios-workflow/package.json`'s dependency to `"@tn-figueiredo/shared": "file:../../../tnf-ecosystem/packages/shared"` (adjust the relative path). Run `npm install` to create the symlink, do the work, then swap back to `"@tn-figueiredo/shared": "^0.8.0"` before merging.

> **Note on `npx tsc --noEmit`:** Next.js 16 generates type files under `.next/types/*` during `next build`. The standalone `tsc --noEmit` steps in Tasks 22, 25, 26, and 27 only check the files we created; if they report errors in `.next/types`, run `npm run build` once to regenerate those files (or delete `.next/` and rely on the `npm run build` in Task 29 to re-create everything).

### Task 17: Create feature branch in bright-tale

**Files:** none

- [ ] **Step 1: Confirm clean state**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git status
```
Expected: only the spec/plan docs (if still uncommitted) — otherwise clean `main`.

- [ ] **Step 2: Create the branch**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git checkout main
git pull --ff-only
git checkout -b feat/aurora-theme
```
Expected: `Switched to a new branch 'feat/aurora-theme'`

---

### Task 18: Create `.npmrc` to point at GitHub Packages

**Files:**
- Create: `bright-curios-workflow/.npmrc`

- [ ] **Step 1: Create the file**

Create `bright-curios-workflow/.npmrc` with exact contents:

```
@tn-figueiredo:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

- [ ] **Step 2: Verify `NODE_AUTH_TOKEN` is set in the shell**

```bash
echo "${NODE_AUTH_TOKEN:-missing}"
```
Expected: non-empty token. If `missing`, generate one at <https://github.com/settings/tokens> with `read:packages` scope and export it:
```bash
export NODE_AUTH_TOKEN=<token>
```

- [ ] **Step 3: Commit**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add bright-curios-workflow/.npmrc
git commit -m "chore(workflow): add .npmrc for @tn-figueiredo packages"
```

---

### Task 19: Install `@tn-figueiredo/shared@^0.8.0`

**Files:**
- Modify: `bright-curios-workflow/package.json`
- Modify: `bright-curios-workflow/package-lock.json`

- [ ] **Step 1: Install the package**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/bright-curios-workflow
npm install @tn-figueiredo/shared@^0.8.0
```
Expected: installs `0.8.0`; `package.json` now lists `@tn-figueiredo/shared` under `dependencies`.

- [ ] **Step 2: Smoke-test the import**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/bright-curios-workflow
node -e "const t=require('@tn-figueiredo/shared/theme'); console.log(typeof t.createTheme);"
```
Expected: `function`

- [ ] **Step 3: Commit**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add bright-curios-workflow/package.json bright-curios-workflow/package-lock.json
git commit -m "chore(workflow): install @tn-figueiredo/shared@0.8.0"
```

---

### Task 20: Write failing test for `aurora.ts`

**Files:**
- Create: `bright-curios-workflow/src/lib/theme/__tests__/aurora.test.ts`

- [ ] **Step 1: Create the test file**

Create `bright-curios-workflow/src/lib/theme/__tests__/aurora.test.ts` with exact contents:

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

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/bright-curios-workflow
npx vitest run src/lib/theme/__tests__/aurora.test.ts
```
Expected: FAIL with module resolution error (`Cannot find module '../aurora'` or similar) because `aurora.ts` does not exist yet.

---

### Task 21: Implement `src/lib/theme/aurora.ts`

**Files:**
- Create: `bright-curios-workflow/src/lib/theme/aurora.ts`

- [ ] **Step 1: Create the file**

Create `bright-curios-workflow/src/lib/theme/aurora.ts` with exact contents:

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
  primaryForeground:   palette.brand.foreground,
  secondary:           palette.surfaces.light.surface,
  secondaryForeground: palette.surfaces.light.text.primary,
  muted:               palette.surfaces.light.surface,
  mutedForeground:     palette.surfaces.light.text.muted,
  accent:              palette.accent.main,
  accentForeground:    palette.accent.foreground,
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
  accentForeground:    palette.accent.foreground,
  destructive:         palette.semantic.error,
  border:              palette.surfaces.dark.border,
  ring:                palette.brand.scale[500],
} as const;

const config: AppTheme = {
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
};

export const aurora = createTheme(config);
export type AuroraTheme = typeof aurora;
```

- [ ] **Step 2: Run the aurora test — expect PASS**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/bright-curios-workflow
npx vitest run src/lib/theme/__tests__/aurora.test.ts
```
Expected: all 8 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add bright-curios-workflow/src/lib/theme/aurora.ts \
        bright-curios-workflow/src/lib/theme/__tests__/aurora.test.ts
git commit -m "feat(workflow): add Aurora theme definition and runtime tests"
```

---

### Task 22: Create `src/lib/theme/index.ts` barrel

**Files:**
- Create: `bright-curios-workflow/src/lib/theme/index.ts`

- [ ] **Step 1: Create the file**

Create `bright-curios-workflow/src/lib/theme/index.ts` with exact contents:

```ts
export { aurora, type AuroraTheme } from './aurora';
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/bright-curios-workflow
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add bright-curios-workflow/src/lib/theme/index.ts
git commit -m "feat(workflow): expose aurora theme via lib/theme barrel"
```

---

### Task 23: Write failing CSS parity test

**Files:**
- Create: `bright-curios-workflow/src/lib/theme/__tests__/css-parity.test.ts`

- [ ] **Step 1: Create the test file**

Create `bright-curios-workflow/src/lib/theme/__tests__/css-parity.test.ts` with exact contents.

**Note on path resolution:** bright-tale runs as ESM, so `__dirname` is undefined at runtime. The test uses `process.cwd()` which Vitest sets to the workflow package root (`bright-curios-workflow/`), making the CSS path stable regardless of where the test runner is invoked from.

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { aurora } from '../aurora';

// Vitest sets process.cwd() to the package root where vitest.config.ts lives.
// This avoids ESM pitfalls with __dirname / import.meta.url path handling.
const cssPath = join(process.cwd(), 'src', 'app', 'globals.css');
const css = readFileSync(cssPath, 'utf-8');

type Scope = 'theme' | 'root' | 'dark';

function extractBlock(scope: Scope): string {
  // @theme { … } — match the first non-inline @theme block (no "inline" keyword)
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

- [ ] **Step 2: Run the parity test — expect failures**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/bright-curios-workflow
npx vitest run src/lib/theme/__tests__/css-parity.test.ts
```
Expected: most assertions fail because `globals.css` still contains the old oklch neutral tokens, not Aurora. This is the failing-test stage of TDD.

---

### Task 24: Rewrite `globals.css` to mirror Aurora tokens

**Files:**
- Modify: `bright-curios-workflow/src/app/globals.css`

- [ ] **Step 1: Overwrite `globals.css` with the full Aurora content**

Replace the entire contents of `bright-curios-workflow/src/app/globals.css` with:

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
     declared in :root / .dark below. Different names avoid a
     self-reference collision. */
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

- [ ] **Step 2: Run the parity test — expect PASS**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/bright-curios-workflow
npx vitest run src/lib/theme/__tests__/css-parity.test.ts
```
Expected: all 10 parity tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add bright-curios-workflow/src/app/globals.css \
        bright-curios-workflow/src/lib/theme/__tests__/css-parity.test.ts
git commit -m "feat(workflow): Aurora tokens in globals.css + parity test"
```

---

### Task 25: Create the `ThemeProvider` client component

**Files:**
- Create: `bright-curios-workflow/src/components/theme/theme-provider.tsx`

- [ ] **Step 1: Create the file**

Create `bright-curios-workflow/src/components/theme/theme-provider.tsx` with exact contents:

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

- [ ] **Step 2: Typecheck**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/bright-curios-workflow
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add bright-curios-workflow/src/components/theme/theme-provider.tsx
git commit -m "feat(workflow): add ThemeProvider wrapping next-themes"
```

---

### Task 26: Create the `ThemeToggle` client component

**Files:**
- Create: `bright-curios-workflow/src/components/theme/theme-toggle.tsx`

- [ ] **Step 1: Create the file**

Create `bright-curios-workflow/src/components/theme/theme-toggle.tsx` with exact contents:

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

- [ ] **Step 2: Typecheck**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/bright-curios-workflow
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add bright-curios-workflow/src/components/theme/theme-toggle.tsx
git commit -m "feat(workflow): add ThemeToggle component"
```

---

### Task 27: Update `layout.tsx` with Aurora fonts and `ThemeProvider`

**Files:**
- Modify: `bright-curios-workflow/src/app/layout.tsx`

- [ ] **Step 1: Overwrite `layout.tsx`**

Replace the entire contents of `bright-curios-workflow/src/app/layout.tsx` with:

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

- [ ] **Step 2: Typecheck**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/bright-curios-workflow
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add bright-curios-workflow/src/app/layout.tsx
git commit -m "feat(workflow): use Aurora fonts and wire ThemeProvider in root layout"
```

---

### Task 28: Document `NODE_AUTH_TOKEN` in the workflow README

**Files:**
- Modify: `bright-curios-workflow/README.md`

- [ ] **Step 1: Inspect the existing README tail**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/bright-curios-workflow
tail -20 README.md
```
Look for a trailing "License", "Contributing", or similar footer section. If one exists, insert the new section ABOVE it (not at the very end). If no footer exists, append at the end.

- [ ] **Step 2: Add the authentication section**

Insert the following block at the appropriate location identified in Step 1:

```md

## GitHub Packages authentication

This project depends on `@tn-figueiredo/shared` published on GitHub
Packages. The `.npmrc` at the repo root references `NODE_AUTH_TOKEN`
from the environment.

If `npm install` fails with `401 Unauthorized`:

1. Create a classic GitHub token at <https://github.com/settings/tokens>
   with the `read:packages` scope.
2. Export it: `export NODE_AUTH_TOKEN=<token>` (add to your shell profile).
3. Retry `npm install`.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add bright-curios-workflow/README.md
git commit -m "docs(workflow): document NODE_AUTH_TOKEN for @tn-figueiredo packages"
```

---

### Task 29: Run the full local verification suite

**Files:** none

- [ ] **Step 1: Run the tests**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/bright-curios-workflow
npm run test
```
Expected: **all** tests pass, including `aurora.test.ts` (8 cases) and `css-parity.test.ts` (10 cases). If any pre-existing test regresses, diagnose it before proceeding — it likely means a component was relying on a CSS variable that was renamed or removed.

- [ ] **Step 1b: Explicitly run the new theme tests**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/bright-curios-workflow
npx vitest run src/lib/theme/__tests__
```
Expected: exactly 18 tests pass (8 from `aurora.test.ts` + 10 from `css-parity.test.ts`). This guards against the `npm run test` config accidentally filtering them out.

- [ ] **Step 2: Run the linter**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/bright-curios-workflow
npm run lint
```
Expected: no errors.

- [ ] **Step 3: Run the production build**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/bright-curios-workflow
npm run build
```
Expected: Next.js build completes; the three new font weights are downloaded and bundled; no warnings about unknown CSS custom properties.

- [ ] **Step 4: Confirm clean git state**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git status
```
Expected: only `bright-curios-workflow/.next` or similar build artifacts (ignored). No uncommitted source changes.

---

### Task 30: Dev-server smoke test (manual)

**Files:** none

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/bright-curios-workflow
npm run dev
```
Expected: server listens on <http://localhost:3000> without errors.

- [ ] **Step 2: Visually verify light mode**

In the browser, set the system preference to **light**, hard-refresh <http://localhost:3000>. Expected:
- Page background is `#F7F9FC` (light gray-blue)
- Primary buttons are teal (`#2DD4BF`)
- No flash of wrong theme on load
- Plus Jakarta Sans is used for headings (body falls back to Inter)
- Open devtools → Console: **no hydration warnings**

- [ ] **Step 3: Visually verify dark mode**

Set system preference to **dark**, hard-refresh. Expected:
- Page background is `#050A0D` (deep teal-black)
- Cards use `#1A2535`
- Borders use `#243348`
- Teal primary still visible
- No FOUT on the three fonts (may see one frame on first load; acceptable with `display: 'swap'`)

- [ ] **Step 4: Verify shadcn components render in both modes**

Navigate to any page that uses Button, Card, Dialog, or similar (e.g. `/projects` if it exists). Expected: all components render correctly in both modes without visual regressions. If a specific page cannot be found, open a known route from `src/app/*` and confirm.

- [ ] **Step 5: Stop the dev server**

Hit `Ctrl+C`. Expected: clean shutdown.

**If anything fails visually, do NOT fix it inside this plan**; capture the specific issue as a follow-up task. This plan is scoped to theme files; component-level visual fixes belong in a separate cycle.

---

### Task 31: Push feature branch and open PR

**Files:** none

- [ ] **Step 1: Push the branch**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git push -u origin feat/aurora-theme
```

- [ ] **Step 2: Open a PR**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
gh pr create --title "feat(workflow): apply Aurora theme (light + dark)" --body "$(cat <<'EOF'
## Summary
- Installs `@tn-figueiredo/shared@^0.8.0` and consumes the new rich theme schema
- Adds `src/lib/theme/aurora.ts` — full Aurora (Teal) theme definition via `createTheme()`
- Replaces Geist fonts with Plus Jakarta Sans + Inter + JetBrains Mono (`next/font/google`)
- Rewrites `globals.css` with Tailwind v4 `@theme` tokens (brand, accent, vivid, semantic, radii, shadows) plus `:root` / `.dark` semantic overrides
- Adds `ThemeProvider` (next-themes) and `ThemeToggle` components
- Adds CSS ↔ TS parity test (`css-parity.test.ts`) to prevent drift

## Out of scope (follow-up cycles)
- Refactoring existing components to use new Aurora utilities (`text-heading-lg`, `bg-brand-500`)
- Wiring `ThemeToggle` into `Topbar.tsx`
- Storybook stories for the new theme

## Test plan
- [x] `npm run test` — aurora.test.ts (8) + css-parity.test.ts (10) pass
- [x] `npm run lint` passes
- [x] `npm run build` passes
- [x] Manual dev-server smoke test: light + dark modes render correctly, no hydration warnings

## Spec
See `bright-curios-workflow/docs/superpowers/specs/2026-04-10-aurora-theme-design.md`
EOF
)"
```

- [ ] **Step 3: Review, await checks, and merge**

```bash
gh pr checks --watch
gh pr merge --squash --delete-branch
```

---

## Self-Review (executed during plan authoring)

### Spec coverage
- §2 Decisions 1–5, 7 → Tasks 2–6 (workstream A) + 18–27 (workstream B)
- §3.3 Schema changes → Tasks 2, 3, 4, 5
- §3.5 Barrel updated → Task 6
- §3.6 Tests → Tasks 7, 8, 9, 10
- §3.7 README → Task 11
- §3.8 Local validation → Task 12
- §3.8 Consumer validation → Task 13
- §3.9 Changeset → Task 14
- §3.10 Release flow → Tasks 15, 16
- §4.2–§4.3 bright-tale files → Tasks 18–27
- §4.4 `.npmrc` → Task 18
- §4.5 Install → Task 19
- §4.6 aurora.ts → Tasks 20, 21
- §4.7 barrel → Task 22
- §4.8 globals.css → Tasks 23, 24
- §4.9 ThemeProvider → Task 25
- §4.10 ThemeToggle → Task 26
- §4.11 layout.tsx → Task 27
- §4.12 tests → Tasks 20, 23
- §4.13 README note → Task 28
- §4.14 acceptance → Task 29 (automated) + Task 30 (manual)

No gaps identified.

### Placeholder scan
Zero `TODO` / `TBD` / `FIXME` markers in the plan. Every code block is complete. Every test has real assertions. Every commit message is literal.

### Type / identifier consistency
- `ColorScale`, `BrandPalette`, `AccentColors`, `SurfaceSet`, `SemanticColors`, `ThemePalette`, `TypeToken`, `FontFace`, `ThemeScales`, `ThemeShadows` — spelled identically in tasks 2–6, 10, 11, and appear consistently in the bright-tale consumption (tasks 21, 23).
- `aurora` is the exported theme constant in `src/lib/theme/aurora.ts` (Task 21) and imported with the same name in tests (Tasks 20, 23) and barrel (Task 22).
- `ThemeProvider` (Task 25) is imported from `@/components/theme/theme-provider` in `layout.tsx` (Task 27).
- `ThemeToggle` (Task 26) is created but not referenced elsewhere — out of scope by design (§4.15).
- `NODE_AUTH_TOKEN` appears in `.npmrc` (Task 18) and the README (Task 28) — identical casing.
- `--brand-glow` vs `--shadow-glow` — the two names are distinct on purpose (noted in `globals.css` inline comment in Task 24).

No inconsistencies identified.
