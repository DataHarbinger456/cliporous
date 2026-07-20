#!/usr/bin/env bash
# Build the unsigned, per-user BatchClip NSIS installer for Windows 10/11 x64.
#
# Usage: npm run release:win
# Output: dist/release/windows-x64/BatchClip-<version>-win-x64.exe

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node "$ROOT/scripts/audit-third-party-assets.mjs" --release
VERSION="$(node -p "require('$ROOT/package.json').version")"
FINAL_OUTPUT="$ROOT/dist/release/windows-x64"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/batchclip-win-x64.XXXXXX")"
STAGE_OUTPUT="$STAGE/release-output"

cleanup() {
  rm -rf "$STAGE"
}
trap cleanup EXIT

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

copy_release_inputs() {
  local input
  local inputs=(
    package.json
    package-lock.json
    LICENSE
    THIRD_PARTY_NOTICES.md
    biome.json
    components.json
    electron.vite.config.ts
    postcss.config.js
    remotion.config.ts
    tailwind.config.js
    tsconfig.json
    tsconfig.node.json
    tsconfig.remotion.json
    tsconfig.web.json
    vitest.config.main.ts
    vitest.config.ts
    build
    python
    resources
    scripts
    src
  )

  for input in "${inputs[@]}"; do
    [ -e "$ROOT/$input" ] || fail "Missing release input: $input"
    cp -R "$ROOT/$input" "$STAGE/"
  done
}

target_windows_x64() {
  env \
    npm_config_os=win32 \
    npm_config_cpu=x64 \
    npm_config_platform=win32 \
    npm_config_arch=x64 \
    npm_config_target_arch=x64 \
    "$@"
}

assert_pe_x64() {
  node - "$1" <<'NODE'
const fs = require('node:fs')
const path = process.argv[2]
const bytes = fs.readFileSync(path)
if (bytes.length < 64 || bytes.toString('ascii', 0, 2) !== 'MZ') {
  throw new Error(`${path} is not a PE executable`)
}
const peOffset = bytes.readUInt32LE(0x3c)
if (bytes.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
  throw new Error(`${path} has no PE signature`)
}
const machine = bytes.readUInt16LE(peOffset + 4)
if (machine !== 0x8664) {
  throw new Error(`${path} is not Windows x64 (PE machine 0x${machine.toString(16)})`)
}
NODE
}

assert_unsigned_pe() {
  node - "$1" <<'NODE'
const fs = require('node:fs')
const path = process.argv[2]
const bytes = fs.readFileSync(path)
const peOffset = bytes.readUInt32LE(0x3c)
const optionalHeader = peOffset + 24
const magic = bytes.readUInt16LE(optionalHeader)
const dataDirectories = magic === 0x20b ? optionalHeader + 112 : optionalHeader + 96
const certificateTableSize = bytes.readUInt32LE(dataDirectories + (4 * 8) + 4)
if (certificateTableSize !== 0) {
  throw new Error(`${path} contains an Authenticode certificate table`)
}
NODE
}

assert_release_contents() {
  local unpacked="$STAGE_OUTPUT/win-unpacked"
  local resources="$unpacked/resources"
  local installer="$STAGE_OUTPUT/BatchClip-$VERSION-win-x64.exe"
  local ffmpeg="$resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe"
  local ffprobe="$resources/app.asar.unpacked/node_modules/@ffprobe-installer/win32-x64/ffprobe.exe"
  local sqlite="$resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node"

  [ -f "$installer" ] || fail "Missing installer: $installer"
  [ -f "$installer.blockmap" ] || fail "Missing installer blockmap"
  [ -f "$STAGE_OUTPUT/latest.yml" ] || fail "Missing latest.yml"
  [ -f "$unpacked/BatchClip.exe" ] || fail "Missing packaged BatchClip.exe"
  [ -f "$unpacked/LICENSE.electron.txt" ] || fail "Missing Electron license"
  [ -f "$unpacked/LICENSES.chromium.html" ] || fail "Missing Chromium third-party notices"
  [ -f "$ffmpeg" ] || fail "Missing packaged Windows x64 FFmpeg"
  [ -f "$ffprobe" ] || fail "Missing packaged Windows x64 ffprobe"
  [ -f "$sqlite" ] || fail "Missing packaged better-sqlite3 native module"

  "$STAGE/node_modules/.bin/asar" list "$resources/app.asar" > "$STAGE/asar-contents.txt"
  node "$STAGE/scripts/assert-clean-release-payload.mjs" "$resources" "$STAGE/asar-contents.txt"

  assert_pe_x64 "$unpacked/BatchClip.exe"
  assert_pe_x64 "$ffmpeg"
  assert_pe_x64 "$ffprobe"
  assert_pe_x64 "$sqlite"
  assert_unsigned_pe "$installer"

  grep -q "BatchClip-$VERSION-win-x64.exe" "$STAGE_OUTPUT/latest.yml" \
    || fail "latest.yml does not reference the Windows x64 installer"

  [ -f "$resources/python/download.py" ] || fail "Missing packaged Python download script"
  [ -f "$resources/python/face_detect.py" ] || fail "Missing packaged Python face detection script"
  [ -f "$resources/python/transcribe.py" ] || fail "Missing packaged Python transcription script"
  [ -f "$resources/python/requirements.txt" ] || fail "Missing packaged Python requirements"
  cmp -s "$ROOT/THIRD_PARTY_NOTICES.md" "$resources/THIRD_PARTY_NOTICES.md" \
    || fail "Missing or changed packaged third-party notices"
  find "$resources/fonts" -type f -name '*.ttf' -print -quit | grep -q . \
    || fail "No packaged fonts found"
  find "$resources/sfx" -type f -print -quit | grep -q . \
    || fail "No packaged SFX resources found"
  find "$resources/music" -type f -print -quit | grep -q . \
    || fail "No packaged music resources found"

  if find "$STAGE_OUTPUT" -iname '*arm64*' -print -quit | grep -q .; then
    fail "Windows arm64 content was generated"
  fi
}

step "Creating an isolated release workspace"
copy_release_inputs
ok "Release inputs copied to $STAGE"

cd "$STAGE"

step "Installing locked Windows x64 dependencies"
target_windows_x64 npm ci --ignore-scripts --include=optional
[ -d node_modules/@ffprobe-installer/win32-x64 ] \
  || fail "npm did not install @ffprobe-installer/win32-x64"
target_windows_x64 ./node_modules/.bin/electron-builder install-app-deps --platform=win32 --arch=x64
rm -f node_modules/ffmpeg-static/ffmpeg node_modules/ffmpeg-static/ffmpeg.exe
target_windows_x64 node node_modules/ffmpeg-static/install.js
assert_pe_x64 node_modules/ffmpeg-static/ffmpeg.exe
assert_pe_x64 node_modules/@ffprobe-installer/win32-x64/ffprobe.exe
assert_pe_x64 node_modules/better-sqlite3/build/Release/better_sqlite3.node
ok "FFmpeg, ffprobe, and native modules target Windows x64"

step "Building the Electron application"
npm run build
ok "Electron application built"

step "Packaging unsigned per-user Windows x64 NSIS installer"
unset CSC_LINK CSC_KEY_PASSWORD WIN_CSC_LINK WIN_CSC_KEY_PASSWORD CSC_NAME
export CSC_IDENTITY_AUTO_DISCOVERY=false
./node_modules/.bin/electron-builder \
  --win nsis \
  --x64 \
  --publish never \
  --config.forceCodeSigning=false \
  --config.directories.output="$STAGE_OUTPUT"

step "Verifying installer architecture, signature, native modules, and resources"
assert_release_contents
ok "Release payload verified"

step "Publishing release artifacts to the project output directory"
mkdir -p "$(dirname "$FINAL_OUTPUT")"
rm -rf "$FINAL_OUTPUT"
cp -R "$STAGE_OUTPUT" "$FINAL_OUTPUT"
ok "Unsigned Windows x64 installer: $FINAL_OUTPUT/BatchClip-$VERSION-win-x64.exe"
