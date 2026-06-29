// ---------------------------------------------------------------------------
// Phrase-emphasis feature (long-form / Hormozi 16:9 only).
//
// Post-concat overlay: renders each emphasis phrase as an alpha ProRes clip
// (Remotion `HormoziPhraseOverlay`) and composites them onto the concatenated
// long-form video at their absolute timestamps. Used by `longform-pipeline.ts`.
// Outside the long-form profile this is a strict no-op.
// ---------------------------------------------------------------------------

import { join } from 'path'
import { tmpdir } from 'os'
import { unlinkSync } from 'fs'
import type { PhraseEmphasis } from '@shared/types'
import { compositePhraseOverlays, type PhraseOverlayInput } from '../longform-encode'
import type { QualityParams } from '../../ffmpeg'
import type { RenderFeature, PrepareResult } from './feature'
import type { RenderClipJob, RenderBatchOptions } from '../types'

export interface ApplyPhraseOverlaysOptions {
  /** Concatenated base video. */
  inputPath: string
  /** Final output path. */
  outputPath: string
  phrases: PhraseEmphasis[]
  width: number
  height: number
  fps: number
  qualityParams: QualityParams
  /**
   * Color for the phrase text, resolved from the user-selected palette
   * (`palette.accent`). Used for any phrase that does not carry its own
   * `accentColor`. When omitted, the composition falls back to brand cream.
   */
  phraseColor?: string
}

/**
 * Render + composite all phrase overlays onto the base video. When there are
 * no phrases the input is returned unchanged (caller decides whether to copy).
 *
 * Returns the path to the composited output and the temp .mov files created
 * (so the caller can clean them up after the encode finishes).
 */
export async function applyPhraseOverlays(
  opts: ApplyPhraseOverlaysOptions
): Promise<{ outputPath: string; tempFiles: string[] }> {
  const { inputPath, outputPath, phrases, width, height, fps, qualityParams, phraseColor } =
    opts

  if (phrases.length === 0) {
    return { outputPath: inputPath, tempFiles: [] }
  }

  // Dynamic import keeps @remotion/bundler (esbuild) out of the static module
  // graph so importing the render pipeline in tests never loads it.
  const { renderRemotionSegment } = await import('../../remotion/render')

  const tempFiles: string[] = []
  const overlays: PhraseOverlayInput[] = []

  for (const phrase of phrases) {
    const duration = Math.max(0.4, phrase.endTime - phrase.startTime)
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`
    const overlayPath = join(tmpdir(), `batchcontent-phrase-${stamp}.mov`)
    try {
      await renderRemotionSegment({
        compositionId: 'HormoziPhraseOverlay',
        inputProps: {
          text: phrase.text,
          // Per-phrase override wins; otherwise follow the chosen palette.
          accentColor: phrase.accentColor ?? phraseColor,
          animationType: 'scale-in'
        },
        durationSec: duration,
        fps,
        width,
        height,
        transparent: true,
        outputPath: overlayPath
      })
    } catch (err) {
      // Graceful degrade (RF-003): a single phrase overlay failing to render
      // (or Remotion being unavailable) must not kill the whole render. Skip
      // this overlay and keep compositing the rest.
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[longform] Phrase overlay render failed ("${phrase.text}"): ${message}`)
      continue
    }
    tempFiles.push(overlayPath)
    overlays.push({
      overlayPath,
      startTime: phrase.startTime,
      endTime: phrase.startTime + duration
    })
  }

  // Every phrase overlay failed to render → leave the base untouched so the
  // caller can finalize the speaker cut instead (mirrors the Delos-card path).
  if (overlays.length === 0) {
    return { outputPath: inputPath, tempFiles }
  }

  await compositePhraseOverlays({ inputPath, outputPath, overlays, qualityParams })
  return { outputPath, tempFiles }
}

/** Best-effort cleanup of overlay temp files. */
export function cleanupPhraseOverlayTempFiles(files: string[]): void {
  for (const f of files) {
    try {
      unlinkSync(f)
    } catch {
      /* ignore */
    }
  }
}

/**
 * RenderFeature shell — documents the long-form seam and stays a strict no-op
 * for the 9:16 pipeline (it is never registered in the standard feature list).
 */
export const phraseEmphasisFeature: RenderFeature = {
  name: 'phrase-emphasis',
  async prepare(
    _job: RenderClipJob,
    batchOptions: RenderBatchOptions
  ): Promise<PrepareResult> {
    if (batchOptions.outputProfile !== 'longform') {
      return { tempFiles: [], modified: false }
    }
    return { tempFiles: [], modified: false }
  }
}
