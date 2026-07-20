#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)"
FFMPEG_BIN="${FFMPEG_BIN:-$REPO_ROOT/node_modules/ffmpeg-static/ffmpeg}"
FONT_FILE="${FONT_FILE:-/System/Library/Fonts/Supplemental/Arial.ttf}"
OUTPUT="${1:-$SCRIPT_DIR/batchclip-0.1.0-synthetic-demo.mp4}"

if [[ ! -x "$FFMPEG_BIN" ]]; then
  printf 'FFmpeg is not executable: %s\n' "$FFMPEG_BIN" >&2
  exit 1
fi

if [[ ! -f "$FONT_FILE" ]]; then
  printf 'Font not found: %s\nSet FONT_FILE to an installed TrueType font.\n' "$FONT_FILE" >&2
  exit 1
fi

"$FFMPEG_BIN" -hide_banner -loglevel warning -y \
  -f lavfi -i "color=c=0xf6ecd9:s=1280x720:r=30:d=12" \
  -vf "
    drawbox=x=0:y=0:w=1280:h=104:color=0x23100c:t=fill,
    drawtext=fontfile='${FONT_FILE}':text='BatchClip 0.1.0 beta':x=64:y=28:fontsize=38:fontcolor=0xf6ecd9,
    drawtext=fontfile='${FONT_FILE}':text='SYNTHETIC INPUT  →  ILLUSTRATIVE OUTPUT':x=64:y=122:fontsize=20:fontcolor=0x6b5b55,

    drawbox=x=64:y=176:w=720:h=405:color=0xffffff:t=fill,
    drawbox=x=76:y=188:w=696:h=381:color=0x31202b:t=fill,
    drawbox=x=76:y=188:w=696:h=82:color=0x9f75ff@0.18:t=fill,
    drawbox=x='150+38*sin(t*1.4)':y=308:w=214:h=196:color=0xcba8ff:t=fill,
    drawbox=x='178+38*sin(t*1.4)':y=340:w=158:h=164:color=0x6f4db7:t=fill,
    drawbox=x=430:y=316:w=278:h=16:color=0xf6ecd9@0.45:t=fill,
    drawbox=x=430:y=352:w='170+35*sin(t*2.2)':h=16:color=0xf6ecd9@0.75:t=fill,
    drawbox=x=430:y=388:w='220+30*cos(t*1.7)':h=16:color=0xf6ecd9@0.55:t=fill,
    drawbox=x=430:y=424:w='140+42*sin(t*1.9)':h=16:color=0x9f75ff:t=fill,
    drawtext=fontfile='${FONT_FILE}':text='LONG-FORM SOURCE':x=96:y=210:fontsize=24:fontcolor=0xf6ecd9,
    drawtext=fontfile='${FONT_FILE}':text='full conversation  •  spoken audio':x=96:y=244:fontsize=17:fontcolor=0xf6ecd9@0.75,
    drawtext=fontfile='${FONT_FILE}':text='INPUT  16 × 9':x=64:y=600:fontsize=21:fontcolor=0x23100c,

    drawbox=x=880:y=150:w=244:h=434:color=0xffffff:t=fill,
    drawbox=x=892:y=162:w=220:h=410:color=0x23100c:t=fill,
    drawbox=x=904:y=174:w=196:h=192:color=0x4b2d5e:t=fill,
    drawbox=x='930+12*sin(t*1.4)':y=204:w=142:h=162:color=0xcba8ff:t=fill,
    drawbox=x='947+12*sin(t*1.4)':y=232:w=108:h=134:color=0x6f4db7:t=fill,
    drawbox=x=904:y=378:w=196:h=144:color=0x140b16@0.94:t=fill,
    drawtext=fontfile='${FONT_FILE}':text='FIND THE':x=925:y=397:fontsize=25:fontcolor=0xffffff:enable='between(t,0,4)',
    drawtext=fontfile='${FONT_FILE}':text='STRONGEST':x=916:y=430:fontsize=25:fontcolor=0x9f75ff:enable='between(t,0,4)',
    drawtext=fontfile='${FONT_FILE}':text='MOMENT':x=938:y=463:fontsize=25:fontcolor=0xffffff:enable='between(t,0,4)',
    drawtext=fontfile='${FONT_FILE}':text='REFRAME':x=929:y=414:fontsize=25:fontcolor=0xffffff:enable='between(t,4,8)',
    drawtext=fontfile='${FONT_FILE}':text='THE SPEAKER':x=913:y=450:fontsize=23:fontcolor=0x9f75ff:enable='between(t,4,8)',
    drawtext=fontfile='${FONT_FILE}':text='BURN IN':x=942:y=397:fontsize=25:fontcolor=0xffffff:enable='between(t,8,12)',
    drawtext=fontfile='${FONT_FILE}':text='READABLE':x=929:y=430:fontsize=25:fontcolor=0x9f75ff:enable='between(t,8,12)',
    drawtext=fontfile='${FONT_FILE}':text='CAPTIONS':x=927:y=463:fontsize=25:fontcolor=0xffffff:enable='between(t,8,12)',
    drawtext=fontfile='${FONT_FILE}':text='OUTPUT  9 × 16':x=880:y=600:fontsize=21:fontcolor=0x23100c,

    drawtext=fontfile='${FONT_FILE}':text='Generated shapes and text only  •  No user media  •  Illustrative, not acceptance evidence':x=64:y=666:fontsize=16:fontcolor=0x6b5b55
  " \
  -an -c:v libx264 -preset medium -crf 25 -pix_fmt yuv420p -movflags +faststart \
  -metadata title="BatchClip 0.1.0 synthetic input-output demo" \
  -metadata comment="Generated shapes and text only; no user media; illustrative output" \
  "$OUTPUT"

printf 'Wrote %s\n' "$OUTPUT"
