// ---------------------------------------------------------------------------
// Long-form (16:9) render orchestrator — Hormozi-style talking head.
//
// Entry point for `outputProfile === 'longform'`. Builds a segment timeline
// from the AI edit plan, pre-renders skinned content blocks via Remotion,
// encodes speaker blocks through the landscape layout, concatenates
// everything, then composites phrase-emphasis overlays in a final pass.
//
// This path is fully independent of the 9:16 feature pipeline so the locked
// short-form output stays byte-identical.
// ---------------------------------------------------------------------------

import { BrowserWindow } from 'electron'
import { Ch } from '@shared/ipc-channels'
import { basename, extname, join } from 'path'
import { tmpdir } from 'os'
import { existsSync, mkdirSync, writeFileSync, unlinkSync, copyFileSync } from 'fs'

import { ffmpeg, getEncoder, getVideoMetadata, isHardwareEncoder } from '../ffmpeg'
import {
  LANDSCAPE_WIDTH,
  LANDSCAPE_HEIGHT,
  LANDSCAPE_FPS
} from '../aspect-ratios'
import { getEditStyleById } from '../edit-styles/index'
import { LONGFORM_TEMPLATES } from '../edit-styles/index'
import { buildLongformLayout } from '../layouts/longform-layouts'
import { buildDriftZoom, buildSnapZoom } from '../zoom-filters'
import { buildEditStyleColorGradeFilter } from './color-grade-filter'
import { resolveQualityParams } from './quality'
import { classifyRenderError } from './render-error-map'
import { toFFmpegPath } from './helpers'
import { encodeSpeakerSegment } from './longform-encode'
import { renderBlockSegment, extendBlockPlacementEndTime } from './features/blocks.feature'
import type { WordTimestamp } from './point-coverage'
import { DEFAULT_LONGFORM_BLOCK_SKIN } from '../remotion/registry'
import { getPaletteById } from '@shared/palettes'
import {
  applyPhraseOverlays,
  cleanupPhraseOverlayTempFiles
} from './features/phrase-emphasis.feature'
import {
  applyDelosCards,
  filterCardsToSpeakerRanges,
  type DelosCardStats
} from './features/delos-card.feature'

import type { RenderBatchOptions } from './types'
import type {
  LongformEditPlan,
  PhraseEmphasis,
  BlockPlacement
} from '@shared/types'

const HORMOZI_STYLE_ID = 'hormozi'

// ---------------------------------------------------------------------------
// Timeline model
// ---------------------------------------------------------------------------

interface SpeakerBlock {
  kind: 'speaker'
  startTime: number
  endTime: number
}

interface BlockBlock {
  kind: 'block'
  startTime: number
  endTime: number
  placement: BlockPlacement
}

type TimelineBlock = SpeakerBlock | BlockBlock

const MIN_BLOCK_SECONDS = 0.4

/**
 * Minimum SPEAKER time (seconds) required between the END of one content block
 * and the START of the next. Guarantees the speaker is visible — and the prior
 * block has time to breathe — before another full-frame insert lands, so blocks
 * never read as back-to-back. Inserts that start sooner than this after the
 * previous accepted block ends are dropped (the earlier block wins).
 *
 * This is the BODY pace (after the intro). Roughly one block per ~8–10s of
 * speech once a block's own ~3–4s span is added.
 */
export const MIN_GAP_BETWEEN_BLOCKS = 6

/**
 * Length of the opening "hook" window where blocks land more frequently. The
 * first impression decides whether a viewer stays, so the intro runs at a
 * quicker visual cadence than the body, then settles into MIN_GAP_BETWEEN_BLOCKS.
 */
export const INTRO_SECONDS = 60

/**
 * Tighter speaker gap applied while a block STARTS inside the intro window —
 * a new block roughly every ~5s of speech to keep the open engaging. With a
 * typical ~3–4s block span this 1.5s speaker gap puts block STARTS ~5s apart,
 * so the first 30s can host ~6 beats instead of ~2. After INTRO_SECONDS the
 * gap relaxes to MIN_GAP_BETWEEN_BLOCKS.
 */
export const INTRO_GAP_BETWEEN_BLOCKS = 1.5

/**
 * Build a non-overlapping, chronological timeline. Content blocks are inserts
 * that replace the speaker visual for their range; speaker blocks fill every
 * gap. Overlapping inserts are dropped (first one wins), and inserts that start
 * within `minGapBetweenBlocks` of the previous accepted block's end are dropped
 * too so blocks stay spaced out.
 */
export function buildTimeline(
  plan: LongformEditPlan,
  videoDuration: number,
  minGapBetweenBlocks: number = MIN_GAP_BETWEEN_BLOCKS,
  introGapBetweenBlocks: number = INTRO_GAP_BETWEEN_BLOCKS,
  introSeconds: number = INTRO_SECONDS,
  words?: WordTimestamp[]
): TimelineBlock[] {
  type Insert = BlockBlock
  const inserts: Insert[] = []

  for (const placement of plan.blocks ?? []) {
    // Keep multi-row list blocks on screen until the last row is spoken. The
    // overlap/spacing pass below still protects against collisions, so this
    // only ever shortens the gap to the next block, never overlaps it.
    const endTime = extendBlockPlacementEndTime(placement, words, videoDuration)
    inserts.push({
      kind: 'block',
      startTime: placement.startTime,
      endTime,
      placement: { ...placement, endTime }
    })
  }

  inserts.sort((a, b) => a.startTime - b.startTime)

  // Drop overlaps + too-close inserts, clamp to [0, videoDuration].
  const accepted: Insert[] = []
  let lastEnd = 0
  let haveAccepted = false
  for (const ins of inserts) {
    const start = Math.max(0, ins.startTime)
    const end = Math.min(videoDuration, ins.endTime)
    if (end - start < MIN_BLOCK_SECONDS) continue
    if (start < lastEnd) continue // overlaps a prior insert — skip
    // Enforce breathing room: require a minimum of speaker time between the
    // previous accepted block's end and this one's start. The intro window runs
    // a tighter gap so the open is more visually engaging, then relaxes.
    const requiredGap = start < introSeconds ? introGapBetweenBlocks : minGapBetweenBlocks
    if (haveAccepted && start - lastEnd < requiredGap) continue
    accepted.push({ ...ins, startTime: start, endTime: end })
    lastEnd = end
    haveAccepted = true
  }

  const timeline: TimelineBlock[] = []
  let cursor = 0
  for (const ins of accepted) {
    if (ins.startTime - cursor >= MIN_BLOCK_SECONDS) {
      timeline.push({ kind: 'speaker', startTime: cursor, endTime: ins.startTime })
    }
    timeline.push(ins)
    cursor = ins.endTime
  }
  if (videoDuration - cursor >= MIN_BLOCK_SECONDS) {
    timeline.push({ kind: 'speaker', startTime: cursor, endTime: videoDuration })
  }

  // Fallback: no inserts at all → one speaker block spanning the whole video.
  if (timeline.length === 0) {
    timeline.push({ kind: 'speaker', startTime: 0, endTime: videoDuration })
  }

  return timeline
}

// ---------------------------------------------------------------------------
// Concat (demuxer, stream copy)
// ---------------------------------------------------------------------------

function concatSegments(segmentFiles: string[], outputPath: string): Promise<void> {
  const listFile = join(tmpdir(), `batchcontent-lf-list-${Date.now()}.txt`)
  const listContent = segmentFiles
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n')
  writeFileSync(listFile, listContent, 'utf-8')

  return new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(listFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy', '-movflags', '+faststart', '-y'])
      .on('end', () => {
        try {
          unlinkSync(listFile)
        } catch {
          /* ignore */
        }
        resolve()
      })
      .on('error', (err: Error) => {
        try {
          unlinkSync(listFile)
        } catch {
          /* ignore */
        }
        reject(err)
      })
      .save(toFFmpegPath(outputPath))
  })
}

// ---------------------------------------------------------------------------
// Speaker zoom — snap to overlapping phrase beats, else gentle drift.
// ---------------------------------------------------------------------------

function buildSpeakerZoom(
  block: SpeakerBlock,
  intensity: number,
  style: 'none' | 'drift' | 'snap' | 'word-pulse' | 'zoom-out',
  phrases: PhraseEmphasis[]
): string {
  if (style === 'none' || intensity <= 1.001) return ''
  const duration = block.endTime - block.startTime

  if (style === 'snap') {
    const local = phrases
      .filter((p) => p.endTime > block.startTime && p.startTime < block.endTime)
      .map((p) => {
        const cs = Math.max(p.startTime, block.startTime)
        const ce = Math.min(p.endTime, block.endTime)
        return { time: cs - block.startTime, duration: ce - cs }
      })
    if (local.length > 0) {
      return buildSnapZoom({
        width: LANDSCAPE_WIDTH,
        height: LANDSCAPE_HEIGHT,
        fps: LANDSCAPE_FPS,
        duration,
        zoomIntensity: intensity,
        startTime: 0,
        emphasisTimestamps: local
      })
    }
  }

  return buildDriftZoom({
    width: LANDSCAPE_WIDTH,
    height: LANDSCAPE_HEIGHT,
    fps: LANDSCAPE_FPS,
    duration,
    zoomIntensity: intensity,
    startTime: 0
  })
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Render a long-form (16:9) Hormozi-style video. Expects exactly one job in
 * `options.jobs` (the full source video) and `options.longformEditPlan`.
 */
export async function renderLongformVideo(
  options: RenderBatchOptions,
  window: BrowserWindow
): Promise<void> {
  const { jobs, outputDirectory } = options
  const job = jobs[0]

  if (!existsSync(outputDirectory)) {
    mkdirSync(outputDirectory, { recursive: true })
  }

  const sendError = (message: string): void => {
    const classified = classifyRenderError(message)
    window.webContents.send(Ch.Send.RENDER_CLIP_ERROR, {
      clipId: job?.clipId ?? 'longform',
      error: classified.message,
      suggestion: classified.suggestion,
      details: classified.details
    })
    window.webContents.send(Ch.Send.RENDER_BATCH_DONE, { completed: 0, failed: 1, total: 1 })
  }

  if (!job) {
    sendError('Long-form render requires a source job.')
    return
  }
  const plan = options.longformEditPlan
  if (!plan) {
    sendError('Long-form render requires a longformEditPlan.')
    return
  }

  const qualityParams = resolveQualityParams(options.renderQuality)
  const encoder = getEncoder(qualityParams)
  const encoderIsHardware = isHardwareEncoder(encoder.encoder)

  window.webContents.send(Ch.Send.RENDER_CLIP_START, {
    clipId: job.clipId,
    index: 0,
    total: 1,
    encoder: encoder.encoder,
    encoderIsHardware
  })

  const tempFiles: string[] = []

  try {
    const meta = await getVideoMetadata(job.sourceVideoPath)
    const videoDuration =
      job.endTime > job.startTime ? job.endTime : meta.duration

    const editStyle = getEditStyleById(HORMOZI_STYLE_ID)
    const speakerTemplate = LONGFORM_TEMPLATES[HORMOZI_STYLE_ID]?.speaker
    const zoomStyle = speakerTemplate?.zoomStyle ?? 'snap'
    const zoomIntensity = speakerTemplate?.zoomIntensity ?? 1.12
    const colorGradeFilter = editStyle?.colorGrade
      ? buildEditStyleColorGradeFilter(editStyle.colorGrade)
      : null

    // Resolve the chosen skin + palette once for every content block.
    const skinId = options.longformSkinId ?? options.longformSkin ?? DEFAULT_LONGFORM_BLOCK_SKIN
    const palette = getPaletteById(options.longformPaletteId, options.customPalettes)

    const timeline = buildTimeline(
      plan,
      videoDuration,
      MIN_GAP_BETWEEN_BLOCKS,
      INTRO_GAP_BETWEEN_BLOCKS,
      INTRO_SECONDS,
      job.wordTimestamps
    )

    window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
      clipId: job.clipId,
      message: `Planning ${timeline.length} long-form segment(s)…`,
      percent: 5
    })

    // Encode a speaker segment for an arbitrary [startTime, endTime] range,
    // applying the same landscape layout + zoom/grade used for real speaker
    // blocks. Reused as the graceful fallback when a content block fails to
    // render: substituting the underlying speaker shot keeps the concat
    // timeline gap-free (every segment still maps 1:1 onto source time).
    const encodeSpeakerForRange = async (
      startTime: number,
      endTime: number,
      index: number,
      onProgress?: ((percent: number) => void) | undefined
    ): Promise<string> => {
      const duration = endTime - startTime
      const layout = buildLongformLayout('speaker', {
        width: LANDSCAPE_WIDTH,
        height: LANDSCAPE_HEIGHT,
        segmentDuration: duration,
        fps: LANDSCAPE_FPS,
        sourceWidth: meta.width,
        sourceHeight: meta.height,
        cropRect: job.cropRegion
      })
      const zoomFilter = buildSpeakerZoom(
        { kind: 'speaker', startTime, endTime },
        zoomIntensity,
        zoomStyle,
        plan.phrases
      )
      const extraFilters = [zoomFilter, colorGradeFilter ?? ''].filter(Boolean)
      const out = join(tmpdir(), `batchcontent-lf-speaker-${Date.now()}-${index}.mp4`)
      await encodeSpeakerSegment({
        sourceVideoPath: job.sourceVideoPath,
        outputPath: out,
        startTime,
        duration,
        fps: LANDSCAPE_FPS,
        layout,
        extraFilters,
        onProgress
      })
      return out
    }

    // ── Encode every timeline block to a normalized segment ────────────────
    const segmentFiles: string[] = []
    let droppedBlocks = 0
    for (let i = 0; i < timeline.length; i++) {
      const block = timeline[i]
      // Each segment owns the progress band [base, nextBase]; per-segment
      // progress (0–100) maps into it so the bar advances smoothly mid-encode
      // instead of jumping once per segment (RF-006).
      const base = 5 + Math.round((i / timeline.length) * 65) // 5 → 70%
      const nextBase = 5 + Math.round(((i + 1) / timeline.length) * 65)
      const emitSegmentProgress = (pct: number): void => {
        const clamped = Math.max(0, Math.min(100, pct))
        const mapped = Math.round(base + (clamped / 100) * (nextBase - base))
        window.webContents.send(Ch.Send.RENDER_CLIP_PROGRESS, {
          clipId: job.clipId,
          percent: mapped
        })
      }

      if (block.kind === 'speaker') {
        window.webContents.send(Ch.Send.RENDER_CLIP_PROGRESS, { clipId: job.clipId, percent: base })
        const out = await encodeSpeakerForRange(
          block.startTime,
          block.endTime,
          i,
          emitSegmentProgress
        )
        segmentFiles.push(out)
        tempFiles.push(out)
      } else {
        window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
          clipId: job.clipId,
          message: `Rendering ${block.placement.kind} block…`,
          percent: base
        })
        try {
          const out = await renderBlockSegment({
            placement: block.placement,
            skinId,
            palette,
            sourceVideoPath: job.sourceVideoPath,
            width: LANDSCAPE_WIDTH,
            height: LANDSCAPE_HEIGHT,
            fps: LANDSCAPE_FPS,
            onProgress: emitSegmentProgress
          })
          segmentFiles.push(out)
          tempFiles.push(out)
        } catch (err) {
          // Graceful degrade (RF-003): a single content-block render failure
          // must not kill the whole long-form render. Fall back to the plain
          // speaker shot for this block's exact range so the timeline stays
          // gap-free, and keep going.
          const message = err instanceof Error ? err.message : String(err)
          console.warn(
            `[longform] Block render failed (${block.placement.kind}); ` +
              `substituting speaker shot for ${block.startTime}s–${block.endTime}s: ${message}`
          )
          droppedBlocks++
          const out = await encodeSpeakerForRange(
            block.startTime,
            block.endTime,
            i,
            emitSegmentProgress
          )
          segmentFiles.push(out)
          tempFiles.push(out)
        }
      }
    }

    if (segmentFiles.length === 0) {
      throw new Error('Long-form timeline produced no segments.')
    }

    if (droppedBlocks > 0) {
      console.warn(
        `[longform] ${droppedBlocks} content block(s) failed to render and were ` +
          `replaced by the underlying speaker shot; the final video is gap-free.`
      )
    }

    // ── Concat ─────────────────────────────────────────────────────────────
    window.webContents.send(Ch.Send.RENDER_CLIP_PROGRESS, { clipId: job.clipId, percent: 72 })
    const concatPath = join(tmpdir(), `batchcontent-lf-concat-${Date.now()}.mp4`)
    tempFiles.push(concatPath)
    await concatSegments(segmentFiles, concatPath)

    // ── Phrase overlay pass ──────────────────────────────────────────────────
    const sourceName = options.sourceMeta?.name
      ? basename(options.sourceMeta.name, extname(options.sourceMeta.name))
      : basename(job.sourceVideoPath, extname(job.sourceVideoPath))
    const outputPath = join(outputDirectory, `${sourceName}_longform.mp4`)

    // Phrases map directly onto the concatenated timeline (every block preserves
    // source-time audio 1:1, so concat time == absolute source time — no remap).
    // Keep only phrases that begin inside a SPEAKER block: a phrase composited
    // over a full-frame content block would obscure it and read as a bug, since
    // phrase overlays are meant to float over the speaker.
    const speakerRanges = timeline
      .filter((b): b is SpeakerBlock => b.kind === 'speaker')
      .map((b) => ({ start: b.startTime, end: b.endTime }))
    const inSpeakerBlock = (t: number): boolean =>
      speakerRanges.some((r) => t >= r.start && t < r.end)
    const phrases = plan.phrases.filter(
      (p) => p.endTime > p.startTime && p.startTime < videoDuration && inSpeakerBlock(p.startTime)
    )

    // ── Delos pop-up cards ───────────────────────────────────────────────────
    // Candidates from the plan, gated to SPEAKER time so a pop-up never lands
    // on top of a full-frame content block (this is the single source of truth
    // for that rule). These composite lower-center over the speaker.
    const cards = filterCardsToSpeakerRanges(plan.cards ?? [], speakerRanges)
    const haveCards = cards.length > 0

    window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
      clipId: job.clipId,
      message: `Compositing ${phrases.length} phrase overlay(s)…`,
      percent: 78
    })

    // Phrase pass writes straight to the final path when there are no cards to
    // add; otherwise it produces an intermediate the card pass composites onto.
    const phraseTarget = haveCards
      ? join(tmpdir(), `batchcontent-lf-phrased-${Date.now()}.mp4`)
      : outputPath
    if (haveCards) tempFiles.push(phraseTarget)

    let overlayTempFiles: string[] = []
    let cardBase = concatPath
    if (phrases.length > 0) {
      const result = await applyPhraseOverlays({
        inputPath: concatPath,
        outputPath: phraseTarget,
        phrases,
        width: LANDSCAPE_WIDTH,
        height: LANDSCAPE_HEIGHT,
        fps: LANDSCAPE_FPS,
        qualityParams,
        // Phrase emphasis text follows the user-selected palette, same axis as
        // the content blocks (resolved at line ~320).
        phraseColor: palette.accent
      })
      overlayTempFiles = result.tempFiles
      if (result.outputPath === phraseTarget) {
        // Overlays composited onto phraseTarget → cards build on top of it.
        cardBase = phraseTarget
      } else {
        // Every phrase overlay failed (e.g. Remotion wholly unavailable) →
        // phraseTarget was never written. Fall back to the speaker concat as
        // the card base; if there are no cards either, finalize it directly so
        // the render still completes (RF-003).
        cardBase = concatPath
        if (!haveCards) {
          await reencodeToFinal(concatPath, outputPath, qualityParams)
        }
      }
    } else if (!haveCards) {
      // No phrases and no cards — re-encode the concat to the user's quality.
      await reencodeToFinal(concatPath, outputPath, qualityParams)
    }

    let cardTempFiles: string[] = []
    let cardStats: DelosCardStats | null = null
    if (haveCards) {
      window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
        clipId: job.clipId,
        message: `Compositing ${cards.length} pop-up card(s)…`,
        percent: 88
      })
      const result = await applyDelosCards({
        inputPath: cardBase,
        outputPath,
        cards,
        speakerRanges,
        words: job.wordTimestamps,
        width: LANDSCAPE_WIDTH,
        height: LANDSCAPE_HEIGHT,
        fps: LANDSCAPE_FPS,
        qualityParams,
        // Cards follow the same palette accent as phrases and blocks.
        accentColor: palette.accent,
        apiKey: options.geminiApiKey
      })
      cardTempFiles = result.tempFiles
      cardStats = result.stats
      if (result.outputPath !== outputPath) {
        // Every card render failed → nothing was written to the final path.
        // Finalize the card pass's base instead so the render still completes.
        if (cardBase === concatPath) {
          await reencodeToFinal(concatPath, outputPath, qualityParams)
        } else {
          copyFileSync(cardBase, outputPath)
        }
      }
    }

    // Surface what actually rendered vs. what was unavailable, once, on the
    // existing done channel (RF-008). Without this the user gets a clean "Done"
    // even when content blocks were dropped or cards fell back to offline text.
    const summary = buildLongformRenderSummary(droppedBlocks, cardStats)

    window.webContents.send(Ch.Send.RENDER_CLIP_PROGRESS, { clipId: job.clipId, percent: 100 })
    window.webContents.send(Ch.Send.RENDER_CLIP_DONE, {
      clipId: job.clipId,
      outputPath,
      ...(summary ? { summary } : {})
    })
    window.webContents.send(Ch.Send.RENDER_BATCH_DONE, { completed: 1, failed: 0, total: 1 })

    cleanupPhraseOverlayTempFiles(overlayTempFiles)
    cleanupPhraseOverlayTempFiles(cardTempFiles)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sendError(`Long-form render failed: ${message}`)
  } finally {
    for (const f of tempFiles) {
      try {
        unlinkSync(f)
      } catch {
        /* ignore */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Render summary (RF-008)
// ---------------------------------------------------------------------------

/**
 * Compose a one-line "what rendered vs. what was unavailable" summary from the
 * long-form pass counts, shown once on the done row instead of a silent "Done".
 * Returns `undefined` when there is nothing noteworthy to report (no cards, no
 * dropped blocks) so the UI stays quiet on a fully clean render.
 *
 * Examples: "9 cards · 2 unavailable", "7 cards · 3 offline text", "1 block dropped".
 */
export function buildLongformRenderSummary(
  droppedBlocks: number,
  cardStats: DelosCardStats | null
): string | undefined {
  const parts: string[] = []

  if (cardStats && (cardStats.rendered > 0 || cardStats.dropped > 0)) {
    parts.push(`${cardStats.rendered} card${cardStats.rendered === 1 ? '' : 's'}`)
    if (cardStats.dropped > 0) parts.push(`${cardStats.dropped} unavailable`)
    if (cardStats.fallbackText > 0) parts.push(`${cardStats.fallbackText} offline text`)
  }

  if (droppedBlocks > 0) {
    parts.push(`${droppedBlocks} block${droppedBlocks === 1 ? '' : 's'} dropped`)
  }

  return parts.length > 0 ? parts.join(' · ') : undefined
}

// ---------------------------------------------------------------------------
// Final re-encode (no-phrase path)
// ---------------------------------------------------------------------------

function reencodeToFinal(
  inputPath: string,
  outputPath: string,
  qualityParams: ReturnType<typeof resolveQualityParams>
): Promise<void> {
  const { encoder, presetFlag } = getEncoder(qualityParams)
  return new Promise<void>((resolve, reject) => {
    ffmpeg(toFFmpegPath(inputPath))
      .outputOptions([
        '-c:v', encoder,
        ...presetFlag,
        '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        '-movflags', '+faststart',
        '-y'
      ])
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .save(toFFmpegPath(outputPath))
  })
}
