#!/bin/sh
# Vercel build script for apps/api
# Compiles shared workspace package and copies it to node_modules.
# NOTE: Must use cp, not ln -s — Vercel's NFT file tracer does not follow symlinks.

set -e

# Get the repo root (parent of apps/api)
REPO_ROOT="$(cd "$(dirname "$0")/../../" && pwd)"

# Cache bust: force npm to re-resolve zod after shared package.json changed
# from invalid ^4.3.6 to ^3.24.0. Vercel build cache was keeping stale types.
echo "=== Forcing npm re-resolution (cache bust) ==="
rm -rf "$REPO_ROOT/node_modules/zod" "$REPO_ROOT/node_modules/.package-lock.json"
( cd "$REPO_ROOT" && npm install --no-audit --no-fund --prefer-offline 2>&1 | tail -3 )

echo "=== Building shared workspace package ==="
rm -rf "$REPO_ROOT/packages/shared/dist"
node "$REPO_ROOT/node_modules/typescript/bin/tsc" -p "$REPO_ROOT/packages/shared/tsconfig.json"

echo "=== Copying shared to node_modules ==="
rm -rf "$REPO_ROOT/node_modules/@brighttale/shared"
mkdir -p "$REPO_ROOT/node_modules/@brighttale/shared"
cp -r "$REPO_ROOT/packages/shared/dist" "$REPO_ROOT/node_modules/@brighttale/shared/dist"
cp "$REPO_ROOT/packages/shared/package.json" "$REPO_ROOT/node_modules/@brighttale/shared/package.json"

echo "=== Bundling API server with esbuild (resolves @/ path aliases) ==="
# @vercel/node compiles TS but does NOT resolve tsconfig path aliases in ESM.
# We pre-bundle src/index.ts into src/bundle.js so all @/ imports become
# relative paths. api/index.ts then imports src/bundle.js (plain JS) and
# @vercel/node follows that import without needing to resolve any aliases.
#
# --alias:@ must come BEFORE --packages=external: esbuild processes aliases
# first, converting @/foo → absolute path (not a package name), so
# --packages=external never sees it as external. Without --alias, esbuild
# treats @/lib/* as a scoped npm package and skips tsconfig path resolution.
#
# Note: alias key is "@" (no trailing slash — esbuild rejects "@/"). esbuild
# uses path-separator-aware prefix matching, so "@" matches "@/lib" but
# does NOT match "@tn-figueiredo/affiliate" (next char must be "/").
"$REPO_ROOT/node_modules/.bin/esbuild" \
  "$REPO_ROOT/apps/api/src/index.ts" \
  --bundle \
  --platform=node \
  --format=esm \
  --packages=external \
  "--alias:@=$REPO_ROOT/apps/api/src" \
  --tsconfig="$REPO_ROOT/apps/api/tsconfig.json" \
  --outfile="$REPO_ROOT/apps/api/src/bundle.js"

echo "=== BUILD COMPLETE ==="
