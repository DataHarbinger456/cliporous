#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT/.gg/longform-render-smoke"
ENTRY="$ROOT/scripts/verify-longform-render/render.ts"
BUNDLE="$OUT_DIR/render.cjs"

mkdir -p "$OUT_DIR"
cd "$ROOT"

"$ROOT/node_modules/.bin/esbuild" "$ENTRY" \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile="$BUNDLE" \
  --alias:electron="$ROOT/scripts/verify-blocks/electron-shim.cjs" \
  --external:remotion \
  --external:'@remotion/*' \
  --external:'@google/genai' \
  --log-level=warning

node "$BUNDLE"
