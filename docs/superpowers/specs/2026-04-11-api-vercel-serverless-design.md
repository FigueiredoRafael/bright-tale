# Spec: Vercel Serverless Deployment for `apps/api` (Fastify)

**Date:** 2026-04-11  
**Status:** Approved  

---

## Context

`apps/api` was migrated from Next.js Route Handlers to Fastify 4.x (commit `be37017`). The Vercel project `bright-tale-api` still has Framework Preset = Next.js and Root Directory = `apps/api`. Vercel can no longer detect a Next.js project and fails the build with:

```
Error: No Next.js version detected.
```

The fix follows the same pattern already in production at `tonagarantia-api` on Vercel.

---

## Architecture

Fastify is a persistent HTTP server, not a serverless function. The adapter pattern bridges the two:

1. Vercel routes all traffic to a single serverless function (`api/index.ts`).
2. That function initializes the Fastify server once (cold start), then emits each HTTP request into Fastify's internal handler via `server.server.emit('request', req, res)`.
3. Fastify processes the request through its normal plugin/route chain and writes the response.

No npm adapter library is needed — this is raw Node.js `http.Server` event emission, the same technique proven in tonagarantia.

---

## Files

### Create: `apps/api/vercel.json`

Routes all requests to `/api`, uses a custom build script, and outputs a placeholder directory:

```json
{
  "buildCommand": "sh build.sh",
  "outputDirectory": "public",
  "rewrites": [
    { "source": "/(.*)", "destination": "/api" }
  ]
}
```

### Create: `apps/api/build.sh`

Vercel's NFT file tracer does not follow symlinks and does not read tsconfig `paths`. The shared workspace package must be present as a real compiled package in `node_modules` at bundle time.

```bash
#!/bin/sh
set -e

echo "=== Building shared workspace package ==="
rm -rf ../../packages/shared/dist
node ../../node_modules/typescript/bin/tsc -p ../../packages/shared/tsconfig.json

echo "=== Copying shared to node_modules ==="
# NOTE: must use cp, not ln -s — Vercel NFT tracer does not follow symlinks
rm -rf ../../node_modules/@brighttale/shared
mkdir -p ../../node_modules/@brighttale
cp -r ../../packages/shared ../../node_modules/@brighttale/shared

mkdir -p public && echo '{}' > public/.keep
echo "=== BUILD COMPLETE ==="
```

### Edit: `packages/shared/package.json`

Update `exports` to resolve from compiled `dist/` output (what Vercel's bundler uses) instead of TypeScript source:

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

**Why this doesn't break Next.js:** `apps/app` and `apps/web` use `transpilePackages: ['@brighttale/shared']` in `next.config.ts` plus tsconfig path aliases (`@brighttale/shared` → `../../packages/shared/src`). Next.js resolves via the path alias and never reads the `exports` field.

### Create: `apps/api/api/index.ts`

The Vercel serverless function entry point. Vercel auto-detects files in `api/` as serverless functions.

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

### Edit: `apps/api/src/index.ts`

Export the Fastify server instance at module level so the handler can import it. Only call `listen()` when not running on Vercel (detected via `process.env.VERCEL` which Vercel sets automatically).

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

---

## Vercel Dashboard Change (manual)

In the `bright-tale-api` Vercel project settings → Build and Deployment:

- **Framework Preset:** Change from `Next.js` → `Other`
- Everything else stays the same (Root Directory = `apps/api`, Include files outside root = Enabled)

This is required because Vercel's framework detection overrides `vercel.json` framework inference when a preset is explicitly selected.

---

## Data Flow

```
HTTP request → Vercel edge → api/index.ts (serverless fn)
  → await server.ready()
  → server.server.emit('request', req, res)
  → Fastify router → route handler → response
```

---

## What Does Not Change

- `npm run dev:api` — unchanged, local Fastify server works as before
- `apps/app`, `apps/web` — no changes
- Fastify routes, plugins, auth — no changes
- `apps/api/src/server.ts` — no changes
- Environment variables in Vercel dashboard — no changes needed

---

## Error Handling

The handler catches any error during `server.ready()` or request emission and returns a `{ data: null, error: { code, message } }` JSON response consistent with the API envelope convention.

---

## Risks

- **Cold start latency:** `buildServer()` runs on every cold start (registers all plugins). Acceptable for current scale. If routes grow significantly, consider Fastify plugin lazy-loading.
- **Vercel function timeout:** Default 10s. Long-running AI generation calls may need the timeout increased in Vercel project settings (Functions tab → Max Duration).
- **Shared package exports change:** If any consumer outside Next.js imports `@brighttale/shared` directly (without tsconfig paths), they now get `dist/` JS. This is correct behavior for a compiled package.
