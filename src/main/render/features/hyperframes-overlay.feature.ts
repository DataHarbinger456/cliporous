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
import {
  buildCardContent,
  type CardContent,
  type CardKind,
  type CardWord
} from '../../hyperframes/card-content'
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
    batchOptions: RenderBatchOptions,
    _onProgress?: (message: string, percent: number) => void
  ): Promise<PrepareResult> {
    // No overlays requested — skip.
    if (!job.hyperframesOverlays || job.hyperframesOverlays.length === 0) {
      return { tempFiles: [], modified: false }
    }

    const clipEnd = job.endTime - job.startTime
    const words = toClipRelativeWords(job.wordTimestamps, job.startTime)

    // Fill PRESTYJ delos-* cards with transcript-derived content so their
    // on-screen text matches what the speaker says in the card's window. This
    // runs BEFORE timing extension so the spoken-point timing helper below sees
    // the transcript-derived findings/services/metrics (not the preset stubs).
    for (const request of job.hyperframesOverlays) {
      await populateDelosCardContent(request, words, batchOptions.geminiApiKey)
    }

    // Keep multi-item graphics on screen until their last point is spoken.
    // Reuses extendEndTimeForLastPoint (the 'spoken points' timing helper).
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
// PRESTYJ delos-* card content injection
// ---------------------------------------------------------------------------
//
// delos-* cards render structured text (findings, services, metrics, …) that
// should reflect what the speaker says while the card is on screen. We slice
// the clip-relative word timestamps to the card's display window, ask
// buildCardContent to distil that window into the card's slots, and merge the
// result into the request's props BEFORE render. Decorative slots already on
// the request (accentColor, position/yPos, timing) are preserved — only the
// text/data slots are filled.
// ---------------------------------------------------------------------------

/** Every delos-* card kind buildCardContent knows how to populate. */
const DELOS_CARD_KINDS = new Set<CardKind>([
  'delos-scan-result',
  'delos-alert',
  'delos-console',
  'delos-matrix',
  'delos-system-diagnostics',
  'delos-tracking-map',
  'delos-biometric'
])

/** True when an overlay block is a delos-* card buildCardContent supports. */
function isDelosCardKind(block: string): block is CardKind {
  return DELOS_CARD_KINDS.has(block as CardKind)
}

/** Words (clip-relative) whose span overlaps the [start, end] window. */
function sliceWordsToWindow(
  words: WordTimestamp[] | undefined,
  start: number,
  end: number
): CardWord[] {
  if (!words || words.length === 0) return []
  const out: CardWord[] = []
  for (const w of words) {
    if (w.end > start && w.start < end) {
      out.push({ text: w.text, start: w.start, end: w.end })
    }
  }
  return out
}

/** Strip the discriminant so only the card's text/data slots remain. */
function cardContentToSlots(content: CardContent): Record<string, unknown> {
  const { kind: _kind, ...slots } = content
  return slots
}

/** True when at least one slot carries real, non-empty content. */
function hasMeaningfulContent(slots: Record<string, unknown>): boolean {
  return Object.values(slots).some((v) => {
    if (Array.isArray(v)) return v.length > 0
    if (typeof v === 'string') return v.trim().length > 0
    return v != null
  })
}

/**
 * Populate a single delos-* card request's props from the transcript window it
 * covers. No-op for non-delos blocks. Fail-safe: on any error or empty build the
 * request keeps its existing preset-default props (no empty cards, no crash).
 */
export async function populateDelosCardContent(
  request: OverlayRequest,
  words: WordTimestamp[] | undefined,
  apiKey?: string
): Promise<void> {
  if (!isDelosCardKind(request.block)) return

  const kind = request.block
  const winStart = request.timing.start
  const winEnd = winStart + request.timing.duration
  const windowWords = sliceWordsToWindow(words, winStart, winEnd)

  // No narration inside the card's window — keep the preset defaults.
  if (windowWords.length === 0) return

  const windowText = windowWords.map((w) => w.text).join(' ')

  try {
    const content = await buildCardContent(
      kind,
      windowText,
      windowWords,
      apiKey ? { apiKey } : {}
    )
    const slots = cardContentToSlots(content)
    if (!hasMeaningfulContent(slots)) {
      console.warn(
        `[HyperFrames] Card content for ${kind} was empty, keeping preset defaults`
      )
      return
    }
    // Merge only the text/data slots; accentColor/position/timing untouched.
    Object.assign(request.props as Record<string, unknown>, slots)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(
      `[HyperFrames] buildCardContent failed for ${kind}, keeping preset defaults: ${message}`
    )
  }
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
