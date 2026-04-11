# Fix Vercel TypeScript Resolution for API Builds

## Problem

Vercel's `@vercel/node` runtime runs its own TypeScript check after `build.sh`. This check produces incorrect Zod type inference — all schema fields appear as optional — causing build failures. Our own `tsc --noEmit` passes (verified via build.sh diagnostics on Vercel), but we cannot control `@vercel/node`'s compilation.

The root cause is a mismatch between the API's tsconfig (`moduleResolution: "Bundler"` via base) and how `@vercel/node` resolves modules. The working reference project (TôNaGarantia `apps/api`) uses `moduleResolution: "NodeNext"` and builds successfully.

## Reference

TôNaGarantia (`~/Workspace/tonagarantia/apps/api`) — same architecture (Fastify + Vercel serverless), builds and deploys correctly. Key differences identified via comparison:

| Setting | TôNaGarantia (works) | bright-tale (broken) |
|---|---|---|
| `moduleResolution` | `NodeNext` | `Bundler` |
| `module` | `NodeNext` | `ESNext` |
| tsconfig `paths` for shared | None | Points to source |
| `vercel.json` `outputDirectory` | `"public"` | Missing |
| `build.sh` | `tsc -p tsconfig.build.json` | esbuild bundle hack |
| shared `zod` dep | Valid | `^4.3.6` (invalid) |

## Solution

Align the API's build configuration with the TôNaGarantia pattern.

### 1. API tsconfig.json — standalone, NodeNext

Replace `apps/api/tsconfig.json` (currently extends `../../tsconfig.base.json`):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "noEmit": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/__tests__"]
}
```

Key changes:
- `module`/`moduleResolution` → `NodeNext` (matches @vercel/node)
- Remove `@brighttale/shared/*` paths — resolve through `node_modules` only
- Remove `api/**/*` from `include` — entry point doesn't need type checking
- Keep `@/*` for internal imports (works with `paths` in NodeNext for type checking; `tsx` handles it at dev runtime)
- No longer extends base tsconfig — standalone to avoid inheriting `Bundler` settings

### 2. API tsconfig.build.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true
  },
  "exclude": ["node_modules", "dist", "src/__tests__"]
}
```

Used by `build.sh` for compilation. The `@/*` paths remain in output — @vercel/node handles bundling for the serverless function, so `dist/` is mainly a sanity check.

### 3. Shared package fixes

**`packages/shared/package.json`:**
- Fix `"zod": "^4.3.6"` → `"zod": "^3.24.0"`
- Exports map already correct: `"./*": { "types": "./dist/*.d.ts", "default": "./dist/*.js" }`

### 4. build.sh — match TôNaGarantia

```sh
#!/bin/sh
set -e
REPO_ROOT="$(cd "$(dirname "$0")/../../" && pwd)"

echo "=== Building shared workspace package ==="
rm -rf "$REPO_ROOT/packages/shared/dist"
node "$REPO_ROOT/node_modules/typescript/bin/tsc" -p "$REPO_ROOT/packages/shared/tsconfig.json"

echo "=== Copying shared to node_modules ==="
rm -rf "$REPO_ROOT/node_modules/@brighttale/shared"
cp -r "$REPO_ROOT/packages/shared" "$REPO_ROOT/node_modules/@brighttale/shared"

echo "=== Building API ==="
cd "$REPO_ROOT/apps/api"
node "$REPO_ROOT/node_modules/typescript/bin/tsc" -p tsconfig.build.json

mkdir -p public && echo '{}' > public/.keep
echo "=== BUILD COMPLETE ==="
```

Changes: remove esbuild hack, add real `tsc` compilation, create `public/` for outputDirectory.

### 5. vercel.json

Add `outputDirectory`:
```json
{
  "buildCommand": "sh build.sh",
  "outputDirectory": "public",
  "rewrites": [{ "source": "/(.*)", "destination": "/api" }]
}
```

### 6. Import extension fixes

With `NodeNext`, relative imports need `.js` extensions. Current audit:
- 85 `@/*` path imports — no extension needed (resolved via `paths`)
- 2 relative imports missing `.js` extension in `src/lib/api/` — must add `.js`

### 7. Dead import cleanup

Remove leftover Next.js imports that don't exist in the API's dependencies:
- `src/lib/api/errors.ts` — `import from 'next/server'`
- `src/lib/api/response.ts` — `import from 'next/server'`
- `src/lib/utils.ts` — `import from 'clsx'`, `import from 'tailwind-merge'`

These files may be dead code entirely; if still referenced, the Next.js-specific imports must be removed or replaced.

### 8. Cleanup

- Remove `apps/api/.gitignore` (added for esbuild output)
- Remove `api/index.mjs` if present
- Revert any `Record<string, any>` workarounds in route utility functions

## Verification

1. `tsc --noEmit -p apps/api/tsconfig.json` passes locally
2. `npm run test:api` passes (652 tests)
3. Vercel build succeeds (no TypeScript errors from @vercel/node)
4. API responds correctly on deployed URL

## Risk

- `@/*` path alias: works for type checking (tsconfig `paths` supported in `NodeNext`) and dev runtime (`tsx`). @vercel/node bundles the serverless function and resolves `@/*` via tsconfig paths. If @vercel/node doesn't support `paths`, we fall back to converting 85 imports to relative paths — mechanical but safe.
- Shared package `.d.ts` types: if Zod inference is still wrong through compiled types under `NodeNext`, we add `tsc-alias` or export Zod-inferred types instead of manual interfaces. TôNaGarantia's success with the same pattern suggests this won't be needed.
