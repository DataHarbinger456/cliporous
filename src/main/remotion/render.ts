/**
 * Headless render wrapper around @remotion/renderer.
 *
 * The bundle is created lazily on first call and cached in-process — bundling
 * takes ~3–8s and is identical across renders. Subsequent renders reuse the
 * bundle and only re-launch the headless browser tab.
 *
 * Output: ProRes 4444 .mov with alpha when `transparent: true`, otherwise
 * H.264 .mp4. Segment-render uses the ProRes/.mov path so the result composites
 * cleanly into the FFmpeg timeline.
 */

import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { app } from 'electron';
import { createWebpackOverride } from './webpack-override';

let bundlePromise: Promise<string> | null = null;

/**
 * Resolve the Remotion entry point.
 *
 * Remotion's `bundle()` compiles the composition TREE from SOURCE via its own
 * webpack pass, so it needs the original `src/main/remotion/index.ts` — NOT the
 * electron-vite-compiled `out/main/index.js`. Using `__dirname` here is wrong:
 * at runtime `__dirname` is `out/main`, which produced the bogus path
 * `out/main/index` (ENOENT).
 *
 * `app.getAppPath()` returns the project root in dev and the app root
 * (resources/app[.asar]) when packaged, so the source tree is resolved
 * consistently relative to it.
 */
function resolveRemotionEntry(): string {
  const appPath = app.getAppPath();
  const candidates = [
    join(appPath, 'src', 'main', 'remotion', 'index.ts'),
    join(appPath, 'src', 'main', 'remotion', 'index.tsx'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  // Fall back to the first candidate so the error surfaces a real, expected
  // path instead of a misleading compiled-output location.
  return candidates[0];
}

/**
 * Resolve the directory that `staticFile('fonts/...')` should serve from.
 *
 * `Config.setPublicDir('./resources')` in `remotion.config.ts` ONLY configures
 * the Remotion CLI / Studio — the programmatic `bundle()` API ignores it and
 * defaults to a `public/` folder beside the entry point (which does not exist
 * here). Without an explicit `publicDir`, `staticFile('fonts/Geist-Bold.ttf')`
 * resolves to a URL the headless Chromium can't fetch, so `document.fonts.load()`
 * rejects with a NetworkError and aborts the whole clip render.
 *
 * The directory we want is the one whose child `fonts/` holds the bundled TTFs:
 *   - dev:      `<appPath>/resources`            (repo `resources/fonts/`)
 *   - packaged: `process.resourcesPath`          (extraResources copies
 *               `resources/fonts` → `<resourcesPath>/fonts`)
 */
function resolveRemotionPublicDir(): string {
  const candidates = [join(app.getAppPath(), 'resources'), process.resourcesPath].filter(
    (p): p is string => Boolean(p),
  );
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'fonts'))) return candidate;
  }
  return candidates[0] ?? join(app.getAppPath(), 'resources');
}

async function getBundle(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: resolveRemotionEntry(),
      // Match the Studio/preview webpack config so headless renders are styled
      // identically: enable Tailwind + resolve the `@` shadcn alias. The alias
      // root is the app path (project root in dev, asar root when packaged),
      // which is where the bundled `src/` tree lives.
      webpackOverride: createWebpackOverride(app.getAppPath()),
      // The programmatic bundler does NOT read `Config.setPublicDir` from
      // remotion.config.ts — pass it explicitly so the bundled fonts under
      // `resources/fonts/` are served and `staticFile('fonts/...')` resolves
      // during a headless render (not just in Studio).
      publicDir: resolveRemotionPublicDir(),
      onProgress: () => undefined,
    });
  }
  return bundlePromise;
}

export interface RenderRemotionOptions {
  compositionId: string;
  inputProps: Record<string, unknown>;
  /** Duration in seconds. Composition's durationInFrames is overridden. */
  durationSec: number;
  fps: number;
  width: number;
  height: number;
  /** When true, output is ProRes 4444 .mov with alpha. */
  transparent?: boolean;
  /**
   * Output file path. Extension drives format: .mov for transparent, .mp4
   * otherwise. If omitted, a temp path is generated.
   */
  outputPath?: string;
  /**
   * Per-frame render progress callback (RF-006). Receives a 0–1 fraction from
   * Remotion's `renderMedia` so callers can advance a progress bar smoothly
   * during long block renders instead of freezing until the segment finishes.
   */
  onProgress?: ((progress: number) => void) | undefined;
}

export async function renderRemotionSegment(opts: RenderRemotionOptions): Promise<string> {
  const serveUrl = await getBundle();

  const composition = await selectComposition({
    serveUrl,
    id: opts.compositionId,
    inputProps: opts.inputProps,
  });

  const durationInFrames = Math.max(1, Math.round(opts.durationSec * opts.fps));
  const outPath =
    opts.outputPath ??
    join(
      mkdtempSync(join(tmpdir(), 'remotion-seg-')),
      `${opts.compositionId}.${opts.transparent ? 'mov' : 'mp4'}`,
    );

  await renderMedia({
    serveUrl,
    composition: {
      ...composition,
      durationInFrames,
      fps: opts.fps,
      width: opts.width,
      height: opts.height,
    },
    codec: opts.transparent ? 'prores' : 'h264',
    proResProfile: opts.transparent ? '4444' : undefined,
    // ProRes defaults to yuv420p (no alpha). Without an alpha-carrying pixel
    // format the "transparent" areas bake to black and composite as a black
    // screen behind the overlay. yuva444p10le is the alpha-capable ProRes 4444
    // format; paired with the PNG image format this preserves the alpha channel.
    pixelFormat: opts.transparent ? 'yuva444p10le' : undefined,
    outputLocation: outPath,
    inputProps: opts.inputProps,
    imageFormat: 'png',
    chromiumOptions: { gl: 'angle' },
    // Forward Remotion's per-frame progress (0..1) so block segments advance
    // the render bar smoothly rather than stalling for the whole encode. The
    // wrapper is always defined (no-ops via optional chaining when the caller
    // passed nothing) to stay clean under exactOptionalPropertyTypes.
    onProgress: ({ progress }) => opts.onProgress?.(progress),
  });

  return outPath;
}
