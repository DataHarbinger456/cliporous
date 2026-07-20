// ---------------------------------------------------------------------------
// Promo Mode — spoken-delimiter clip splitter
// ---------------------------------------------------------------------------
//
// Promo Mode content is filmed as discrete scripted takes inside one longform
// recording. Instead of AI clip-scoring, the creator speaks a marker phrase
// between takes ("clip one … clip two …"). This module scans word timestamps
// for those markers and returns the segment ranges BETWEEN them.
//
// A marker is the trigger word ("clip" by default) immediately followed by a
// number token — either a number word (one…twenty) or a digit (1, 2, …). The
// spoken marker itself is excluded from the resulting segment so it never ends
// up in the rendered short.
//
// Pure + deterministic — no I/O. Unit-tested in spoken-split.test.ts.
// ---------------------------------------------------------------------------

import type { WordTimestamp } from '@shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromoSegment {
  /** 1-based ordinal spoken by the creator (e.g. "clip two" → 2). */
  index: number;
  /** Segment start in source-video seconds (first content word after marker). */
  startTime: number;
  /** Segment end in source-video seconds (last content word before next marker). */
  endTime: number;
  /** Human label, e.g. "clip 2". */
  label: string;
}

export interface SpokenSplitOptions {
  /**
   * Trigger word that precedes the ordinal. Case-insensitive, punctuation
   * stripped. Default: 'clip'. Set to a rarer word if 'clip' collides with
   * your script vocabulary.
   */
  triggerWord?: string;
  /**
   * Minimum segment duration in seconds. Segments shorter than this are
   * dropped (protects against accidental double-markers). Default: 2.
   */
  minDurationSeconds?: number;
}

// ---------------------------------------------------------------------------
// Number-word parsing
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  // common ASR homophones / ordinals
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

/** Lowercase a token and strip surrounding punctuation. */
function normalizeToken(text: string): string {
  return text.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

/** Parse a token as an ordinal (number word or digit). Returns null if not one. */
function parseOrdinal(token: string): number | null {
  const t = normalizeToken(token);
  const word = NUMBER_WORDS[t];
  if (word !== undefined) return word;
  if (/^\d{1,2}$/.test(t)) {
    const n = Number.parseInt(t, 10);
    if (n >= 1 && n <= 99) return n;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Splitter
// ---------------------------------------------------------------------------

interface Marker {
  index: number;
  /** Word index of the trigger word. */
  triggerWordIdx: number;
  /** Word index of the ordinal word (marker ends here). */
  ordinalWordIdx: number;
}

/**
 * Find all spoken markers in the word stream.
 *
 * Exported for testing / diagnostics. A marker is `<triggerWord> <ordinal>`
 * appearing as two adjacent tokens.
 */
export function findMarkers(words: WordTimestamp[], triggerWord: string): Marker[] {
  const trigger = triggerWord.toLowerCase();
  const markers: Marker[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const cur = words[i];
    const next = words[i + 1];
    if (!cur || !next) continue;
    if (normalizeToken(cur.text) !== trigger) continue;
    const ordinal = parseOrdinal(next.text);
    if (ordinal === null) continue;
    markers.push({ index: ordinal, triggerWordIdx: i, ordinalWordIdx: i + 1 });
  }
  return markers;
}

/**
 * Split a longform word stream into promo segments on spoken markers.
 *
 * Behaviour:
 * - Content BEFORE the first marker is ignored (typically silence / a slate).
 * - Each segment spans from the first content word AFTER its marker's ordinal
 *   up to (but not including) the next marker's trigger word — or the last
 *   word for the final segment.
 * - Segments shorter than `minDurationSeconds` are dropped.
 *
 * If no markers are found, returns an empty array (caller decides fallback —
 * e.g. treat the whole recording as one clip).
 */
export function splitOnSpokenMarkers(
  words: WordTimestamp[],
  options: SpokenSplitOptions = {},
): PromoSegment[] {
  const triggerWord = (options.triggerWord ?? 'clip').toLowerCase();
  const minDuration = options.minDurationSeconds ?? 2;

  if (words.length === 0) return [];

  const markers = findMarkers(words, triggerWord);
  if (markers.length === 0) return [];

  const segments: PromoSegment[] = [];

  for (let m = 0; m < markers.length; m++) {
    const marker = markers[m];
    if (!marker) continue;
    const nextMarker = markers[m + 1];

    // Content starts at the first word after the ordinal token.
    const contentStartIdx = marker.ordinalWordIdx + 1;
    // Content ends just before the next marker's trigger word (or end of stream).
    const contentEndIdx = nextMarker ? nextMarker.triggerWordIdx - 1 : words.length - 1;

    if (contentStartIdx > contentEndIdx) continue;

    const startWord = words[contentStartIdx];
    const endWord = words[contentEndIdx];
    if (!startWord || !endWord) continue;
    const startTime = startWord.start;
    const endTime = endWord.end;

    if (endTime - startTime < minDuration) continue;

    segments.push({
      index: marker.index,
      startTime,
      endTime,
      label: `clip ${marker.index}`,
    });
  }

  return segments;
}
