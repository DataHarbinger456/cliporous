// ---------------------------------------------------------------------------
// Promo Mode — clip-candidate builder
// ---------------------------------------------------------------------------
//
// Promo Mode ("Media Master demo mode") is filmed as one longform recording
// with spoken markers between takes ("clip one … clip two …"). Instead of the
// AI clip-scoring pass, we split the recording on those markers and turn each
// segment into a clip candidate directly.
//
// This module bridges the pure splitter (`spoken-split.ts`) into the shape the
// clip-creation path consumes: one candidate per PromoSegment, carrying the
// segment's source-relative word timestamps. If no markers are found we fall
// back to a single candidate spanning the whole recording so the flow never
// crashes on a marker-less video.
//
// Pure + deterministic — no I/O. Unit-tested in promo-clips.test.ts.
// ---------------------------------------------------------------------------

import type { WordTimestamp } from '@shared/types';
import { type SpokenSplitOptions, splitOnSpokenMarkers } from './spoken-split';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A promo clip candidate seed. Mirrors the fields the clip-creation path needs
 * to build a full `ClipCandidate` (renderer store type) without touching the
 * AI scoring pipeline. Times are source-video absolute seconds.
 */
export interface PromoClip {
  /** 1-based ordinal (spoken marker, or 1 for the fallback whole-recording clip). */
  index: number;
  /** Segment start in source-video seconds. */
  startTime: number;
  /** Segment end in source-video seconds. */
  endTime: number;
  /** Transcript text for this segment (space-joined words in range). */
  text: string;
  /** Human label, e.g. "clip 2". */
  label: string;
  /** Source-relative word timestamps that fall inside [startTime, endTime]. */
  wordTimestamps: WordTimestamp[];
}

export type PromoClipOptions = SpokenSplitOptions;

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/** Words whose range falls within [start, end], preserving source timings. */
function wordsInRange(words: WordTimestamp[], start: number, end: number): WordTimestamp[] {
  return words.filter((w) => w.start >= start && w.end <= end);
}

/** Space-join word texts into a transcript string. */
function joinText(words: WordTimestamp[]): string {
  return words
    .map((w) => w.text.trim())
    .filter((t) => t.length > 0)
    .join(' ');
}

/**
 * Build promo clip candidates from a longform word stream.
 *
 * - When spoken markers are present, returns one candidate per PromoSegment,
 *   using the segment's [startTime, endTime] as the clip range.
 * - When NO markers are found, falls back to a single candidate spanning the
 *   whole recording (first word start → last word end).
 * - Returns [] only for an empty word stream.
 *
 * Each candidate carries its source-relative word timestamps.
 */
export function buildPromoClips(
  words: WordTimestamp[],
  options: PromoClipOptions = {},
): PromoClip[] {
  if (words.length === 0) return [];

  const segments = splitOnSpokenMarkers(words, options);

  if (segments.length === 0) {
    // Fallback — treat the whole recording as a single clip.
    const first = words[0];
    const last = words[words.length - 1];
    if (!first || !last) return [];
    return [
      {
        index: 1,
        startTime: first.start,
        endTime: last.end,
        text: joinText(words),
        label: 'clip 1',
        wordTimestamps: [...words],
      },
    ];
  }

  return segments.map((seg) => {
    const inRange = wordsInRange(words, seg.startTime, seg.endTime);
    return {
      index: seg.index,
      startTime: seg.startTime,
      endTime: seg.endTime,
      text: joinText(inRange),
      label: seg.label,
      wordTimestamps: inRange,
    };
  });
}
