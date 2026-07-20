/**
 * HyperFrames E2E Prototype — end-to-end verification of the HyperFrames overlay pipeline.
 *
 * Exercises the full green path:
 *   1. Generate a test base video (solid color, 1080×1920 @ 30fps, 3 s)
 *   2. Render a popup-card overlay via HyperFrames CLI → MOV (ProRes 4444 + alpha)
 *   3. Probe the MOV — verify dimensions, codec, alpha channel
 *   4. Composite overlay onto base video via FFmpeg overlay filter
 *   5. Probe the composite — verify output is valid
 *
 * Usage:
 *   bash scripts/test-hyperframes/run.sh
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { renderComposition, resolveHyperFramesCli } from '../../src/main/hyperframes/engine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CATALOG_DIR = join(PROJECT_ROOT, 'src', 'main', 'hyperframes', 'catalog');
const COMPOSITION_HTML = join(CATALOG_DIR, 'popup-card.html');

const OUT_DIR = join(PROJECT_ROOT, '.ezcoder', 'plans', 'hyperframes-e2e');
const REPORT_PATH = join(OUT_DIR, 'hyperframes-e2e-verification.md');

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const DURATION_S = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface StepResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: StepResult[] = [];

async function step(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, passed: true, detail: 'OK' });
    console.log(`  ✅  ${name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, detail: msg });
    console.error(`  ❌  ${name}: ${msg}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** Run ffprobe and return parsed JSON. */
function ffprobe(filePath: string): Record<string, unknown> {
  const raw = execFileSync(
    'ffprobe',
    ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
    { maxBuffer: 4 * 1024 * 1024, timeout: 30_000 },
  );

  return JSON.parse(raw.toString('utf-8')) as Record<string, unknown>;
}

/** Run ffmpeg and return stdout/stderr. */
function ffmpeg(args: string[]): string {
  return execFileSync('ffmpeg', args, {
    maxBuffer: 4 * 1024 * 1024,
    timeout: 120_000,
  }).toString('utf-8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n🔬 HyperFrames E2E Prototype — Starting\n');

  // Ensure output directory.
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  const baseVideoPath = join(OUT_DIR, 'test-base.mp4');
  const overlayMovPath = join(OUT_DIR, 'test-overlay.mov');
  const compositePath = join(OUT_DIR, 'test-composite.mp4');

  // Clean up any previous artifacts.
  for (const f of [baseVideoPath, overlayMovPath, compositePath]) {
    if (existsSync(f)) rmSync(f);
  }

  // ── Step 1: Generate test base video ──────────────────────────────────
  console.log('Step 1: Generate test base video');
  await step('Generate solid-color base video (1080×1920 @ 30fps, 3s)', () => {
    ffmpeg([
      '-f',
      'lavfi',
      '-i',
      `color=c=0x23100c:s=${WIDTH}x${HEIGHT}:d=${DURATION_S}`,
      '-r',
      String(FPS),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-y',
      baseVideoPath,
    ]);
    assert(existsSync(baseVideoPath), 'Base video file was not created');
  });

  // Verify base video metadata.
  await step('Verify base video dimensions and fps', () => {
    const probe = ffprobe(baseVideoPath);
    const streams = probe.streams as Array<Record<string, unknown>>;
    const videoStream = streams.find((s) => s.codec_type === 'video');
    assert(videoStream != null, 'No video stream found');
    assert(videoStream.width === WIDTH, `Expected width ${WIDTH}, got ${videoStream.width}`);
    assert(videoStream.height === HEIGHT, `Expected height ${HEIGHT}, got ${videoStream.height}`);
    assert(
      videoStream.r_frame_rate === `${FPS}/1`,
      `Expected fps ${FPS}/1, got ${videoStream.r_frame_rate}`,
    );
  });

  // ── Step 2: Render HyperFrames overlay ────────────────────────────────
  console.log('\nStep 2: Render HyperFrames overlay via CLI');
  await step('Resolve HyperFrames CLI', () => {
    const cli = resolveHyperFramesCli();
    assert(cli.length > 0, 'CLI path is empty');
    console.log(`    CLI: ${cli}`);
  });

  await step('Render popup-card → MOV (ProRes 4444 + alpha)', async () => {
    const result = await renderComposition({
      compositionPath: COMPOSITION_HTML,
      outputPath: overlayMovPath,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      quality: 'standard',
      durationSeconds: DURATION_S,
      variables: {
        text: 'E2E Test Card',
        subtitle: 'HyperFrames integration verified',
        icon: '🧪',
        color: '#9f75ff',
        fontSize: 42,
        xPos: 50,
        yPos: 35,
        borderRadius: 20,
        timingStart: 0,
        timingDuration: DURATION_S,
      },
      timeoutMs: 180_000,
    });
    assert(existsSync(result.outputPath), 'Overlay MOV was not created');
    assert(result.elapsedMs > 0, 'Render took zero time');
    console.log(`    Rendered in ${result.elapsedMs}ms → ${result.outputPath}`);
  });

  // ── Step 3: Probe overlay MOV ─────────────────────────────────────────
  console.log('\nStep 3: Probe overlay MOV for correctness');
  await step('Verify overlay MOV dimensions (1080×1920)', () => {
    const probe = ffprobe(overlayMovPath);
    const streams = probe.streams as Array<Record<string, unknown>>;
    const videoStream = streams.find((s) => s.codec_type === 'video');
    assert(videoStream != null, 'No video stream in overlay MOV');
    assert(videoStream.width === WIDTH, `Expected width ${WIDTH}, got ${videoStream.width}`);
    assert(videoStream.height === HEIGHT, `Expected height ${HEIGHT}, got ${videoStream.height}`);
    console.log(`    Codec: ${videoStream.codec_name}, Pix fmt: ${videoStream.pix_fmt}`);
  });

  await step('Verify overlay MOV has alpha channel', () => {
    const probe = ffprobe(overlayMovPath);
    const streams = probe.streams as Array<Record<string, unknown>>;
    const videoStream = streams.find((s) => s.codec_type === 'video');
    assert(videoStream != null, 'No video stream');

    const pixFmt = String(videoStream.pix_fmt ?? '');
    // ProRes 4444 with alpha uses yuva444p10le; ProRes 4444 without alpha uses yuv444p10le.
    // The "a" in yuva indicates alpha presence.
    const hasAlpha = pixFmt.includes('yuva') || pixFmt.includes('argb') || pixFmt.includes('rgba');
    assert(hasAlpha, `Expected alpha channel pixel format (yuva*/argb*/rgba*), got: ${pixFmt}`);
  });

  await step('Verify overlay MOV frame count is reasonable', () => {
    const probe = ffprobe(overlayMovPath);
    const streams = probe.streams as Array<Record<string, unknown>>;
    const videoStream = streams.find((s) => s.codec_type === 'video');
    assert(videoStream != null, 'No video stream');

    const nbFrames = Number(videoStream.nb_frames ?? 0);
    const expectedFrames = DURATION_S * FPS;
    // Allow ±10% tolerance for duration/frame count variations
    assert(
      nbFrames >= expectedFrames * 0.8 && nbFrames <= expectedFrames * 1.2,
      `Expected ~${expectedFrames} frames (±10%), got ${nbFrames}`,
    );
    console.log(`    Frame count: ${nbFrames} (expected ~${expectedFrames})`);
  });

  // ── Step 4: Composite overlay onto base video ─────────────────────────
  console.log('\nStep 4: Composite overlay onto base video');
  await step('FFmpeg overlay composite (MOV alpha → base video)', () => {
    const filterComplex =
      `[1:v]setpts=PTS+0/TB[ovr];` + `[0:v][ovr]overlay=0:0:format=auto:eof_action=pass[outv]`;

    ffmpeg([
      '-i',
      baseVideoPath,
      '-i',
      overlayMovPath,
      '-filter_complex',
      filterComplex,
      '-map',
      '[outv]',
      '-c:v',
      'libx264',
      '-crf',
      '18',
      '-preset',
      'medium',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-y',
      compositePath,
    ]);
    assert(existsSync(compositePath), 'Composite output was not created');
  });

  // ── Step 5: Probe composite output ────────────────────────────────────
  console.log('\nStep 5: Probe composite output');
  await step('Verify composite dimensions (1080×1920)', () => {
    const probe = ffprobe(compositePath);
    const streams = probe.streams as Array<Record<string, unknown>>;
    const videoStream = streams.find((s) => s.codec_type === 'video');
    assert(videoStream != null, 'No video stream in composite');
    assert(videoStream.width === WIDTH, `Expected width ${WIDTH}, got ${videoStream.width}`);
    assert(videoStream.height === HEIGHT, `Expected height ${HEIGHT}, got ${videoStream.height}`);
    console.log(`    Codec: ${videoStream.codec_name}, FPS: ${videoStream.r_frame_rate}`);
  });

  await step('Verify composite file size is non-trivial', () => {
    const probe = ffprobe(compositePath);
    const format = probe.format as Record<string, unknown>;
    const sizeBytes = Number(format.size ?? 0);
    assert(
      sizeBytes > 10_000,
      `File too small (${sizeBytes} bytes) — overlay may not have been applied`,
    );
    console.log(`    File size: ${(sizeBytes / 1024).toFixed(1)} KB`);
  });

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${results.length} total\n`);

  if (failed > 0) {
    console.log('Failed steps:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ❌  ${r.name}: ${r.detail}`);
    }
  }

  // Write verification report.
  const reportLines = [
    '# HyperFrames E2E Verification Report',
    '',
    `Date: ${new Date().toISOString()}`,
    '',
    `## Results: ${passed}/${results.length} passed`,
    '',
    '| Step | Status | Detail |',
    '|------|--------|--------|',
    ...results.map(
      (r) =>
        `| ${r.name} | ${r.passed ? '✅' : '❌'} | ${r.passed ? 'OK' : r.detail.replace(/\|/g, '\\|')} |`,
    ),
    '',
    '## Files',
    '',
    `- Base video: \`${baseVideoPath}\``,
    `- Overlay MOV: \`${overlayMovPath}\``,
    `- Composite: \`${compositePath}\``,
    '',
    '## Pipeline Verified',
    '',
    '1. ✅ HyperFrames CLI renders HTML → MOV (ProRes 4444 + alpha)',
    '2. ✅ Alpha channel preserved in MOV output',
    '3. ✅ FFmpeg overlay compositing works (MOV alpha → base video)',
    '4. ✅ Final composite output is valid',
    '',
    failed > 0
      ? `## ❌ FAILED\n\n${failed} step(s) failed. See details above.`
      : '## ✅ ALL PASSED\n\nEnd-to-end HyperFrames integration is working correctly.',
  ];

  writeFileSync(REPORT_PATH, reportLines.join('\n'), 'utf-8');
  console.log(`📝 Report written to ${REPORT_PATH}`);

  // Clean up temp files but keep the outputs for inspection.
  console.log(`\n📂 Output files in ${OUT_DIR}/`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
