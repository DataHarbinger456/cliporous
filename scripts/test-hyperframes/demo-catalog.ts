/**
 * HyperFrames Catalog Showreel — renders all catalog templates over a real
 * video frame to show how glass morphism overlays look on actual content.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { renderComposition } from '../../src/main/hyperframes/engine';
import type { OverlayBlockName } from '../../src/main/hyperframes/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CATALOG_DIR = join(PROJECT_ROOT, 'src', 'main', 'hyperframes', 'catalog');
const OUT_DIR = join(PROJECT_ROOT, '.ezcoder', 'plans', 'hyperframes-e2e');
const DEMO_OUTPUT = join(OUT_DIR, 'catalog-showreel.mp4');
const BG_IMAGE = join(OUT_DIR, 'bg-source.png');

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const BLOCK_DURATION = 3;

// ---------------------------------------------------------------------------
// Catalog — all 10 V2 templates with representative presets
// ---------------------------------------------------------------------------

interface CatalogEntry {
  block: OverlayBlockName;
  label: string;
  variables: Record<string, unknown>;
}

const CATALOG: CatalogEntry[] = [
  {
    block: 'glass-card',
    label: 'glass-card — AI Sales Agent',
    variables: {
      icon: '🤖',
      title: 'AI Sales Agent',
      subtitle: 'Handles calls 24/7',
      accentColor: '#60a5fa',
      yPos: 35,
    },
  },
  {
    block: 'big-stat',
    label: 'big-stat — $50K Saved',
    variables: {
      number: '50K',
      label: 'saved per year',
      prefix: '$',
      accentColor: '#4ade80',
      yPos: 50,
    },
  },
  {
    block: 'terminal-window',
    label: 'terminal-window — Deploy Agent',
    variables: {
      title: 'AI Agent',
      command: '$ deploy-agent --type sales',
      output: 'Agent deployed ✓\nHandling inbound calls...\n24/7 coverage active',
      accentColor: '#4ade80',
    },
  },
  {
    block: 'checklist',
    label: 'checklist — What AI Handles',
    variables: {
      title: 'What AI Handles',
      items: ['Sales calls', 'Lead qualification', 'Follow-up emails', 'Appointment booking'],
      checked: [true, true, true, true],
      accentColor: '#4ade80',
      yPos: 38,
    },
  },
  {
    block: 'pill-badge',
    label: 'pill-badge — AUTOMATED',
    variables: {
      icon: '⚡',
      text: 'AUTOMATED',
      accentColor: '#4ade80',
      glow: true,
      yPos: 12,
    },
  },
  {
    block: 'before-after',
    label: 'before-after — Manual vs AI',
    variables: {
      leftLabel: 'MANUAL',
      leftValue: '10 hrs/week',
      leftIcon: '📋',
      rightLabel: 'WITH AI',
      rightValue: '10 min/week',
      rightIcon: '🤖',
      accentColor: '#4ade80',
    },
  },
  {
    block: 'icon-label',
    label: 'icon-label — AI Automation',
    variables: {
      icon: '🤖',
      label: 'AI Automation',
      iconSize: 64,
      accentColor: '#60a5fa',
    },
  },
  {
    block: 'numbered-step',
    label: 'numbered-step — Step 1',
    variables: {
      number: '1',
      title: 'Connect Your CRM',
      description: 'Link your existing tools in one click',
      accentColor: '#9f75ff',
    },
  },
  {
    block: 'icon-grid',
    label: 'icon-grid — AI Capabilities',
    variables: {
      columns: 2,
      items: [
        { icon: '📞', label: 'Sales' },
        { icon: '📧', label: 'Marketing' },
        { icon: '🎧', label: 'Support' },
        { icon: '💰', label: 'Billing' },
      ],
    },
  },
  {
    block: 'progress-ring',
    label: 'progress-ring — 90% Automated',
    variables: {
      percent: 90,
      label: 'Automated',
      accentColor: '#4ade80',
      yPos: 50,
    },
  },
  {
    block: 'hud-card',
    label: 'hud-card — Agent Status',
    variables: {
      title: 'AI Agent Deployed',
      description: 'All systems operational — handling inbound',
      statusText: 'AGENT ACTIVE',
      metrics: [
        { value: '99.9%', label: 'Uptime' },
        { value: '12ms', label: 'Latency' },
        { value: '2.4K', label: 'Today' },
      ],
      accentColor: '#4ade80',
    },
  },
  {
    block: 'ai-orb',
    label: 'ai-orb — AI Processing',
    variables: {
      icon: '🧠',
      label: 'AI Processing',
      sublabel: 'Analyzing your data in real-time',
      accentColor: '#9f75ff',
    },
  },
  {
    block: 'wave-line',
    label: 'wave-line — Live Processing',
    variables: {
      label: 'AI Active',
      sublabel: 'Processing 2,400 tasks today',
      waveType: 'pulse',
      accentColor: '#4ade80',
    },
  },
  {
    block: 'network-nodes',
    label: 'network-nodes — Integrations',
    variables: {
      title: 'Connected & Integrated',
      accentColor: '#60a5fa',
    },
  },
  {
    block: 'stat-bar',
    label: 'stat-bar — Performance',
    variables: {
      title: 'Performance Metrics',
      bars: [
        { label: 'Automation Rate', value: '92%', percent: 92, color: '#4ade80' },
        { label: 'Cost Reduction', value: '68%', percent: 68, color: '#60a5fa' },
        { label: 'Speed Increase', value: '340%', percent: 85, color: '#fbbf24' },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ffmpeg(args: string[]): string {
  return execFileSync('ffmpeg', args, {
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120_000,
  }).toString('utf-8');
}

function ffprobe(filePath: string): Record<string, unknown> {
  const raw = execFileSync(
    'ffprobe',
    ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
    { maxBuffer: 4 * 1024 * 1024, timeout: 30_000 },
  );
  return JSON.parse(raw.toString('utf-8')) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n🎬 HyperFrames Catalog Showreel\n');
  console.log(
    `   ${CATALOG.length} templates × ${BLOCK_DURATION}s = ${CATALOG.length * BLOCK_DURATION}s total\n`,
  );

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (existsSync(DEMO_OUTPUT)) rmSync(DEMO_OUTPUT);

  const totalDuration = CATALOG.length * BLOCK_DURATION;

  // ── 1. Generate base video from screenshot ─────────────────────────────
  console.log('Step 1: Generating base video from screenshot...');
  const basePath = join(OUT_DIR, 'showreel-base.mp4');
  if (existsSync(basePath)) rmSync(basePath);

  if (!existsSync(BG_IMAGE)) {
    console.error(`  ❌ Background image not found: ${BG_IMAGE}`);
    process.exit(1);
  }

  // Loop the screenshot image for the full duration, scaled to 1080×1920.
  ffmpeg([
    '-loop',
    '1',
    '-i',
    BG_IMAGE,
    '-vf',
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
    '-r',
    String(FPS),
    '-t',
    String(totalDuration),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-y',
    basePath,
  ]);
  console.log(`  ✅ Base video: ${totalDuration}s @ ${WIDTH}×${HEIGHT} (from screenshot)`);

  // ── 2. Render each catalog template ───────────────────────────────────
  console.log('\nStep 2: Rendering catalog templates via HyperFrames...');
  const overlayPaths: string[] = [];

  for (const entry of CATALOG) {
    const outPath = join(OUT_DIR, `showreel-${entry.block}.mov`);
    const compPath = join(CATALOG_DIR, `${entry.block}.html`);

    if (!existsSync(compPath)) {
      console.log(`  ⚠️  Skipping ${entry.block} — template not found`);
      continue;
    }

    if (existsSync(outPath)) {
      console.log(`  ✅ ${entry.label} — cached`);
      overlayPaths.push(outPath);
      continue;
    }

    console.log(`  🔧 Rendering ${entry.label}...`);
    const start = Date.now();

    try {
      await renderComposition({
        compositionPath: compPath,
        outputPath: outPath,
        width: WIDTH,
        height: HEIGHT,
        fps: FPS,
        quality: 'standard',
        durationSeconds: BLOCK_DURATION,
        variables: {
          ...entry.variables,
          timingStart: 0,
          timingDuration: BLOCK_DURATION,
        },
        timeoutMs: 180_000,
      });

      const elapsed = Date.now() - start;
      console.log(`  ✅ ${entry.label} — ${elapsed}ms`);
      overlayPaths.push(outPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ ${entry.label} failed: ${msg}`);
    }
  }

  if (overlayPaths.length === 0) {
    console.error('\n💥 No overlays rendered — aborting');
    process.exit(1);
  }

  // ── 3. Composite all overlays onto base video ─────────────────────────
  console.log(`\nStep 3: Compositing ${overlayPaths.length} overlays onto base video...`);

  const inputs: string[] = ['-i', basePath];
  const filterParts: string[] = [];

  for (let i = 0; i < overlayPaths.length; i++) {
    inputs.push('-i', overlayPaths[i]);
  }

  let lastLabel = '[0:v]';

  for (let i = 0; i < overlayPaths.length; i++) {
    const inputIdx = i + 1;
    const startSec = i * BLOCK_DURATION;
    const isLast = i === overlayPaths.length - 1;
    const outLabel = isLast ? '[outv]' : `[v${i}]`;

    filterParts.push(`[${inputIdx}:v]setpts=PTS+${startSec}/TB[ovr${i}]`);
    filterParts.push(`${lastLabel}[ovr${i}]overlay=0:0:format=auto:eof_action=pass${outLabel}`);

    lastLabel = outLabel;
  }

  const filterComplex = filterParts.join(';');

  ffmpeg([
    ...inputs,
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
    DEMO_OUTPUT,
  ]);

  console.log(`  ✅ Composited → ${DEMO_OUTPUT}`);

  // ── 4. Verify output ──────────────────────────────────────────────────
  console.log('\nStep 4: Verifying output...');
  const probe = ffprobe(DEMO_OUTPUT);
  const streams = probe.streams as Array<Record<string, unknown>>;
  const video = streams.find((s) => s.codec_type === 'video');
  const format = probe.format as Record<string, unknown>;

  console.log(`  Resolution: ${video?.width}×${video?.height}`);
  console.log(`  Codec: ${video?.codec_name}, FPS: ${video?.r_frame_rate}`);
  console.log(
    `  Duration: ${format.duration}s, Size: ${(Number(format.size) / 1024).toFixed(0)} KB`,
  );

  // Clean up intermediates.
  console.log('\nStep 5: Cleaning up intermediates...');
  rmSync(basePath);
  for (const p of overlayPaths) {
    try {
      rmSync(p);
    } catch {
      /* ignore */
    }
  }

  console.log(`\n🎬 Done! Showreel: ${DEMO_OUTPUT}`);
  console.log(`   ${overlayPaths.length} templates × ${BLOCK_DURATION}s = ${totalDuration}s\n`);
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
