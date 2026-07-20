// ---------------------------------------------------------------------------
// Delos pop-up card feature (long-form / Hormozi 16:9 only).
//
// The THIRD long-form overlay layer, parallel to phrase emphasis. Delos HUD
// cards float lower-center over the SPEAKER (the speaker stays on screen),
// unlike full-frame content blocks which replace the speaker. Each card is an
// alpha ProRes (.mov) widget rendered from the catalog `delos-*.html` templates
// and composited onto the concatenated long-form timeline.
//
// Hard rule: a card may only appear during SPEAKER time. Any card whose range
// is not fully inside a speaker range is rejected here (the render side is the
// single source of truth for "no overlap with full-frame blocks").
//
// Outside the long-form profile this module is unused (never registered in the
// 9:16 feature list).
// ---------------------------------------------------------------------------

import type { DelosCardKind, DelosCardPlacement } from '@shared/types';
import type { QualityParams } from '../../ffmpeg';
import {
  buildCardContentWithSource,
  type CardContent,
  type CardKind,
  type CardWord,
} from '../../hyperframes/card-content';
import type { OverlayRequest } from '../../hyperframes/types';
import { compositeDelosCards, type DelosCardOverlayInput } from '../longform-encode';
import type { WordTimestamp } from '../point-coverage';

// ---------------------------------------------------------------------------
// Compile-time guard: the IPC-serializable `DelosCardKind` (shared/) and the
// main-side `CardKind` (card-content.ts) MUST stay identical. If either union
// gains/loses a member, one of these conditional types resolves to `never` and
// the assignment below fails to compile.
// ---------------------------------------------------------------------------

type _AssertCardKindMatch = (DelosCardKind extends CardKind ? true : never) &
  (CardKind extends DelosCardKind ? true : never);
const _assertCardKindMatch: _AssertCardKindMatch = true;
void _assertCardKindMatch;

// ---------------------------------------------------------------------------
// Geometry / positioning constants
// ---------------------------------------------------------------------------

/**
 * Card vertical anchor (0–100) baked into each card's `yPos` at render time.
 * The card is center-anchored inside its authored portrait canvas; because the
 * composite step scales that canvas to the full output height, this percentage
 * maps 1:1 onto the frame. 70 keeps the card in the lower band: well below the
 * speaker's eye-line (top third), with its bottom near the frame bottom for the
 * taller text-forward cards (~2% bleed margin) while shorter cards float a touch
 * higher but never reach the face.
 */
export const DELOS_CARD_YPOS = 70;

/** Default card accent when no palette accent is supplied. */
const DEFAULT_CARD_ACCENT = '#9f75ff';

// ---------------------------------------------------------------------------
// Speaker-range filtering — the "no overlap with full-frame blocks" gate
// ---------------------------------------------------------------------------

export interface SpeakerRange {
  start: number;
  end: number;
}

/**
 * Keep only cards whose [startTime, endTime] sits FULLY inside a single speaker
 * range. A card that starts or ends inside a full-frame content block (i.e. not
 * contained by any speaker range) is dropped, so pop-ups never stack on top of
 * a full-frame block.
 */
export function filterCardsToSpeakerRanges(
  cards: DelosCardPlacement[],
  speakerRanges: SpeakerRange[],
): DelosCardPlacement[] {
  return cards.filter(
    (c) =>
      c.endTime > c.startTime &&
      speakerRanges.some((r) => c.startTime >= r.start && c.endTime <= r.end),
  );
}

// ---------------------------------------------------------------------------
// Content building
// ---------------------------------------------------------------------------

/** Words whose span overlaps the card's [start, end] display window. */
function sliceWordsToWindow(
  words: WordTimestamp[] | undefined,
  start: number,
  end: number,
): CardWord[] {
  if (!words || words.length === 0) return [];
  const out: CardWord[] = [];
  for (const w of words) {
    if (w.end > start && w.start < end) {
      out.push({ text: w.text, start: w.start, end: w.end });
    }
  }
  return out;
}

/** Strip the discriminant so only the card's text/data slots remain. */
function cardContentToSlots(content: CardContent): Record<string, unknown> {
  const { kind: _kind, ...slots } = content;
  return slots;
}

/**
 * Build a render-ready `OverlayRequest` for one card: distil the spoken window
 * into the card's content slots, then attach the decorative accent + lower-band
 * `yPos`. Timing uses absolute concat time (== source time, 1:1).
 *
 * Returns the request alongside whether its text came from the Gemini pass
 * (`usedAiText: true`) or the deterministic offline fallback. A Gemini failure
 * (rate-limit, network, bad JSON) is absorbed inside `buildCardContentWithSource`
 * and reported as `usedAiText: false` rather than silently swallowed (RF-008).
 */
async function buildCardRequest(
  card: DelosCardPlacement,
  words: WordTimestamp[] | undefined,
  accentColor: string,
  apiKey?: string,
): Promise<{ request: OverlayRequest; usedAiText: boolean }> {
  const duration = Math.max(1, card.endTime - card.startTime);
  const windowWords = sliceWordsToWindow(words, card.startTime, card.endTime);
  const windowText =
    card.sourceText && card.sourceText.trim().length > 0
      ? card.sourceText
      : windowWords.map((w) => w.text).join(' ');

  const props: Record<string, unknown> = {
    accentColor,
    // Center horizontally in-canvas; vertical drop handled by yPos. The slight
    // RIGHT drift is applied at composite time, not here.
    position: { x: 50, y: DELOS_CARD_YPOS },
  };

  let usedAiText = false;
  try {
    const { content, source } = await buildCardContentWithSource(
      card.kind,
      windowText,
      windowWords,
      apiKey ? { apiKey } : {},
    );
    usedAiText = source === 'ai';
    Object.assign(props, cardContentToSlots(content));
  } catch {
    // Leave preset defaults — renderer fills sensible fallbacks per card kind.
    usedAiText = false;
  }

  return {
    request: {
      block: card.kind,
      props: props as OverlayRequest['props'],
      timing: { start: card.startTime, duration },
    },
    usedAiText,
  };
}

// ---------------------------------------------------------------------------
// Public API — render + composite all surviving cards in one pass
// ---------------------------------------------------------------------------

export interface ApplyDelosCardsOptions {
  /** Concatenated base video (post phrase-overlay pass). */
  inputPath: string;
  /** Final output path. */
  outputPath: string;
  /** Cards already filtered to speaker ranges (re-filtered defensively here). */
  cards: DelosCardPlacement[];
  /** Speaker ranges used to reject any card overlapping a full-frame block. */
  speakerRanges: SpeakerRange[];
  /** Absolute-time word timestamps used to populate card content. */
  words?: WordTimestamp[] | undefined;
  width: number;
  height: number;
  fps: number;
  qualityParams: QualityParams;
  /** Accent color, resolved from the user-selected palette. */
  accentColor?: string | undefined;
  /** Gemini key for card-content summarization (falls back deterministically). */
  apiKey?: string | undefined;
}

/**
 * Per-pass counts so the caller can report what actually made it onto the
 * timeline instead of a silent "Done" (RF-008).
 */
export interface DelosCardStats {
  /** Cards composited onto the final video. */
  rendered: number;
  /** Cards that survived speaker-range filtering but failed to render. */
  dropped: number;
  /** Cards whose text came from the Gemini pass. */
  aiText: number;
  /** Cards that fell back to deterministic offline text. */
  fallbackText: number;
}

/**
 * Render + composite all Delos cards onto the base video. When no card survives
 * filtering / rendering, the input path is returned unchanged (the caller
 * decides how to finalize). Returns the temp .mov files so the caller can clean
 * them up after the encode finishes, plus per-pass `stats` so the caller can
 * surface a rendered/unavailable count.
 */
export async function applyDelosCards(
  opts: ApplyDelosCardsOptions,
): Promise<{ outputPath: string; tempFiles: string[]; stats: DelosCardStats }> {
  const {
    inputPath,
    outputPath,
    cards,
    speakerRanges,
    words,
    width,
    height,
    qualityParams,
    accentColor,
    apiKey,
  } = opts;

  const surviving = filterCardsToSpeakerRanges(cards, speakerRanges);
  if (surviving.length === 0) {
    return {
      outputPath: inputPath,
      tempFiles: [],
      stats: { rendered: 0, dropped: 0, aiText: 0, fallbackText: 0 },
    };
  }

  // Dynamic import keeps the HyperFrames engine out of the static module graph
  // so importing this feature in unit tests never spawns a renderer.
  const { renderOverlays } = await import('../../hyperframes/renderer');

  const accent = accentColor ?? DEFAULT_CARD_ACCENT;
  const requests: OverlayRequest[] = [];
  let aiText = 0;
  let fallbackText = 0;
  for (const card of surviving) {
    const { request, usedAiText } = await buildCardRequest(card, words, accent, apiKey);
    requests.push(request);
    if (usedAiText) aiText++;
    else fallbackText++;
  }

  const results = await renderOverlays(requests);

  const tempFiles: string[] = [];
  const overlays: DelosCardOverlayInput[] = [];
  results.forEach((result, i) => {
    if (!result.movPath) return; // failed render — skip this card
    const req = requests[i];
    if (!req) return;
    tempFiles.push(result.movPath);
    overlays.push({
      overlayPath: result.movPath,
      startTime: req.timing.start,
      endTime: req.timing.start + req.timing.duration,
    });
  });

  // A surviving card with no .mov was dropped at render time (the warn-and-skip
  // path in renderOverlays). Surface that count rather than swallowing it.
  const rendered = overlays.length;
  const dropped = surviving.length - rendered;
  const stats: DelosCardStats = { rendered, dropped, aiText, fallbackText };

  if (overlays.length === 0) {
    return { outputPath: inputPath, tempFiles, stats };
  }

  await compositeDelosCards({
    inputPath,
    outputPath,
    overlays,
    width,
    height,
    qualityParams,
  });

  return { outputPath, tempFiles, stats };
}
