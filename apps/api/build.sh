#!/bin/sh
# Vercel build script for apps/api
# 1. Compiles shared workspace package and copies it to node_modules.
# 2. Bundles the serverless entry point to JavaScript so Vercel's @vercel/node
#    runtime doesn't run its own TypeScript compilation (which uses different
#    module resolution and produces incorrect Zod type inference).
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

echo "=== Bundling API entry point to JavaScript ==="
cd "$REPO_ROOT/apps/api"
"$REPO_ROOT/node_modules/.bin/esbuild" api/index.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --outfile=api/index.mjs \
  --packages=external \
  --tsconfig=tsconfig.json
# Remove .ts entry point so @vercel/node uses the bundled .mjs instead
rm -f api/index.ts

echo "=== BUILD COMPLETE ==="
