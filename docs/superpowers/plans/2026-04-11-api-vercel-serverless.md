# API Vercel Serverless Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy `apps/api` (Fastify 4.x) to Vercel as a serverless function using the same manual adapter pattern proven in `tonagarantia-api`.

**Architecture:** A new `api/index.ts` file in `apps/api/` acts as the Vercel serverless function entry point — it imports the Fastify server, waits for `.ready()`, then emits each request into Fastify's internal HTTP handler. The `src/index.ts` entry point is refactored to export the server instance and only call `listen()` when not running on Vercel. A `build.sh` script compiles the `@brighttale/shared` package and copies it into `node_modules` so Vercel's NFT bundler can resolve it (it does not follow symlinks or tsconfig `paths`).

**Tech Stack:** Fastify 4.x, Node.js 20+, TypeScript, Vercel (serverless, `@vercel/node` runtime), `tsc` for shared package compilation.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `apps/api/src/index.ts` | Export `server` at module level; conditional `listen()` |
| Create | `apps/api/api/index.ts` | Vercel serverless function handler |
| Create | `apps/api/vercel.json` | Routes all traffic to `/api`, sets build command |
| Create | `apps/api/build.sh` | Compiles shared, copies to `node_modules`, creates `public/` |
| Modify | `packages/shared/package.json` | Update `exports` to point to `dist/` for bundler resolution |

---

## Task 1: Refactor `src/index.ts` — export server, conditional listen

The current `index.ts` declares `server` inside a `try` block and never exports it. The Vercel handler needs to import it. We also need to skip `listen()` when running in Vercel's environment (`process.env.VERCEL` is set automatically by Vercel).

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Replace `apps/api/src/index.ts` with the refactored version**

```ts
import { buildServer } from './server.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

// Built once at module init — cold start cost on Vercel, normal startup locally
export const server = await buildServer();

// Vercel uses serverless functions — do not start the HTTP server
if (!process.env.VERCEL) {
  try {
    await server.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
```

- [ ] **Step 2: Verify dev server still starts**

```bash
npm run dev:api
```

Expected: `{"level":30,"msg":"Server listening at http://0.0.0.0:3001"}` within a few seconds. Kill with Ctrl-C.

- [ ] **Step 3: Verify existing tests still pass**

```bash
npm run test:api
```

Expected: all tests pass (the health and auth tests build their own isolated Fastify instances — they are unaffected by this change).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "refactor(api): export server + conditional listen for Vercel serverless"
```

---

## Task 2: Create Vercel serverless handler `api/index.ts`

Vercel auto-discovers TypeScript files inside an `api/` directory at the root of the project (= `apps/api/api/` since Root Directory is `apps/api`). This handler imports the Fastify server, ensures it's ready, then delegates the raw Node.js request to Fastify's internal HTTP server.

**Files:**
- Create: `apps/api/api/index.ts`

- [ ] **Step 1: Create the directory and handler file**

Create `apps/api/api/index.ts` with:

```ts
/**
 * Vercel Serverless Handler
 *
 * Adapts Fastify to run as a Vercel serverless function.
 * All requests are routed here via vercel.json rewrites.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { server } from '../src/index.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await server.ready();
    server.server.emit('request', req, res);
  } catch (err) {
    console.error('Serverless handler error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      data: null,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    }));
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck --workspace=@brighttale/api
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/api/index.ts
git commit -m "feat(api): add Vercel serverless function handler"
```

---

## Task 3: Create `vercel.json`

This file lives inside `apps/api/` (the Root Directory configured in Vercel). It tells Vercel to use a custom build script, use `public/` as the output directory (placeholder — actual functions are auto-discovered in `api/`), and rewrite all incoming routes to the single handler.

**Files:**
- Create: `apps/api/vercel.json`

- [ ] **Step 1: Create `apps/api/vercel.json`**

```json
{
  "buildCommand": "sh build.sh",
  "outputDirectory": "public",
  "rewrites": [
    { "source": "/(.*)", "destination": "/api" }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/vercel.json
git commit -m "feat(api): add vercel.json — route all traffic to serverless handler"
```

---

## Task 4: Create `build.sh`

Vercel runs this script (from `apps/api/`) before bundling the serverless functions. It must:
1. Compile `packages/shared` to `dist/` (so there is compiled JS to copy)
2. Copy the compiled package to `node_modules/@brighttale/shared` using `cp` — **never `ln -s`**, because Vercel's NFT file tracer does not follow symlinks

The `public/.keep` file satisfies `vercel.json`'s `outputDirectory` requirement.

**Files:**
- Create: `apps/api/build.sh`

- [ ] **Step 1: Create `apps/api/build.sh`**

```bash
#!/bin/sh
# Vercel build script for apps/api
# Compiles shared workspace package and copies it to node_modules.
# NOTE: Must use cp, not ln -s — Vercel's NFT file tracer does not follow symlinks.

set -e

echo "=== Building shared workspace package ==="
rm -rf ../../packages/shared/dist
node ../../node_modules/typescript/bin/tsc -p ../../packages/shared/tsconfig.json

echo "=== Copying shared to node_modules ==="
rm -rf ../../node_modules/@brighttale/shared
mkdir -p ../../node_modules/@brighttale
cp -r ../../packages/shared ../../node_modules/@brighttale/shared

mkdir -p public && echo '{}' > public/.keep
echo "=== BUILD COMPLETE ==="
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x apps/api/build.sh
```

- [ ] **Step 3: Run the script manually to verify it works**

From the repo root:

```bash
cd apps/api && sh build.sh
```

Expected output:
```
=== Building shared workspace package ===
=== Copying shared to node_modules ===
=== BUILD COMPLETE ===
```

Also verify: `ls ../../node_modules/@brighttale/shared/dist/` should list compiled `.js` files.

- [ ] **Step 4: Verify dev server still works after the copy**

```bash
cd ../.. && npm run dev:api
```

Expected: server starts on port 3001. Kill with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add apps/api/build.sh
git commit -m "feat(api): add build.sh — compile shared + copy to node_modules for Vercel"
```

---

## Task 5: Update `packages/shared/package.json` exports

Vercel's NFT bundler resolves `@brighttale/shared` from `node_modules/@brighttale/shared` using the `exports` field in `package.json`. Currently it points to `./src/index.ts` (TypeScript source). After Task 4 compiles the package to `dist/`, we update exports to point to the compiled JS.

**Why this is safe for Next.js apps:** `apps/app` and `apps/web` use `transpilePackages: ['@brighttale/shared']` in their `next.config.ts` AND tsconfig path aliases (`@brighttale/shared` → `../../packages/shared/src`). Next.js resolves via the path alias before reading `package.json` exports. This change does not affect them.

**Files:**
- Modify: `packages/shared/package.json`

- [ ] **Step 1: Update the `exports` field in `packages/shared/package.json`**

Replace the current `exports` block:

```json
"exports": {
  ".": {
    "types": "./src/index.ts",
    "default": "./src/index.ts"
  },
  "./*": {
    "types": "./src/*.ts",
    "default": "./src/*.ts"
  }
}
```

With:

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "default": "./dist/index.js"
  },
  "./*": {
    "types": "./dist/*.d.ts",
    "default": "./dist/*.js"
  }
}
```

- [ ] **Step 2: Verify Next.js apps still typecheck**

```bash
npm run typecheck
```

Expected: all workspaces pass with no errors (Next.js ignores the `exports` field and uses tsconfig paths).

- [ ] **Step 3: Verify API tests still pass**

```bash
npm run test:api
```

Expected: all tests pass (vitest uses its own alias config, not the `exports` field).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/package.json
git commit -m "feat(shared): update exports to dist/ for Vercel bundler resolution"
```

---

## Task 6: Push and fix Vercel dashboard

- [ ] **Step 1: Push all commits to main**

```bash
git push origin main
```

- [ ] **Step 2: Change Framework Preset in Vercel dashboard (manual)**

Go to `vercel.com` → Project `bright-tale-api` → Settings → Build and Deployment:

- **Framework Preset:** click the dropdown, select **Other** (currently shows Next.js)
- Click **Save**

This is required because the Next.js preset overrides `vercel.json` framework detection and causes Vercel to look for a `next` dependency.

- [ ] **Step 3: Trigger a new deployment**

Either push an empty commit or go to Vercel → Deployments → click **Redeploy** on the latest commit.

- [ ] **Step 4: Verify the build succeeds**

Watch the Vercel build log. Expected sequence:
```
Running "sh build.sh"
=== Building shared workspace package ===
=== Copying shared to node_modules ===
=== BUILD COMPLETE ===
```

Then Vercel bundles `api/index.ts` → deployment succeeds.

- [ ] **Step 5: Smoke test the deployed API**

```bash
curl https://api.brighttale.io/health
```

Expected:
```json
{"status":"ok","timestamp":"2026-..."}
```

---

## Self-Review Checklist

- [x] `vercel.json` created with build command and rewrites ✓
- [x] `build.sh` compiles shared, copies with `cp` (not symlink), creates `public/.keep` ✓
- [x] `api/index.ts` imports `server` from `src/index.js`, calls `ready()`, emits request ✓
- [x] `src/index.ts` exports `server`, guards `listen()` with `VERCEL` env check ✓
- [x] `shared/package.json` exports updated to `dist/` ✓
- [x] Next.js app safety explained (transpilePackages + tsconfig paths bypass exports) ✓
- [x] Manual dashboard step documented ✓
- [x] Smoke test step included ✓
- [x] Dev server verification after each change ✓
