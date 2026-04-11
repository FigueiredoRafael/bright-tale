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

echo "=== DIAGNOSTICS ==="
echo "--- node_modules/@brighttale/shared contents:"
ls -la "$REPO_ROOT/node_modules/@brighttale/shared/"
ls -la "$REPO_ROOT/node_modules/@brighttale/shared/src/schemas/" 2>/dev/null || echo "src/schemas/ not found"
ls -la "$REPO_ROOT/node_modules/@brighttale/shared/dist/schemas/" 2>/dev/null || echo "dist/schemas/ not found"
echo "--- zod version:"
node -e "console.log(require('$REPO_ROOT/node_modules/zod/package.json').version)"
echo "--- shared package.json exports:"
node -e "const pkg = require('$REPO_ROOT/node_modules/@brighttale/shared/package.json'); console.log(JSON.stringify(pkg.exports, null, 2))"
echo "--- tsconfig.json:"
cat "$REPO_ROOT/apps/api/tsconfig.json"
echo ""
echo "--- Running tsc --noEmit from apps/api:"
cd "$REPO_ROOT/apps/api"
node "$REPO_ROOT/node_modules/typescript/bin/tsc" --noEmit 2>&1 || echo "tsc --noEmit FAILED (exit $?)"
echo "--- Running tsc --traceResolution (first shared import only):"
node "$REPO_ROOT/node_modules/typescript/bin/tsc" --noEmit --traceResolution 2>&1 | grep -A 8 "Resolving module '@brighttale/shared/schemas/videos'" | head -20
echo "=== BUILD COMPLETE ==="
