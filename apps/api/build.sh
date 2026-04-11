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
cp "$REPO_ROOT/packages/shared/package.json" "$REPO_ROOT/node_modules/@brighttale/shared/package.json"

echo "=== BUILD COMPLETE ==="
