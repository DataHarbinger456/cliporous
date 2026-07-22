import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { setupFFmpeg } from '../../src/main/ffmpeg';
import { renderLongformVideo } from '../../src/main/render/longform-pipeline';
import type { RenderBatchOptions } from '../../src/main/render/types';
import type { LongformRenderReconciliation } from '../../src/shared/types';

const ROOT = resolve(__dirname, '../..');
const ARTIFACT_DIR = resolve(ROOT, '.gg/longform-render-smoke');
const OUTPUT_DIR = resolve(ARTIFACT_DIR, 'output');
const SOURCE_PATH = resolve(ARTIFACT_DIR, 'smoke-source.mp4');
const OUTPUT_PATH = resolve(OUTPUT_DIR, 'smoke-source_longform.mp4');
const WIDTH = 1920;
const HEIGHT = 1080;
const FRAME_BYTES = WIDTH * HEIGHT * 3;

interface SentEvent {
  channel: string;
  payload: Record<string, unknown>;
}

function run(command: string, args: string[], maxBuffer = 16 * 1024 * 1024): Buffer {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: null, maxBuffer });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status}): ${result.stderr?.toString('utf8') ?? 'unknown error'}`,
    );
  }
  return result.stdout ?? Buffer.alloc(0);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createSourceFixture(): void {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  run('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=0x365577:s=${WIDTH}x${HEIGHT}:r=30:d=13`,
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=330:sample_rate=48000:duration=13',
    '-shortest',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    SOURCE_PATH,
  ]);
}

function readFrame(time: number, screenshotName: string): Buffer {
  const screenshotPath = resolve(ARTIFACT_DIR, screenshotName);
  run('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    String(time),
    '-i',
    OUTPUT_PATH,
    '-frames:v',
    '1',
    screenshotPath,
  ]);

  const raw = run(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      String(time),
      '-i',
      OUTPUT_PATH,
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1',
    ],
    FRAME_BYTES + 1024,
  );
  assert(raw.length === FRAME_BYTES, `Expected ${FRAME_BYTES} frame bytes, got ${raw.length}`);
  return raw;
}

function changedPixels(reference: Buffer, candidate: Buffer, threshold = 24): number {
  let changed = 0;
  for (let offset = 0; offset < reference.length; offset += 3) {
    const red = Math.abs((reference[offset] ?? 0) - (candidate[offset] ?? 0));
    const green = Math.abs((reference[offset + 1] ?? 0) - (candidate[offset + 1] ?? 0));
    const blue = Math.abs((reference[offset + 2] ?? 0) - (candidate[offset + 2] ?? 0));
    if (Math.max(red, green, blue) > threshold) changed++;
  }
  return changed;
}

async function main(): Promise<void> {
  createSourceFixture();
  setupFFmpeg();

  const events: SentEvent[] = [];
  const window = {
    webContents: {
      send: (channel: string, payload: Record<string, unknown>) => {
        events.push({ channel, payload });
        if ('error' in payload || 'reconciliation' in payload || 'message' in payload) {
          console.log(`[longform-smoke] ${channel}`, JSON.stringify(payload));
        }
      },
    },
  };

  const words = Array.from({ length: 26 }, (_, index) => ({
    text: `word${index + 1}`,
    start: index * 0.5,
    end: index * 0.5 + 0.42,
  }));

  const options: RenderBatchOptions = {
    jobs: [
      {
        clipId: 'longform-smoke',
        sourceVideoPath: SOURCE_PATH,
        startTime: 0,
        endTime: 13,
        wordTimestamps: words,
      },
    ],
    outputDirectory: OUTPUT_DIR,
    outputProfile: 'longform',
    longformSkinId: 'ezcoder',
    longformPaletteId: 'batchclip',
    longformEditPlan: {
      phrases: [
        {
          text: 'PHRASE EDIT APPLIED',
          startTime: 5,
          endTime: 6.2,
          accentColor: '#9f75ff',
        },
      ],
      blocks: [
        {
          kind: 'stat-hero',
          startTime: 1,
          endTime: 4,
          kicker: 'LONGFORM PROOF',
          heading: 'Content block applied',
          value: 100,
          suffix: '%',
          label: 'RENDERED',
          accentColor: '#9f75ff',
        },
      ],
      cards: [
        {
          kind: 'delos-console',
          startTime: 7,
          endTime: 10,
          sourceText: 'The evidence card render is active and visible.',
        },
      ],
      reasoning: 'End-to-end longform render smoke fixture.',
      generatedAt: Date.now(),
    },
    sourceMeta: { name: 'smoke-source.mp4', path: SOURCE_PATH, duration: 13 },
    renderQuality: {
      preset: 'draft',
      customCrf: 26,
      outputResolution: '1080x1920',
      outputFormat: 'mp4',
      encodingPreset: 'ultrafast',
    },
  };

  await renderLongformVideo(options, window as never);

  const errorEvent = events.find((event) => 'error' in event.payload);
  assert(!errorEvent, `Longform emitted an error: ${JSON.stringify(errorEvent?.payload)}`);
  const doneEvent = events.find((event) => 'reconciliation' in event.payload);
  assert(doneEvent, 'Longform never emitted a completed reconciliation');
  const reconciliation = doneEvent.payload.reconciliation as LongformRenderReconciliation;

  assert(
    reconciliation.blocks.rendered === 1,
    `Block render count: ${reconciliation.blocks.rendered}`,
  );
  assert(
    reconciliation.phrases.rendered === 1,
    `Phrase render count: ${reconciliation.phrases.rendered}`,
  );
  assert(
    reconciliation.cards.rendered === 1,
    `Card render count: ${reconciliation.cards.rendered}`,
  );
  const visualFallbacks = reconciliation.fallbacks.filter(
    (fallback) => !fallback.reason.includes('transcript-derived text'),
  );
  assert(
    visualFallbacks.length === 0,
    `Unexpected visual fallbacks: ${JSON.stringify(visualFallbacks)}`,
  );
  assert(existsSync(OUTPUT_PATH), `Missing output: ${OUTPUT_PATH}`);
  assert(statSync(OUTPUT_PATH).size > 100_000, 'Longform output is unexpectedly small');

  const speakerFrame = readFrame(12, 'speaker.png');
  const blockFrame = readFrame(2.5, 'block.png');
  const phraseFrame = readFrame(5.7, 'phrase.png');
  const cardFrame = readFrame(8.2, 'card.png');
  const blockPixels = changedPixels(speakerFrame, blockFrame);
  const phrasePixels = changedPixels(speakerFrame, phraseFrame);
  const cardPixels = changedPixels(speakerFrame, cardFrame);

  assert(blockPixels > 500_000, `Block frame changed only ${blockPixels} pixels`);
  assert(phrasePixels > 1_000, `Phrase frame changed only ${phrasePixels} pixels`);
  assert(cardPixels > 10_000, `Card frame changed only ${cardPixels} pixels`);

  console.log(
    `[longform-smoke] PASS blocks=1 phrases=1 cards=1 ` +
      `changedPixels(block=${blockPixels}, phrase=${phrasePixels}, card=${cardPixels})`,
  );
  console.log(`[longform-smoke] output=${OUTPUT_PATH}`);
}

void main().catch((error) => {
  console.error('[longform-smoke] FAIL', error);
  process.exitCode = 1;
});
