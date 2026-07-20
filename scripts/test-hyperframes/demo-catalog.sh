#!/usr/bin/env bash
# Render all HyperFrames catalog templates (12 V2 + 5 V1 legacy) into a single showreel.
# Each template gets 3 seconds on a brand-dark base, sequentially.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CATALOG="$ROOT/src/main/hyperframes/catalog"
SHIM="$ROOT/scripts/verify-archetypes/electron-shim.cjs"
OUT="$ROOT/.ezcoder/plans/hyperframes-e2e"
BUNDLE="$HERE/demo-catalog.bundle.cjs"

mkdir -p "$OUT"

# ── 1. Build the demo renderer ──────────────────────────────────────────
echo "🔨 Building demo renderer..."
cd "$ROOT"

./node_modules/.bin/esbuild \
  "$HERE/demo-catalog.ts" \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=cjs \
  --outfile="$BUNDLE" \
  --alias:electron="$SHIM" \
  --alias:@shared=./src/shared \
  --external:fluent-ffmpeg \
  --external:ffmpeg-static \
  --external:@ffprobe-installer/ffprobe \
  --external:@google/genai \
  --log-level=warning

echo "▶️  Running demo render..."
node "$BUNDLE" "$@"
