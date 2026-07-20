#!/usr/bin/env bash
set -euo pipefail; IFS=$'\n\t'

# ---------------------------------------------------------------------------
# HyperFrames Delos Showreel — renders all new blocks → single MP4
# Usage: bash scripts/render-showreel.sh
# ---------------------------------------------------------------------------

CATALOG_DIR="src/main/hyperframes/catalog"
OUT_DIR="showreel-tmp"
OUTPUT="showreel-delos.mp4"
SEC=2.5
FPS=30

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# Each block: render_block NAME JSON_VARIABLES
render_block() {
  local NAME="$1"
  local VARS="$2"
  local HTML="$CATALOG_DIR/${NAME}.html"
  local PROJ="$OUT_DIR/proj-${NAME}"
  local MOV="$OUT_DIR/${NAME}.mov"
  local MP4="$OUT_DIR/${NAME}.mp4"

  if [ ! -f "$HTML" ]; then
    echo "  ✗ Missing: $HTML"
    return 1
  fi

  mkdir -p "$PROJ/shared"
  cp "$CATALOG_DIR/shared/"* "$PROJ/shared/" 2>/dev/null || true
  sed "s|</body>|<div data-start=\"0\" data-duration=\"${SEC}\" style=\"position:absolute;width:0;height:0;opacity:0;\"></div></body>|" \
    "$HTML" > "$PROJ/index.html"
  echo '{"name":"hf-render","private":true}' > "$PROJ/package.json"

  node_modules/.bin/hyperframes render "$PROJ" \
    --format mov --output "$MOV" --fps "$FPS" --quality standard \
    --workers 1 --variables "$VARS" --quiet 2>/dev/null || true

  if [ -f "$MOV" ]; then
    ffmpeg -y -i "$MOV" -c:v libx264 -preset fast -crf 18 \
      -pix_fmt yuv420p "$MP4" 2>/dev/null
    echo " ✓"
    return 0
  else
    echo " ✗"
    return 1
  fi
}

echo ""
echo "🎬 HyperFrames Delos Showreel"
echo ""

COUNT=0
TOTAL=18

for block in \
  "voice-waveform" \
  "voice-spectrum" \
  "agent-avatar" \
  "transcript-stream" \
  "delos-matrix" \
  "delos-biometric" \
  "delos-system-diagnostics" \
  "delos-tracking-map" \
  "circular-progress" \
  "sparkline-chart" \
  "hologram-orb" \
  "neural-network" \
  "data-sphere" \
  "glowing-cube" \
  "energy-ring" \
  "delos-console" \
  "delos-alert" \
  "delos-scan-result"; do

  COUNT=$((COUNT + 1))
  printf "  [%d/%d] %-30s" "$COUNT" "$TOTAL" "$block"

  case "$block" in
    voice-waveform)
      render_block "$block" '{"label":"Voice Agent Active","amplitude":0.8,"accentColor":"#9f75ff","yPos":45}' ;;
    voice-spectrum)
      render_block "$block" '{"label":"Voice Spectrum","bands":24,"accentColor":"#9f75ff","yPos":45}' ;;
    agent-avatar)
      render_block "$block" '{"icon":"🤖","label":"AI Agent","statusText":"ONLINE","accentColor":"#9f75ff","yPos":42}' ;;
    transcript-stream)
      render_block "$block" '{"words":["Processing","voice","input","in","real-time"],"label":"LIVE TRANSCRIPT","accentColor":"#9f75ff","yPos":45}' ;;
    delos-matrix)
      render_block "$block" '{"hostId":"HC-0001","metrics":[{"name":"Cognition","value":98},{"name":"Emotion","value":87},{"name":"Fidelity","value":95}],"accentColor":"#9f75ff","yPos":42}' ;;
    delos-biometric)
      render_block "$block" '{"identity":"Host #042","pulse":72,"stressLevel":24,"accentColor":"#9f75ff","yPos":42}' ;;
    delos-system-diagnostics)
      render_block "$block" '{"services":[{"name":"Core","status":"online"},{"name":"Network","status":"online"},{"name":"Memory","status":"warning"},{"name":"GPU","status":"online"}],"accentColor":"#9f75ff","yPos":42}' ;;
    delos-tracking-map)
      render_block "$block" '{"waypoints":[{"x":30,"y":40,"label":"A"},{"x":60,"y":25,"label":"B"},{"x":75,"y":60,"label":"C"}],"label":"Tracking Active","accentColor":"#9f75ff","yPos":42}' ;;
    circular-progress)
      render_block "$block" '{"percent":78,"label":"Task Complete","accentColor":"#9f75ff","yPos":45}' ;;
    sparkline-chart)
      render_block "$block" '{"data":[30,45,35,60,55,70,65,80],"trend":"+12%","label":"Performance Trend","accentColor":"#9f75ff","yPos":45}' ;;
    hologram-orb)
      render_block "$block" '{"icon":"🔮","label":"Holographic Display","accentColor":"#9f75ff","yPos":42}' ;;
    neural-network)
      render_block "$block" '{"layers":[3,5,5,3],"label":"Neural Network Active","accentColor":"#9f75ff","yPos":42}' ;;
    data-sphere)
      render_block "$block" '{"icon":"🌐","label":"Data Sphere","points":60,"accentColor":"#9f75ff","yPos":42}' ;;
    glowing-cube)
      render_block "$block" '{"icon":"📦","label":"Data Block","accentColor":"#9f75ff","yPos":42}' ;;
    energy-ring)
      render_block "$block" '{"rings":4,"label":"Energy Field Active","accentColor":"#9f75ff","yPos":42}' ;;
    delos-console)
      render_block "$block" '{"title":"DELOS SYSTEM","statusText":"OPERATIONAL","metrics":[{"label":"Uptime","value":"99.9%"},{"label":"Hosts","value":"2,048"},{"label":"Fidelity","value":"98.7%"}],"accentColor":"#9f75ff","yPos":42}' ;;
    delos-alert)
      render_block "$block" '{"title":"SYSTEM ALERT","message":"Anomalous behavior detected","severity":"warning","accentColor":"#fbbf24","yPos":42}' ;;
    delos-scan-result)
      render_block "$block" '{"title":"SCAN COMPLETE","findings":["Fidelity normal","No anomalies","Memory intact"],"progress":100,"accentColor":"#9f75ff","yPos":42}' ;;
  esac

  rm -rf "$OUT_DIR/proj-${block}"
done

# Collect rendered MP4s
MP4_LIST=()
for f in "$OUT_DIR"/*.mp4; do
  [ -f "$f" ] && MP4_LIST+=("$f")
done

if [ ${#MP4_LIST[@]} -eq 0 ]; then
  echo "  ✗ No blocks rendered."
  exit 1
fi

# Concat
echo ""
echo "🔗 Concatenating ${#MP4_LIST[@]} clips → $OUTPUT"

printf "" > "$OUT_DIR/concat.txt"
for f in "${MP4_LIST[@]}"; do
  echo "file '$(realpath "$f")'" >> "$OUT_DIR/concat.txt"
done

ffmpeg -y -f concat -safe 0 -i "$OUT_DIR/concat.txt" \
  -c copy "$OUTPUT" 2>/dev/null

rm -rf "$OUT_DIR"

echo ""
echo "✅ Done: $OUTPUT"
echo ""
