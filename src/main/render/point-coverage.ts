// ---------------------------------------------------------------------------
// Point-coverage helper — keep multi-item graphics on screen until spoken
// ---------------------------------------------------------------------------
//
// Multi-item graphics (checklists, icon grids, numbered lists, transcript
// streams, delos-* cards, longform list blocks) render N points at once. The
// graphic's display window is planned independently of the narration, so it can
// fade out before the speaker has finished saying every listed point.
//
// This module provides a small, dependency-free fuzzy matcher: given the text
// of the LAST listed item and the clip's word-level timestamps, it finds when
// that point is finished being spoken and lets callers extend the graphic's
// `endTime` to cover it. If no confident match is found it returns the original
// end time (no regression).
//
// Times are plain numbers in a single timeline (clip-relative seconds). Callers
// are responsible for putting `words` into the same frame as the placement
// (e.g. subtract the clip start from source-relative `job.wordTimestamps`).
// ---------------------------------------------------------------------------

/** Seconds to hold a multi-item graphic after its last point stops being spoken. */
export const HOLD_AFTER_LAST_POINT_SECONDS = 0.6;

/** Word with timing, mirroring `RenderClipJob.wordTimestamps` entries. */
export interface WordTimestamp {
  text: string;
  start: number;
  end: number;
}

/** Lowercase and strip punctuation, collapsing to a single spaced string. */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split a phrase into normalized word tokens (punctuation removed, no empties). */
export function tokenizePhrase(input: string): string[] {
  const norm = normalizeText(input);
  return norm.length === 0 ? [] : norm.split(' ');
}

/** True when `a` and `b` differ by at most one insert/delete/substitution. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la > lb) return withinOneEdit(b, a); // ensure a is the shorter side

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    edits++;
    if (edits > 1) return false;
    if (la === lb) {
      i++; // substitution
      j++;
    } else {
      j++; // insertion in the longer string `b`
    }
  }
  edits += lb - j; // any unmatched trailing character in `b`
  return edits <= 1;
}

/** Fuzzy single-token equality: exact, shared prefix, or edit distance ≤ 1. */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4) {
    if (a.startsWith(b) || b.startsWith(a)) return true;
    if (withinOneEdit(a, b)) return true;
  }
  return false;
}

/** Greedily align `tokens` against `normWords` starting at `start`. */
function matchAt(
  tokens: string[],
  normWords: string[],
  start: number,
  lookahead: number,
): { matched: number; lastIdx: number } {
  let wi = start;
  let matched = 0;
  let lastIdx = start;
  for (const tok of tokens) {
    let found = -1;
    for (let k = wi; k < Math.min(normWords.length, wi + lookahead); k++) {
      const w = normWords[k];
      if (w !== undefined && tokensMatch(tok, w)) {
        found = k;
        break;
      }
    }
    if (found >= 0) {
      matched++;
      lastIdx = found;
      wi = found + 1;
    }
  }
  return { matched, lastIdx };
}

/**
 * Find when `phrase` finishes being spoken in `words`. Returns the end time of
 * the best-matching contiguous window, or null when no confident match exists.
 *
 * The matcher tolerates case, punctuation, minor typos, and small word gaps.
 * When several windows tie on match quality the latest one wins (a graphic's
 * last point is, by definition, spoken last).
 */
export function findPhraseEndTime(
  phrase: string,
  words: WordTimestamp[] | undefined,
): number | null {
  if (!words || words.length === 0) return null;
  const tokens = tokenizePhrase(phrase);
  if (tokens.length === 0) return null;

  const normWords: string[] = [];
  const ends: number[] = [];
  for (const w of words) {
    const n = normalizeText(w.text);
    if (n.length === 0) continue;
    normWords.push(n);
    ends.push(w.end);
  }
  if (normWords.length === 0) return null;

  const required = Math.max(1, Math.ceil(tokens.length / 2));
  const lookahead = Math.max(4, tokens.length + 2);

  let best: { matched: number; lastIdx: number } | null = null;
  for (let s = 0; s < normWords.length; s++) {
    const r = matchAt(tokens, normWords, s, lookahead);
    if (r.matched < required) continue;
    if (
      !best ||
      r.matched > best.matched ||
      (r.matched === best.matched && r.lastIdx > best.lastIdx)
    ) {
      best = r;
    }
  }

  return best ? (ends[best.lastIdx] ?? null) : null;
}

/**
 * Extend a graphic's end time so it stays on screen until its last listed point
 * has been spoken (plus a small hold). Only multi-item graphics qualify.
 *
 * - Never shrinks the window (`max` with the current end).
 * - Never extends past `clipEnd`.
 * - Falls back to `currentEndTime` when no point match is found.
 */
export function extendEndTimeForLastPoint(opts: {
  items: string[];
  currentEndTime: number;
  clipEnd: number;
  words: WordTimestamp[] | undefined;
}): number {
  const { items, currentEndTime, clipEnd, words } = opts;

  const cleaned = items.map((i) => i.trim()).filter((i) => i.length > 0);
  if (cleaned.length < 2) return currentEndTime;
  if (clipEnd <= currentEndTime) return currentEndTime;

  const lastItem = cleaned[cleaned.length - 1];
  if (lastItem === undefined) return currentEndTime;
  const spokenEnd = findPhraseEndTime(lastItem, words);
  if (spokenEnd === null) return currentEndTime;

  const desired = Math.min(spokenEnd + HOLD_AFTER_LAST_POINT_SECONDS, clipEnd);
  return Math.max(currentEndTime, desired);
}
