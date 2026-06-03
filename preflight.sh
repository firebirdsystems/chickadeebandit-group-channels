#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
echo ""
echo "▶ Build…"
node "$ROOT/build.mjs"
echo ""
echo "▶ Tests…"
npm test --prefix "$ROOT"
echo ""
echo "✓ Preflight passed"
