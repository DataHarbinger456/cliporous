// ---------------------------------------------------------------------------
// Promo Mode — evidence trigger brain
// ---------------------------------------------------------------------------
//
// Given a clip's transcript (clip-relative word timestamps), decide WHEN to
// show WHICH kind of evidence pop-up. Output is an ordered list of "evidence
// beats" — each names an EvidenceCategory and a timestamp; a later resolver
// turns a beat into a concrete asset (an animated MM template + text, or a
// real capture picked from the brand pack via semantic lookup).
//
// Two strategies:
//   1. matchEvidenceBeatsHeuristic — deterministic phrase map. No network,
//      unit-tested, always available. This is the reliable floor.
//   2. planEvidenceBeats (async) — Gemini reads the transcript for smarter
//      placement + text-fill, falling back to the heuristic on any failure.
//
// Pacing rules mirror the B-Roll engine: protect the hook, cap density, keep a
// minimum gap so pops read as fast "receipts" without stacking.
// ---------------------------------------------------------------------------

import type { WordTimestamp } from '@shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvidenceCategory = 'app-ui' | 'community-proof' | 'growth-stat' | 'cta';

export interface EvidenceBeat {
  /** Which family of evidence to show. */
  category: EvidenceCategory;
  /** Clip-relative seconds at which the pop should appear. */
  timestamp: number;
  /**
   * Optional text distilled from the surrounding narration — used to fill a
   * re-textable template (e.g. an agent success toast). Undefined for captures.
   */
  textFill?: string;
  /** The phrase that triggered this beat (diagnostics). */
  trigger?: string;
}

export interface EvidencePacing {
  /** Seconds of hook to protect at the clip start. Default: 2. */
  hookProtectionSeconds?: number;
  /** Minimum gap between consecutive pops. Default: 3. */
  minGapSeconds?: number;
  /** Hard cap on total pops per clip (excludes the forced end CTA). Default: 4. */
  maxBeats?: number;
}

// ---------------------------------------------------------------------------
// Phrase → category map
// ---------------------------------------------------------------------------
//
// Each category lists lowercase phrases. Multi-word phrases match a sliding
// window over the transcript; single words match a token. Order within a
// category does not matter; the FIRST matching category wins per position.
// ---------------------------------------------------------------------------

export const EVIDENCE_PHRASES: Record<Exclude<EvidenceCategory, 'cta'>, string[]> = {
  'app-ui': [
    'media master',
    'the app',
    'this app',
    'this tool',
    'the tool',
    'watch this',
    'check this out',
    'look at this',
    'the agent',
    'ai agent',
    'the chat',
    'i just tell it',
    'i tell it',
    'tell it to',
    'brand kit',
    'image library',
    'swipe ads',
    'ads dashboard',
    'one click',
    'generate',
    'generated',
    'posts for me',
    'schedule',
    'carousel',
    'carousels',
    'nine platforms',
    '9 platforms',
    'autopilot',
  ],
  'community-proof': [
    'my community',
    'the community',
    'inside my skool',
    'my skool',
    'the skool',
    'my members',
    'the members',
    'the group',
    'join the group',
    'our members',
    'free access',
    'free inside',
    'testimonial',
    'results',
    'people are getting',
    'the classroom',
    'the wins',
  ],
  'growth-stat': [
    'a hundred posts',
    '100 posts',
    'hundred posts',
    'posts a month',
    'posts per month',
    'grew',
    'blew up',
    'went viral',
    'ten x',
    '10x',
    'doubled',
    'tripled',
    'followers',
    'reach',
    'impressions',
    'engagement',
    'on autopilot',
    'every single day',
    'thousands of',
  ],
};

/** CTA trigger phrases — used to place an explicit mid-clip CTA if spoken. */
export const CTA_PHRASES: string[] = [
  'join',
  'link below',
  'link in bio',
  'come in',
  'get access',
  'sign up',
  'the link',
  'in the description',
  'free tools',
  'skip the building',
];

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

function normalizeToken(text: string): string {
  return text.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

/**
 * Precomputed, position-indexed normalized token list plus a lowercased,
 * space-joined haystack for multi-word phrase matching.
 */
interface TokenIndex {
  tokens: string[];
  /** For each token, the character offset where it starts in `joined`. */
  offsets: number[];
  joined: string;
  words: WordTimestamp[];
}

function buildTokenIndex(words: WordTimestamp[]): TokenIndex {
  const tokens = words.map((w) => normalizeToken(w.text));
  const offsets: number[] = [];
  let joined = '';
  for (let i = 0; i < tokens.length; i++) {
    offsets.push(joined.length);
    joined += tokens[i];
    if (i < tokens.length - 1) joined += ' ';
  }
  return { tokens, offsets, joined, words };
}

/** Map a character offset in `joined` back to the word index it belongs to. */
function offsetToWordIndex(idx: TokenIndex, charOffset: number): number {
  // Linear scan is fine — transcripts per clip are small.
  for (let i = idx.offsets.length - 1; i >= 0; i--) {
    const offset = idx.offsets[i];
    if (offset !== undefined && offset <= charOffset) return i;
  }
  return 0;
}

interface RawMatch {
  category: Exclude<EvidenceCategory, 'cta'> | 'cta';
  wordIndex: number;
  timestamp: number;
  trigger: string;
}

/** Find every phrase hit across all categories, ordered by timestamp. */
function findPhraseMatches(idx: TokenIndex): RawMatch[] {
  const matches: RawMatch[] = [];

  const scan = (category: RawMatch['category'], phrases: string[]): void => {
    for (const phrase of phrases) {
      const needle = phrase.toLowerCase();
      let from = 0;
      while (true) {
        const at = idx.joined.indexOf(needle, from);
        if (at === -1) break;
        // Enforce word boundaries so "generate" doesn't hit inside "regenerated".
        const before = at === 0 ? ' ' : idx.joined[at - 1];
        const afterPos = at + needle.length;
        const after = afterPos >= idx.joined.length ? ' ' : idx.joined[afterPos];
        if (before === ' ' && after === ' ') {
          const wi = offsetToWordIndex(idx, at);
          const word = idx.words[wi];
          if (word) {
            matches.push({
              category,
              wordIndex: wi,
              timestamp: word.start,
              trigger: phrase,
            });
          }
        }
        from = at + needle.length;
      }
    }
  };

  scan('app-ui', EVIDENCE_PHRASES['app-ui']);
  scan('community-proof', EVIDENCE_PHRASES['community-proof']);
  scan('growth-stat', EVIDENCE_PHRASES['growth-stat']);
  scan('cta', CTA_PHRASES);

  return matches.sort((a, b) => a.timestamp - b.timestamp);
}

// ---------------------------------------------------------------------------
// Heuristic beat matcher (deterministic)
// ---------------------------------------------------------------------------

/**
 * Distil a short text-fill for a template from the words around a match.
 * Grabs up to `windowWords` words starting at the match, title-ish cleaned.
 */
function textFillAround(words: WordTimestamp[], wordIndex: number, windowWords = 8): string {
  const slice = words
    .slice(wordIndex, wordIndex + windowWords)
    .map((w) => w.text)
    .join(' ')
    .trim();
  return slice;
}

/**
 * Deterministic evidence-beat matcher. Scans the transcript for trigger
 * phrases, enforces hook protection + minimum gap + max density, and returns
 * ordered beats. Never throws; empty transcript → [].
 */
export function matchEvidenceBeatsHeuristic(
  words: WordTimestamp[],
  pacing: EvidencePacing = {},
): EvidenceBeat[] {
  if (!words || words.length === 0) return [];

  const hookProtection = pacing.hookProtectionSeconds ?? 2;
  const minGap = pacing.minGapSeconds ?? 3;
  const maxBeats = pacing.maxBeats ?? 4;

  const idx = buildTokenIndex(words);
  const matches = findPhraseMatches(idx);

  const beats: EvidenceBeat[] = [];
  let lastTime = -Infinity;

  for (const match of matches) {
    if (beats.length >= maxBeats) break;
    if (match.timestamp < hookProtection) continue;
    if (match.timestamp - lastTime < minGap) continue;

    const beat: EvidenceBeat = {
      category: match.category,
      timestamp: match.timestamp,
      trigger: match.trigger,
    };
    if (match.category !== 'cta') {
      beat.textFill = textFillAround(words, match.wordIndex);
    }
    beats.push(beat);
    lastTime = match.timestamp;
  }

  return beats;
}
