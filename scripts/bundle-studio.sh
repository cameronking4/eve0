#!/usr/bin/env bash
# Build the Forge Studio as a self-contained Next.js standalone server and stage
# it inside the CLI package so `@forge/cli` can ship + run it from an npm install
# without the monorepo, pnpm, or a dev toolchain.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STUDIO_DIR="$ROOT/apps/studio"
STANDALONE="$STUDIO_DIR/.next/standalone"
DEST_TARBALL="$ROOT/packages/cli/studio.tar.gz"

echo "▶ Building workspace deps…"
pnpm --filter @forge/core build
pnpm --filter @forge/scaffolder build

echo "▶ Building Studio (standalone)…"
# Trace workspace deps from the monorepo root into the standalone bundle.
FORGE_STUDIO_TRACING_ROOT="$ROOT" pnpm --filter @forge/studio build

if [ ! -f "$STANDALONE/apps/studio/server.js" ]; then
  echo "✗ Standalone build missing server.js — is output:'standalone' set in next.config.ts?" >&2
  exit 1
fi

echo "▶ Copying static assets into standalone…"
# Next does not copy static/public into the standalone output automatically.
mkdir -p "$STANDALONE/apps/studio/.next"
cp -r "$STUDIO_DIR/.next/static" "$STANDALONE/apps/studio/.next/static"
if [ -d "$STUDIO_DIR/public" ]; then
  cp -r "$STUDIO_DIR/public" "$STANDALONE/apps/studio/public"
fi

echo "▶ Packing standalone into CLI tarball ($DEST_TARBALL)…"
# Ship as a tarball, not a raw directory: npm strips symlinks from published
# packages, but pnpm's standalone node_modules depends on them (e.g. styled-jsx).
# tar preserves symlinks; the CLI extracts the tarball on first run.
rm -f "$DEST_TARBALL"
tar -czf "$DEST_TARBALL" -C "$STANDALONE" .

echo "✓ Studio bundled at packages/cli/studio.tar.gz ($(du -h "$DEST_TARBALL" | cut -f1))"
