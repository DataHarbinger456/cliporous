/**
 * B-Roll Image → Video Converter
 *
 * Converts a static PNG image into a short video clip with a slow Ken Burns
 * pan/zoom effect. The output video can then be used identically to a Pexels
 * stock footage clip in the existing B-Roll overlay pipeline.
 *
 * This avoids any changes to broll.feature.ts — the existing FFmpeg filter
 * chain works unchanged because it receives a video input, not a static image.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OUTPUT_FPS, OUTPUT_HEIGHT, OUTPUT_WIDTH } from './aspect-ratios';
import { ffmpeg, getVideoMetadata } from './ffmpeg';

/** Round to the nearest even integer (codecs/filters require even dims). */
function roundEven(n: number): number {
  const v = Math.round(n);
  return v % 2 === 0 ? v : v - 1;
}

export interface ImageToVideoOptions {
  /**
   * Preserve the image's native aspect ratio instead of force-filling the
   * locked 1080×1920 canvas. Used by the `floating-card` B-Roll mode, where a
   * landscape screenshot must stay un-squished as a rounded card over the
   * speaker. The output is sized to the image's aspect, capped at OUTPUT_WIDTH.
   */
  preserveAspect?: boolean;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const VIDEO_CACHE_DIR = join(tmpdir(), 'batchcontent-broll-image-video-cache');

function ensureVideoCacheDir(): void {
  if (!existsSync(VIDEO_CACHE_DIR)) {
    mkdirSync(VIDEO_CACHE_DIR, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a static image to a short video clip with a Ken Burns pan/zoom effect.
 *
 * The resulting video is 1080×1920 (locked 9:16) at 30fps, encoded with libx264.
 * A slow zoom-in effect (1.0× → 1.08×) is applied for visual interest.
 *
 * @param imagePath   Absolute path to the source PNG image
 * @param duration    Duration of the output video in seconds (2–6)
 * @param outputPath  Optional output path; if omitted, a cached path is used
 * @returns Absolute path to the output MP4 video
 */
export async function imageToVideoClip(
  imagePath: string,
  duration: number,
  outputPath?: string,
  options: ImageToVideoOptions = {},
): Promise<string> {
  if (!existsSync(imagePath)) {
    throw new Error(`[B-Roll Image] Source image not found: ${imagePath}`);
  }

  ensureVideoCacheDir();

  const preserveAspect = options.preserveAspect === true;
  const cacheTag = preserveAspect ? '-fit' : '';

  // Determine output path (use cache if not specified)
  const dest =
    outputPath ??
    join(
      VIDEO_CACHE_DIR,
      `${createHash('md5').update(`${imagePath}-${duration}${cacheTag}`).digest('hex').slice(0, 16)}.mp4`,
    );

  // Return cached if already exists
  if (existsSync(dest)) {
    console.log(`[B-Roll Image→Video] Cache hit: ${dest}`);
    return dest;
  }

  const fps = OUTPUT_FPS;
  const totalFrames = Math.ceil(duration * fps);

  // Output canvas size. Default: force the locked 1080×1920. preserveAspect:
  // size to the image's native aspect (capped at OUTPUT_WIDTH) so it isn't
  // stretched — required by the floating-card overlay mode.
  let outW = OUTPUT_WIDTH;
  let outH = OUTPUT_HEIGHT;
  if (preserveAspect) {
    try {
      const meta = await getVideoMetadata(imagePath);
      const srcW = meta.width > 0 ? meta.width : OUTPUT_WIDTH;
      const srcH = meta.height > 0 ? meta.height : OUTPUT_HEIGHT;
      outW = roundEven(Math.min(srcW, OUTPUT_WIDTH));
      outH = roundEven((outW * srcH) / srcW);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[B-Roll Image→Video] Probe failed, using locked canvas: ${msg}`);
    }
  }

  // Ken Burns: slow zoom from 1.0× to 1.08× centred on the image
  // zoompan: z starts at 1.0, increases linearly to 1.08 over totalFrames
  // d=1 means each zoompan frame produces 1 output frame
  const zoomFilter = [
    `zoompan=z='1+0.08*on/${totalFrames}'`,
    `d=1`,
    `x='iw/2-(iw/zoom/2)'`,
    `y='ih/2-(ih/zoom/2)'`,
    `s=${outW}x${outH}`,
    `fps=${fps}`,
  ].join(':');

  return new Promise<string>((resolve, reject) => {
    ffmpeg()
      .input(imagePath)
      .loop()
      .inputOptions([`-t ${duration}`])
      .videoFilter(zoomFilter)
      .outputOptions([
        // Static image → short video. CRF 18 keeps the still razor-sharp
        // (it compresses trivially) and the encode is still fast because
        // libx264 ignores temporal coding when every frame is identical.
        '-c:v libx264',
        '-preset veryfast',
        '-crf 18',
        '-pix_fmt yuv420p',
        `-t ${duration}`,
        '-an', // no audio
      ])
      .output(dest)
      .on('error', (err) => {
        console.error(`[B-Roll Image→Video] FFmpeg error:`, err.message);
        reject(new Error(`Failed to convert image to video: ${err.message}`));
      })
      .on('end', () => {
        console.log(`[B-Roll Image→Video] Created ${duration}s clip: ${dest}`);
        resolve(dest);
      })
      .run();
  });
}
