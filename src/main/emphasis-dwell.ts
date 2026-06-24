// ---------------------------------------------------------------------------
// Emphasis dwell — minimum on-screen time for emphasised words
// ---------------------------------------------------------------------------
//
// Emphasised words (recolor / highlight / supersize) are driven by the raw ASR
// word boundaries (`start` → `end`). In fast speech those windows collapse to
// ~150–250 ms, which is too short for a viewer to register the emphasis state
// before it vanishes. We enforce a minimum dwell so every emphasis holds long
// enough to read, while never bleeding past the clip end or into the next
// emphasised word.
//
// This is the SINGLE SOURCE OF TRUTH for the dwell duration. Both the reactive
// auto-zoom keyframes (word-emphasis.feature.ts) and the caption recolor
// windows (captions.ts) consume it so the two stay in lockstep.

/** Minimum time (seconds) an emphasis state must stay on screen to be readable. */
export const MIN_EMPHASIS_DWELL_SECONDS = 0.45

/**
 * Smallest gap (seconds) we keep between an extended emphasis window and the
 * start of the next emphasised word so back-to-back emphases never overlap.
 */
export const EMPHASIS_DWELL_EPSILON = 0.001

/**
 * Minimum end time for an emphasis that begins at `start` — i.e. the earliest
 * moment the emphasis state is allowed to clear, ignoring clamps.
 */
export function minEmphasisDwellEnd(start: number): number {
  return start + MIN_EMPHASIS_DWELL_SECONDS
}

/** Any object carrying an emphasis window with a `start` and `end` (seconds). */
export interface EmphasisDwellWindow {
  start: number
  end: number
}

/**
 * Extend each emphasis window's `end` so the emphasis stays on screen for at
 * least {@link MIN_EMPHASIS_DWELL_SECONDS}, subject to two clamps:
 *
 *   1. never past `clipEnd` (when `clipEnd > 0`)
 *   2. never into the NEXT emphasised word's `start` (clamped to
 *      `next.start - EMPHASIS_DWELL_EPSILON`)
 *
 * The raw window is never shortened below its original `end` UNLESS the
 * next-word clamp forces it (overlap resolution wins, so back-to-back words
 * stay disjoint). Returns a new, start-sorted array; inputs are not mutated.
 *
 * Generic over the window type so callers keep their own extra fields (e.g.
 * the keyframe `time`/`level`).
 */
export function applyMinEmphasisDwell<T extends EmphasisDwellWindow>(
  windows: T[],
  clipEnd = 0
): T[] {
  const sorted = [...windows].sort((a, b) => a.start - b.start)

  return sorted.map((w, i) => {
    const next = sorted[i + 1]

    // Desired end: hold for at least the minimum dwell, but keep the raw end
    // if the word already runs longer than the dwell.
    let end = Math.max(w.end, minEmphasisDwellEnd(w.start))

    // Clamp 1 — never past the clip end.
    if (clipEnd > 0) end = Math.min(end, clipEnd)

    // Clamp 2 — never overlap the next emphasised word.
    if (next) end = Math.min(end, next.start - EMPHASIS_DWELL_EPSILON)

    // Safety floor: a window must never invert (end < start).
    if (end < w.start) end = w.start

    return { ...w, end }
  })
}
