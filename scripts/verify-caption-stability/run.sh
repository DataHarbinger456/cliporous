#!/usr/bin/env bash
# Bundle the production caption builder into a self-contained Node harness, then
# render and audit representative frames with the installed ffmpeg-static/libass.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
BUNDLE="$HERE/verify-caption-stability.bundle.cjs"

cd "$ROOT"

./node_modules/.bin/esbuild \
  "$HERE/verify-caption-stability.ts" \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile="$BUNDLE" \
  --alias:@shared=./src/shared \
  --external:ffmpeg-static \
  --log-level=warning

node "$BUNDLE"
