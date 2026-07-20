#!/usr/bin/env bash
# Build the block contact-sheet harness with esbuild and run it under node, with
# `electron` resolved to a local CJS stub so main-process modules (ffmpeg.ts)
# import cleanly. The Remotion packages are kept external so they load from
# node_modules with their native binaries/assets intact.
#
# Usage:
#   scripts/verify-blocks/run.sh                 # brand palette only
#   scripts/verify-blocks/run.sh --all-palettes  # one grid per built-in palette
#   scripts/verify-blocks/run.sh --palette=midnight-cyan
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/render-samples.bundle.cjs"

cd "$ROOT"

./node_modules/.bin/esbuild \
  "$HERE/render-samples.ts" \
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
