# Vercel TypeScript Resolution Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Vercel API build failures caused by invalid zod dependency producing incorrect Zod type inference.

**Architecture:** Fix the shared package's zod version from `"^4.3.6"` (invalid — no stable v4 exists) to `"^3.24.0"`, revert all workaround hacks, clean up dead Next.js code.

**Tech Stack:** TypeScript, Zod, Vercel, npm workspaces

**Spec:** `docs/superpowers/specs/2026-04-11-vercel-ts-resolution-fix-design.md`

---

### Task 1: Fix zod dependency and update lockfile

**Files:**
- Modify: `packages/shared/package.json:28`

- [ ] **Step 1: Fix zod version**

In `packages/shared/package.json`, change line 28:

```diff
-    "zod": "^4.3.6"
+    "zod": "^3.24.0"
```

- [ ] **Step 2: Update lockfile**

Run: `npm install`

Expected: lockfile updates, no errors.

- [ ] **Step 3: Verify shared package builds**

Run: `npm run typecheck -w @brighttale/shared`

Expected: clean exit, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/package.json package-lock.json
git commit -m "fix(shared): change zod dep from invalid ^4.3.6 to ^3.24.0"
```

---

### Task 2: Revert build.sh to clean state

**Files:**
- Modify: `apps/api/build.sh`

- [ ] **Step 1: Rewrite build.sh**

Replace the entire contents of `apps/api/build.sh` with:

```sh
#!/bin/sh
# Vercel build script for apps/api
# Compiles shared workspace package and copies it to node_modules.
# NOTE: Must use cp, not ln -s — Vercel's NFT file tracer does not follow symlinks.

set -e

# Get the repo root (parent of apps/api)
REPO_ROOT="$(cd "$(dirname "$0")/../../" && pwd)"

echo "=== Building shared workspace package ==="
rm -rf "$REPO_ROOT/packages/shared/dist"
node "$REPO_ROOT/node_modules/typescript/bin/tsc" -p "$REPO_ROOT/packages/shared/tsconfig.json"

echo "=== Copying shared to node_modules ==="
rm -rf "$REPO_ROOT/node_modules/@brighttale/shared"
mkdir -p "$REPO_ROOT/node_modules/@brighttale/shared"
cp -r "$REPO_ROOT/packages/shared/dist" "$REPO_ROOT/node_modules/@brighttale/shared/dist"
cp -r "$REPO_ROOT/packages/shared/src" "$REPO_ROOT/node_modules/@brighttale/shared/src"
cp "$REPO_ROOT/packages/shared/package.json" "$REPO_ROOT/node_modules/@brighttale/shared/package.json"

echo "=== BUILD COMPLETE ==="
```

This removes the esbuild bundling step and diagnostics.

- [ ] **Step 2: Delete esbuild artifacts**

```bash
rm -f apps/api/api/index.mjs
rm -f apps/api/.gitignore
```

- [ ] **Step 3: Verify build.sh runs locally**

Run: `sh apps/api/build.sh`

Expected: prints `=== BUILD COMPLETE ===`, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/build.sh
git rm -f apps/api/.gitignore apps/api/api/index.mjs 2>/dev/null; true
git commit -m "fix(api): revert build.sh — remove esbuild hack and diagnostics"
```

---

### Task 3: Clean dead Next.js code from API

**Files:**
- Modify: `apps/api/src/lib/api/errors.ts`
- Modify: `apps/api/src/lib/utils.ts`
- Delete: `apps/api/src/lib/api/response.ts`

- [ ] **Step 1: Clean errors.ts — remove NextResponse import and dead functions**

In `apps/api/src/lib/api/errors.ts`, remove line 1 (`import { NextResponse } from "next/server";`) and remove the three dead functions (`createSuccessResponse`, `createErrorResponse`, `handleApiError` — lines 52-100). Keep `ErrorCode`, `SupabaseError`, `ApiError`, and `translateSupabaseError`.

The file should become:

```typescript
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INTERNAL'
  | 'UPSTREAM_ERROR';

export class SupabaseError extends Error {
  constructor(
    public readonly original: { code?: string; message: string; details?: string },
    public readonly httpStatus: number = 500
  ) {
    super(original.message);
    this.name = 'SupabaseError';
  }
}

/**
 * Custom API error class for route handlers
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Translates a Supabase/PostgreSQL error code into our API error code.
 */
export function translateSupabaseError(err: { code?: string; message: string }): {
  code: ErrorCode;
  status: number;
} {
  switch (err.code) {
    case 'PGRST116': return { code: 'NOT_FOUND', status: 404 };
    case '23505':    return { code: 'CONFLICT', status: 409 };
    case '23503':    return { code: 'VALIDATION_ERROR', status: 400 };
    case '42501':    return { code: 'FORBIDDEN', status: 403 };
    default:         return { code: 'INTERNAL', status: 500 };
  }
}
```

- [ ] **Step 2: Clean utils.ts — remove cn() and its imports**

In `apps/api/src/lib/utils.ts`, remove lines 1-2 (the `clsx` and `tailwind-merge` imports) and lines 5-7 (the `cn` function). Keep `marked` import, `markdownToHtml`, and `isProduction`.

The file should become:

```typescript
import { marked } from "marked";

/**
 * Convert markdown to HTML for WordPress Classic Editor
 * Uses marked library with GitHub Flavored Markdown support
 */
export function markdownToHtml(markdown: string): string {
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  const html = marked.parse(markdown, { async: false }) as string;

  return html;
}

/**
 * Safety check: returns true if the current environment is production
 */
export function isProduction(): boolean {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const nodeEnv = process.env.NODE_ENV || "development";

  return (
    nodeEnv === "production" ||
    supabaseUrl.includes("supabase.co") && !supabaseUrl.includes("localhost")
  );
}
```

- [ ] **Step 3: Delete response.ts (completely dead)**

```bash
rm apps/api/src/lib/api/response.ts
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json`

Expected: clean exit, no errors.

- [ ] **Step 5: Run tests**

Run: `npm run test:api`

Expected: 652 tests pass, 7 skipped.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/api/errors.ts apps/api/src/lib/utils.ts
git rm apps/api/src/lib/api/response.ts
git commit -m "fix(api): remove dead Next.js imports and unused functions"
```

---

### Task 4: Verify with Vercel simulation and push

**Files:** None (verification only)

- [ ] **Step 1: Build shared and copy to node_modules**

Run: `sh apps/api/build.sh`

Expected: `=== BUILD COMPLETE ===`

- [ ] **Step 2: Run Vercel simulation (tsc WITHOUT shared path aliases)**

Create temporary tsconfig:

```bash
cat > apps/api/tsconfig.vercel-sim.json << 'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/__tests__"]
}
EOF
cd apps/api && npx tsc --noEmit -p tsconfig.vercel-sim.json
```

Expected: **zero errors**. This simulates how @vercel/node resolves `@brighttale/shared/*` through node_modules.

- [ ] **Step 3: Clean up simulation file**

```bash
rm apps/api/tsconfig.vercel-sim.json
```

- [ ] **Step 4: Run full test suite**

Run: `npm run test:api`

Expected: all tests pass.

- [ ] **Step 5: Push and monitor Vercel build**

```bash
git push origin main
```

Expected: Vercel build passes. If the stale build cache causes issues, set `VERCEL_FORCE_NO_BUILD_CACHE=1` as a one-time Vercel environment variable and retrigger the build.
