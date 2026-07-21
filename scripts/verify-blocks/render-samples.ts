/**
 * Content-block QA harness.
 *
 * Renders ONE still frame of every long-form content block in every skin (and,
 * optionally, every palette) using representative sample props, then tiles the
 * stills into a contact-sheet grid PNG (rows = block kinds, columns = skins) so
 * all combos can be eyeballed at a glance after a skin/block/palette edit.
 *
 * The block list comes from `LONGFORM_BLOCK_BASE` and the skin list from
 * `SKINS`, so this stays in sync automatically — never hardcode either list.
 *
 * Usage (from repo root):
 *   scripts/verify-blocks/run.sh                 # brand palette only
 *   scripts/verify-blocks/run.sh --all-palettes  # one grid per built-in palette
 *   scripts/verify-blocks/run.sh --palette=midnight-cyan
 *
 * Output (gitignored): .gg/block-samples/<paletteId>/
 *   - <kind>__<skin>.png   per-combo stills
 *   - _grid.png            contact sheet for one-glance review
 *
 * Requires a Chromium-capable @remotion/renderer install and ffmpeg (resolved
 * via the app's ffmpeg-static helper) for the tiling pass.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import ffmpegStatic from 'ffmpeg-static';
import {
  LONGFORM_BLOCK_BASE,
  resolveLongformBlockCompositionId,
} from '../../src/main/remotion/registry';
import { SKINS } from '../../src/main/remotion/shared/skins';
import { createWebpackOverride } from '../../src/main/remotion/webpack-override';
import { BUILTIN_PALETTES, getPaletteById, type Palette } from '../../src/shared/palettes';
import type { LongformBlockKind, LongformSkinId } from '../../src/shared/types';

const PROJECT_ROOT = resolve(__dirname, '..', '..');
const OUT_ROOT = join(PROJECT_ROOT, '.gg', 'block-samples');
const LABEL_FONT = join(PROJECT_ROOT, 'resources', 'fonts', 'Inter.ttf');

// Compositions are registered at FPS*4 = 120 frames; render the mid-timeline
// frame so entrance/exit springs have settled and nothing is mid-transition.
const STILL_FRAME = 60;
// Downscale 1920×1080 → 480×270 thumbnails so a 4×17 grid stays a sane size.
const STILL_SCALE = 0.25;
// Cell dimensions (must match a STILL_SCALE downscale of the 1920×1080 canvas).
// Used to synthesize same-size placeholder cells so the grid sequence stays
// contiguous when a combo fails to render.
const CELL_WIDTH = Math.round(1920 * STILL_SCALE);
const CELL_HEIGHT = Math.round(1080 * STILL_SCALE);

const SKIN_IDS = Object.keys(SKINS) as LongformSkinId[];
const BLOCK_KINDS = Object.keys(LONGFORM_BLOCK_BASE) as LongformBlockKind[];

/**
 * Representative sample props per block kind. Shapes mirror the interfaces in
 * `src/main/remotion/compositions/blocks/types.ts`. `skinId`, `palette` and
 * `accentColor` are injected per combo at render time and omitted here.
 */
const SAMPLE_PROPS: Record<LongformBlockKind, Record<string, unknown>> = {
  'bar-chart': {
    kicker: 'THE NUMBERS',
    heading: 'Revenue By Quarter',
    bars: [
      { label: 'Q1', value: 0.42, valueLabel: '$84K' },
      { label: 'Q2', value: 0.58, valueLabel: '$116K' },
      { label: 'Q3', value: 0.74, valueLabel: '$148K' },
      { label: 'Q4', value: 1.0, valueLabel: '$201K' },
    ],
  },
  comparison: {
    kicker: 'THE FORK',
    heading: 'Amateurs vs Operators',
    leftTitle: 'OPERATORS',
    rightTitle: 'AMATEURS',
    leftItems: ['Sell before they build', 'Raise prices on purpose', 'Measure what compounds'],
    rightItems: ['Polish in private', 'Compete on cheap', 'Chase vanity metrics'],
  },
  'comparison-table': {
    kicker: 'THE FORK',
    heading: 'Operators vs Amateurs',
    leftTitle: 'OPERATORS',
    rightTitle: 'AMATEURS',
    leftItems: ['Sell before they build', 'Raise prices on purpose', 'Measure what compounds'],
    rightItems: ['Polish in private', 'Compete on cheap', 'Chase vanity metrics'],
  },
  'stat-grid': {
    kicker: 'BY THE NUMBERS',
    heading: 'One Year In',
    stats: [
      { value: '3.4x', label: 'Revenue growth' },
      { value: '12K', label: 'Active customers' },
      { value: '98%', label: 'Retention rate' },
      { value: '<2h', label: 'Support response' },
    ],
  },
  'icon-stat-grid': {
    kicker: 'BY THE NUMBERS',
    heading: 'One Year Of Growth',
    items: [
      { icon: 'Users', value: '12K', label: 'Active customers' },
      { icon: 'DollarSign', value: '3.4x', label: 'Revenue growth' },
      { icon: 'Repeat', value: '98%', label: 'Retention rate' },
      { icon: 'Clock', value: '<2h', label: 'Support response' },
    ],
  },
  'icon-row': {
    kicker: 'THE STACK',
    heading: 'Built On Four Pillars',
    items: [
      { icon: 'Target', label: 'Positioning' },
      { icon: 'Zap', label: 'Velocity' },
      { icon: 'RefreshCw', label: 'Retention' },
      { icon: 'TrendingUp', label: 'Leverage' },
    ],
  },
  'numbered-list': {
    kicker: 'THE PLAYBOOK',
    heading: 'Ship Your First Offer',
    items: [
      { text: 'Pick one painful problem', detail: 'Narrow beats clever every time' },
      { text: 'Pre-sell before you build', detail: 'A deposit is the only real validation' },
      { text: 'Deliver the ugly version', detail: 'Speed compounds, polish does not' },
    ],
  },
  checklist: {
    kicker: 'LAUNCH PREP',
    heading: 'Before You Go Live',
    items: [
      { text: 'Landing page is live', done: true },
      { text: 'Payment link tested', done: true },
      { text: 'Waitlist emailed', done: true },
      { text: 'Launch thread scheduled', done: false },
    ],
  },
  'stat-hero': {
    kicker: 'ONE YEAR IN',
    heading: 'Annual Recurring Revenue',
    value: 1.2,
    decimals: 1,
    prefix: '$',
    suffix: 'M',
    label: 'Up from $310K last year',
    trend: 'up',
    delta: '+287% YoY',
  },
  'progress-bars': {
    kicker: 'WHERE TIME GOES',
    heading: 'How Founders Spend The Week',
    bars: [
      { label: 'Building product', value: 0.82, valueLabel: '82%' },
      { label: 'Talking to users', value: 0.54, valueLabel: '54%' },
      { label: 'Marketing', value: 0.38, valueLabel: '38%' },
      { label: 'Admin & ops', value: 0.21, valueLabel: '21%' },
    ],
  },
  'kpi-ticker': {
    kicker: 'THIS QUARTER',
    heading: 'The Numbers That Matter',
    items: [
      { value: '4.8K', label: 'CUSTOMERS', delta: '+12%', trend: 'up' },
      { value: '98%', label: 'RETENTION', delta: '+3%', trend: 'up' },
      { value: '1.9%', label: 'CHURN', delta: '-0.4%', trend: 'down' },
    ],
  },
  'quote-card': {
    kicker: 'IN THEIR WORDS',
    heading: 'What Users Say',
    quote: 'The compounding effect is invisible until it is undeniable.',
    name: 'Jordan Rivera',
    role: 'Founder, Latchkey',
  },
  'tweet-card': {
    kicker: 'THE RECEIPTS',
    heading: 'It Spread On Its Own',
    name: 'Mara Chen',
    handle: 'marabuilds',
    verified: true,
    body: 'Spent the weekend rebuilding our launch video with this. Three clips, four looks each, zero After Effects. Wild.',
    replies: '312',
    reposts: '1.2K',
    likes: '8.4K',
  },
  'definition-card': {
    kicker: 'DEFINE IT',
    heading: 'Know The Term',
    term: 'Leverage',
    partOfSpeech: 'noun',
    definition:
      'Output that keeps producing after the work that created it is done — code, media, and brand.',
  },
  timeline: {
    kicker: 'THE PLAYBOOK',
    heading: 'From Idea To First Sale',
    steps: [
      { title: 'Validate the pain', detail: 'Ten conversations before one line of code' },
      { title: 'Sell before you build', detail: 'A waitlist is a vote with intent' },
      { title: 'Ship the ugly version', detail: 'Embarrassment is cheaper than silence' },
    ],
  },
  'timeline-cards': {
    kicker: 'THE ROADMAP',
    heading: 'From Zero To Launch',
    steps: [
      { icon: 'Lightbulb', title: 'Validate', detail: 'Ten interviews before one line of code' },
      { icon: 'Hammer', title: 'Build', detail: 'Ship the smallest useful version' },
      { icon: 'Rocket', title: 'Launch', detail: 'Tell everyone, loudly, on one day' },
    ],
  },
  'feature-grid': {
    kicker: 'WHY IT WORKS',
    heading: 'Built For Operators',
    items: [
      { icon: 'Zap', title: 'Fast by default', description: 'Renders in seconds, not minutes' },
      { icon: 'ShieldCheck', title: 'Private', description: 'Runs locally on your machine' },
      { icon: 'Layers', title: 'Composable', description: 'Mix blocks and skins freely' },
      { icon: 'TrendingUp', title: 'Proven', description: 'Tested across thousands of clips' },
    ],
  },
};

function parsePaletteArg(): Palette[] {
  const args = process.argv.slice(2);
  if (args.includes('--all-palettes')) return BUILTIN_PALETTES;
  const flag = args.find((a) => a.startsWith('--palette='));
  if (flag) {
    const id = flag.slice('--palette='.length);
    return [getPaletteById(id)];
  }
  // Default: the brand palette only.
  return [getPaletteById('brand')];
}

function ffmpeg(): string {
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin) throw new Error('ffmpeg binary not resolved (ffmpeg-static missing?)');
  return bin;
}

/** Escape a string for use inside an ffmpeg `drawtext` text= field. */
function escapeDrawText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '\u2019');
}

/**
 * Stamp a label bar on a thumbnail (in place via a temp) so the contact sheet
 * is self-describing without an explicit header row.
 */
function labelThumb(src: string, dst: string, text: string): void {
  const drawtext =
    `drawtext=fontfile='${LABEL_FONT}':text='${escapeDrawText(text)}':` +
    `fontcolor=white:fontsize=16:x=8:y=6:box=1:boxcolor=black@0.6:boxborderw=5`;
  const res = spawnSync(ffmpeg(), ['-y', '-i', src, '-vf', drawtext, '-frames:v', '1', dst], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  if (res.status !== 0) {
    throw new Error(`drawtext failed for ${text}: ${res.stderr?.toString() ?? ''}`);
  }
}

/**
 * Write a labeled placeholder cell at thumbnail size. Used when a combo fails
 * to render so the row-major grid sequence stays contiguous (a gap in the
 * `seq_%03d.png` series would truncate the whole contact sheet) and the failed
 * cell is visibly flagged rather than silently shifting every later cell.
 */
function placeholderCell(dst: string, text: string): void {
  const drawtext =
    `drawtext=fontfile='${LABEL_FONT}':text='${escapeDrawText(text)}':` +
    `fontcolor=white:fontsize=16:x=8:y=6:box=1:boxcolor=black@0.6:boxborderw=5,` +
    `drawtext=fontfile='${LABEL_FONT}':text='RENDER FAILED':` +
    `fontcolor=#ff6b6b:fontsize=22:x=(w-text_w)/2:y=(h-text_h)/2`;
  const res = spawnSync(
    ffmpeg(),
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=#3a1410:s=${CELL_WIDTH}x${CELL_HEIGHT}:d=1`,
      '-vf',
      drawtext,
      '-frames:v',
      '1',
      dst,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  if (res.status !== 0) {
    throw new Error(`placeholder failed for ${text}: ${res.stderr?.toString() ?? ''}`);
  }
}

/** Tile a row-major sequence of equal-size PNGs into one cols×rows grid PNG. */
function buildGrid(
  seqDir: string,
  cols: number,
  rows: number,
  outPath: string,
  backgroundColor: string,
): void {
  const res = spawnSync(
    ffmpeg(),
    [
      '-y',
      '-framerate',
      '1',
      '-i',
      join(seqDir, 'seq_%03d.png'),
      '-vf',
      `tile=${cols}x${rows}:padding=4:margin=4:color=${backgroundColor}`,
      '-frames:v',
      '1',
      outPath,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  if (res.status !== 0) {
    throw new Error(`tile failed: ${res.stderr?.toString() ?? ''}`);
  }
}

async function main(): Promise<void> {
  if (!existsSync(LABEL_FONT)) {
    throw new Error(`Label font missing: ${LABEL_FONT}`);
  }
  const palettes = parsePaletteArg();

  console.log('Bundling Remotion project…');
  const serveUrl = await bundle({
    entryPoint: join(PROJECT_ROOT, 'src', 'main', 'remotion', 'index.ts'),
    publicDir: join(PROJECT_ROOT, 'resources'),
    webpackOverride: createWebpackOverride(PROJECT_ROOT),
    onProgress: () => undefined,
  });

  console.log(
    `Rendering ${BLOCK_KINDS.length} blocks × ${SKIN_IDS.length} skins × ${palettes.length} palette(s)\n`,
  );

  const failures: string[] = [];

  for (const palette of palettes) {
    const outDir = join(OUT_ROOT, palette.id);
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    const seqDir = join(outDir, '_seq');
    mkdirSync(seqDir, { recursive: true });

    let seqIndex = 0;
    for (const kind of BLOCK_KINDS) {
      for (const skinId of SKIN_IDS) {
        const compositionId = resolveLongformBlockCompositionId(kind, skinId);
        const inputProps = {
          ...SAMPLE_PROPS[kind],
          skinId,
          palette,
          accentColor: palette.accent,
        };
        const stillPath = join(outDir, `${kind}__${skinId}.png`);
        const seqPath = join(seqDir, `seq_${String(seqIndex).padStart(3, '0')}.png`);
        try {
          const composition = await selectComposition({ serveUrl, id: compositionId, inputProps });
          await renderStill({
            serveUrl,
            composition,
            frame: STILL_FRAME,
            scale: STILL_SCALE,
            inputProps,
            output: stillPath,
            imageFormat: 'png',
            overwrite: true,
            chromiumOptions: { gl: 'angle' },
          });
          labelThumb(stillPath, seqPath, `${kind} · ${skinId}`);
          console.log(`  OK   ${palette.id}  ${compositionId}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  FAIL ${palette.id}  ${compositionId}: ${msg}`);
          failures.push(`${palette.id}/${compositionId}: ${msg}`);
          // Always write a same-size cell so the grid sequence stays contiguous
          // (a gap would truncate the whole contact sheet) and the broken combo
          // is visibly flagged in place.
          placeholderCell(seqPath, `${kind} · ${skinId}`);
        }
        seqIndex++;
      }
    }

    const gridPath = join(outDir, '_grid.png');
    buildGrid(seqDir, SKIN_IDS.length, BLOCK_KINDS.length, gridPath, palette.background);
    rmSync(seqDir, { recursive: true, force: true });
    console.log(`\nGrid → ${gridPath}\n`);
  }

  console.log('=== Summary ===');
  console.log(
    `Palettes: ${palettes.map((p) => p.id).join(', ')} | combos/palette: ${BLOCK_KINDS.length * SKIN_IDS.length}`,
  );
  if (failures.length > 0) {
    console.log(`Failures (${failures.length}):`);
    for (const f of failures) console.log(`  ${f}`);
    process.exitCode = 1;
  } else {
    console.log('All combos rendered.');
  }
}

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
