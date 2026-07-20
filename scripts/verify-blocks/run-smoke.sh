#!/usr/bin/env bash
# Build the long-form block smoke renderer with esbuild and run it under node,
# with `electron` resolved to a local CJS stub so main-process modules import
# cleanly. Native/heavy deps are kept external so esbuild does not bundle them.
#
# Renders ONE block kind end-to-end through renderBlockSegment (default:
# bar-chart) against a synthetic source video. Pass a kind as the first arg.
#
# Usage:
#   scripts/verify-blocks/run-smoke.sh [kind]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/render-block.bundle.cjs"

cd "$ROOT"

./node_modules/.bin/esbuild \
  "$HERE/render-block.ts" \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=cjs \
  --outfile="$OUT" \
  --alias:electron="$HERE/electron-shim.cjs" \
  --alias:@shared=./src/shared \
  --external:fluent-ffmpeg \
  --external:ffmpeg-static \
  --external:@ffprobe-installer/ffprobe \
  --external:@google/genai \
  --external:remotion \
  --external:'@remotion/*' \
  --log-level=warning

node "$OUT" "$@"
