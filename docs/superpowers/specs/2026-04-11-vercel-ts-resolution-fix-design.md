# Fix Vercel TypeScript Resolution for API Builds

## Problem

Vercel's `@vercel/node` runtime runs its own TypeScript check after `build.sh`. This check produces incorrect Zod type inference — all schema fields appear as optional — causing build failures across `videos.ts`, `podcasts.ts`, `assets.ts`, and potentially more routes.

## Root Cause (verified locally)

The shared package declares `"zod": "^4.3.6"` in `packages/shared/package.json`. No stable Zod v4 exists on npm (only `4.0.0-beta.*` prereleases). This invalid specifier causes npm to resolve Zod inconsistently on Vercel's build environment, producing incorrect type inference when `@vercel/node` processes the compiled `.d.ts` files from `node_modules/@brighttale/shared/dist/`.

**Proof:** Locally, switching the zod dependency to `"^3.24.0"` and running `tsc --noEmit` WITHOUT the tsconfig `@brighttale/shared/*` path aliases (simulating Vercel's resolution through `node_modules`) produces **zero TypeScript errors**. With `"^4.3.6"`, the same check produces the exact type mismatch errors seen on Vercel.

## Rejected Approach: NodeNext Migration

The initial design proposed switching `moduleResolution` from `"Bundler"` to `"NodeNext"` to match the TôNaGarantia reference project. This was rejected after testing revealed **242 TypeScript errors**:
- 94 `@/*` path resolution failures (NodeNext requires extensions even for path aliases)
- 59 missing `.js` extension errors on relative imports
- 33 `'unknown'` type errors (stricter catch clause typing)
- 3 JSON import attribute errors

This would be a multi-day migration for a problem that has a one-line fix.

## Solution

### 1. Fix zod dependency (the actual fix)

`packages/shared/package.json`:
```diff
-    "zod": "^4.3.6"
+    "zod": "^3.24.0"
```

Then run `npm install` to update the lockfile.

### 2. Revert workarounds

Remove all symptom-level fixes applied during debugging:
- `apps/api/build.sh` — remove esbuild bundling step, remove diagnostics, restore to simple shared-build + copy
- `apps/api/.gitignore` — remove (was added for esbuild output)
- `apps/api/api/index.mjs` — delete (esbuild bundle artifact)
- `packages/shared/package.json` exports — revert to `"./src/*.ts"` if that was the original, or keep `"./dist/*.d.ts"` (both work once zod is fixed)
- `apps/api/src/routes/videos.ts` — restore proper `VideoScript` type on `calculateVideoWordCount`
- `apps/api/src/routes/podcasts.ts` — restore proper typed parameter on `calculatePodcastWordCount`

### 3. Clean up dead code (opportunistic)

Verified via import chain analysis:
- `src/lib/api/response.ts` — completely dead (not imported anywhere). Delete.
- `src/lib/api/errors.ts` — live code, but has dead `import { NextResponse } from 'next/server'` and 3 unused exported functions (`createSuccessResponse`, `createErrorResponse`, `handleApiError`). Remove the dead import and exports.
- `src/lib/utils.ts` — `cn()` function is dead (frontend utility). Remove `cn()` and its `clsx`/`tailwind-merge` imports. Keep `markdownToHtml()` and `isProduction()`.

### 4. Clear Vercel build cache

Set `VERCEL_FORCE_NO_BUILD_CACHE=1` as a one-time environment variable for the first deployment after the fix, to ensure no stale cached types interfere.

### 5. Restore build.sh to clean state

```sh
#!/bin/sh
set -e
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

No esbuild, no diagnostics. Copy both `dist/` and `src/` so both the exports map and path aliases work.

## Verification

1. Locally: `tsc --noEmit` passes for all workspaces
2. Locally (Vercel simulation): `tsc --noEmit` WITHOUT `@brighttale/shared/*` paths passes — confirms node_modules resolution works
3. `npm run test:api` passes (652 tests)
4. Vercel build succeeds
5. API responds correctly on deployed URL

## Why This Works

With `"zod": "^3.24.0"`, npm resolves to the installed `3.25.76` (matching the lockfile). The compiled `.d.ts` files in `dist/` reference `z.ZodObject<Shape, UnknownKeys, Catchall, Output, Input>` where the `Output` type parameter has the correct required/optional field markers. When @vercel/node's TypeScript reads these `.d.ts` types and resolves `zod` from `node_modules/zod@3.25.76`, the generic types match perfectly and `z.infer` produces the correct output type.

With `"^4.3.6"` (invalid range), npm's resolution behavior is undefined — it may produce phantom type conflicts, duplicate type trees, or resolve the Zod types in a way that makes the generic parameters misalign.
