// ---------------------------------------------------------------------------
// HyperFrames overlay feature — composites floating UI overlays onto clips
// ---------------------------------------------------------------------------
//
// This feature renders HTML-based overlay blocks (pop-ups, icon callouts,
// animated labels, progress bars, glowing badges) via HyperFrames and
// composites them onto the rendered clip using FFmpeg's overlay filter.
//
// HyperFrames produces MOV (ProRes 4444 with alpha channel). FFmpeg's
// overlay filter reads the alpha and composites transparently.
//
// This feature runs in the `postProcess` phase — after the base encode and
// after other overlay passes (captions, hook-title, rehook). Overlays are
// additive and don't interfere with the existing render pipeline.
// ---------------------------------------------------------------------------

import { copyFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { RenderFeature, PrepareResult, PostProcessContext } from './feature'
import type { RenderClipJob, RenderBatchOptions } from '../types'
import { renderOverlays } from '../../hyperframes/renderer'
import type { OverlayRequest, OverlayTiming } from '../../hyperframes/types'
import { toFFmpegPath } from '../helpers'
import { ffmpeg as createFfmpeg, getSoftwareEncoder } from '../../ffmpeg'
import { extendEndTimeForLastPoint, type WordTimestamp } from '../point-coverage'
// ---------------------------------------------------------------------------
// Job extension — overlay requests attached by upstream features/handlers
// ---------------------------------------------------------------------------

/**
 * Augment RenderClipJob with HyperFrames overlay requests.
 *
 * The render pipeline attaches these to the job during the IPC handler
 * pre-pass or via the feature's own prepare phase. The feature reads
 * them in postProcess and renders + composites each overlay.
 *
 * Uses module augmentation to avoid modifying the shared types file.
 */
declare module '../types' {
  interface RenderClipJob {
    /**
     * HyperFrames overlay requests for this clip. Each request specifies a
     * catalog block, props, and timing. Rendered to MOV (ProRes 4444 alpha)
     * and composited onto the final clip in the postProcess phase.
     */
    hyperframesOverlays?: OverlayRequest[]
  }
}

// ---------------------------------------------------------------------------
// Feature implementation
// ---------------------------------------------------------------------------

export const hyperframesOverlayFeature: RenderFeature = {
  name: 'hyperframes-overlay',

  async prepare(
    job: RenderClipJob,
    _batchOptions: RenderBatchOptions,
    _onProgress?: (message: string, percent: number) => void
  ): Promise<PrepareResult> {
    // No overlays requested — skip.
    if (!job.hyperframesOverlays || job.hyperframesOverlays.length === 0) {
      return { tempFiles: [], modified: false }
    }

    // Keep multi-item graphics on screen until their last point is spoken.
    const clipEnd = job.endTime - job.startTime
    const words = toClipRelativeWords(job.wordTimestamps, job.startTime)
    for (const request of job.hyperframesOverlays) {
      request.timing = extendOverlayTimingForPoints(request, words, clipEnd)
    }

    console.log(
      `[HyperFrames] Clip ${job.clipId}: ${job.hyperframesOverlays.length} overlay(s) queued`
    )

    return { tempFiles: [], modified: false }
  },

  async postProcess(
    job: RenderClipJob,
    renderedPath: string,
    _context: PostProcessContext
  ): Promise<string> {
    if (!job.hyperframesOverlays || job.hyperframesOverlays.length === 0) {
      return renderedPath
    }

    const startTime = Date.now()
    const tempFiles: string[] = []

    try {
      // Render all overlay blocks to temp MOV files.
      const results = await renderOverlays(job.hyperframesOverlays)

      // Filter out failed renders (empty movPath).
      const validResults = results.filter((r) => r.movPath !== '')
      if (validResults.length === 0) {
        console.warn(
          `[HyperFrames] All overlay renders failed for clip ${job.clipId}, keeping original`
        )
        return renderedPath
      }

      // Composite each overlay onto the clip sequentially.
      // Each overlay is a separate FFmpeg pass to avoid filter_complex
      // complexity explosion (same pattern as overlay-runner.ts).
      let currentPath = renderedPath

      for (let i = 0; i < validResults.length; i++) {
        const result = validResults[i]
        const request = job.hyperframesOverlays[i]
        if (!request) continue

        const overlayOutputPath = join(
          tmpdir(),
          `batchcontent-hf-comp-${job.clipId}-${Date.now()}-${i}.mp4`
        )
        tempFiles.push(overlayOutputPath)

        await compositeOverlay(currentPath, result.movPath, overlayOutputPath, request.timing.start)

        // Clean up the temp MOV after compositing.
        try { unlinkSync(result.movPath) } catch { /* ignore */ }

        // If we produced a new intermediate, clean the previous one.
        if (currentPath !== renderedPath) {
          try { unlinkSync(currentPath) } catch { /* ignore */ }
        }

        currentPath = overlayOutputPath
      }

      // If we produced a new final file, copy it to the original path.
      if (currentPath !== renderedPath) {
        copyFileSync(currentPath, renderedPath)
        try { unlinkSync(currentPath) } catch { /* ignore */ }
      }

      const elapsed = Date.now() - startTime
      console.log(
        `[HyperFrames] Composited ${validResults.length} overlay(s) onto clip ${job.clipId} in ${elapsed}ms`
      )

      return renderedPath
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(
        `[HyperFrames] Overlay compositing failed for clip ${job.clipId}, keeping original:`,
        message
      )
      return renderedPath
    } finally {
      // Clean up any remaining temp files.
      for (const f of tempFiles) {
        try {
          if (existsSync(f) && f !== renderedPath) unlinkSync(f)
        } catch { /* ignore */ }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Point-coverage timing
// ---------------------------------------------------------------------------

/** Prop fields (in priority order) that carry a widget's list of points. */
const ITEM_LIST_FIELDS = [
  'items',
  'words',
  'findings',
  'services',
  'metrics',
  'nodes',
  'bars',
  'rows',
  'steps'
] as const

/** Coerce one list entry (string or object) into its display text. */
function itemToText(entry: unknown): string {
  if (typeof entry === 'string') return entry
  if (entry && typeof entry === 'object') {
    const o = entry as Record<string, unknown>
    const value = o.label ?? o.text ?? o.title ?? o.name ?? o.value
    if (typeof value === 'string') return value
    if (typeof value === 'number') return String(value)
  }
  return ''
}

/**
 * Pull the multi-item text list out of an overlay request's props. Returns the
 * longest list field present (the widget's main content) as plain strings.
 */
export function extractOverlayItemTexts(request: OverlayRequest): string[] {
  const props = request.props as Record<string, unknown>
  let best: string[] = []
  for (const field of ITEM_LIST_FIELDS) {
    const value = props[field]
    if (!Array.isArray(value)) continue
    const texts = value.map(itemToText).filter((t) => t.length > 0)
    if (texts.length > best.length) best = texts
  }
  return best
}

/** Shift source-relative word timestamps into clip-relative seconds. */
function toClipRelativeWords(
  words: WordTimestamp[] | undefined,
  clipStart: number
): WordTimestamp[] | undefined {
  if (!words || words.length === 0) return words
  if (clipStart === 0) return words
  const out: WordTimestamp[] = []
  for (const w of words) {
    const start = w.start - clipStart
    const end = w.end - clipStart
    if (end >= 0) out.push({ text: w.text, start, end })
  }
  return out
}

/**
 * Compute the timing for an overlay request, extending its end time so a
 * multi-item graphic stays visible until its last point has been spoken. The
 * `words` must already be in clip-relative seconds and `clipEnd` is the clip
 * duration. Single-item or unmatched widgets keep their original timing.
 */
export function extendOverlayTimingForPoints(
  request: OverlayRequest,
  words: WordTimestamp[] | undefined,
  clipEnd: number
): OverlayTiming {
  const start = request.timing.start
  const currentEndTime = start + request.timing.duration
  const items = extractOverlayItemTexts(request)
  const newEndTime = extendEndTimeForLastPoint({
    items,
    currentEndTime,
    clipEnd,
    words
  })
  return { start, duration: Math.max(0, newEndTime - start) }
}

// ---------------------------------------------------------------------------
// FFmpeg overlay compositing
// ---------------------------------------------------------------------------

/**
 * Composite a ProRes 4444 MOV (with alpha) onto the base video at a specific
 * time offset using FFmpeg's overlay filter.
 *
 * The overlay stream is PTS-shifted by `startTime` so it appears at the
 * correct position on the base video's timeline. The MOV's own length
 * constrains how long it stays visible.
 */
function compositeOverlay(
  basePath: string,
  overlayMovPath: string,
  outputPath: string,
  startTime: number
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const { encoder, presetFlag } = getSoftwareEncoder({ crf: 18, preset: 'medium' })

    const cmd = createFfmpeg(toFFmpegPath(basePath))
    cmd.input(toFFmpegPath(overlayMovPath))

    // Shift the overlay PTS so it appears at startTime on the base timeline.
    // format=auto lets FFmpeg pick the right pixel format for compositing.
    // eof_action=pass lets the base video continue after the overlay ends.
    const ptsOffset = startTime.toFixed(3)
    const filterComplex =
      `[1:v]setpts=PTS+${ptsOffset}/TB[ovr];` +
      `[0:v][ovr]overlay=0:0:format=auto:eof_action=pass[outv]`

    cmd
      .outputOptions([
        '-filter_complex',
        filterComplex,
        '-map',
        '[outv]',
        '-map',
        '0:a?',
        '-c:v',
        encoder,
        ...presetFlag,
        '-c:a',
        'copy',
        '-movflags',
        '+faststart',
        '-y'
      ])
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .save(toFFmpegPath(outputPath))
  })
}
