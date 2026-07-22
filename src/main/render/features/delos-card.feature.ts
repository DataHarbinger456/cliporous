// ---------------------------------------------------------------------------
// Delos pop-up card feature (long-form / Hormozi 16:9 only).
//
// The THIRD long-form overlay layer, parallel to phrase emphasis. Delos HUD
// cards float upper-left over the SPEAKER (the speaker stays on screen),
// unlike full-frame content blocks which replace the speaker. Each card is an
// alpha ProRes (.mov) widget rendered by the shared Remotion pipeline and
// composited onto the concatenated long-form timeline.
//
// Hard rule: a card may only appear during SPEAKER time. Any card whose range
// is not fully inside a speaker range is rejected here (the render side is the
// single source of truth for "no overlap with full-frame blocks").
//
// Outside the long-form profile this module is unused (never registered in the
// 9:16 feature list).
// ---------------------------------------------------------------------------

import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DelosCardKind, DelosCardPlacement } from '@shared/types';
import type { QualityParams } from '../../ffmpeg';
import {
  buildCardContentWithSource,
  type CardContent,
  type CardKind,
  type CardWord,
} from '../../hyperframes/card-content';
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
 * Build render-ready props for one card: distil the spoken window into the
 * card's content slots and attach the decorative accent. Timing uses absolute
 * concat time (== source time, 1:1).
 *
 * Returns the request alongside whether its text came from the Gemini pass
 * (`usedAiText: true`) or the deterministic offline fallback. A Gemini failure
 * (rate-limit, network, bad JSON) is absorbed inside `buildCardContentWithSource`
 * and reported as `usedAiText: false` rather than silently swallowed (RF-008).
 */
interface RenderableCard {
  inputProps: Record<string, unknown>;
  startTime: number;
  duration: number;
}

async function buildCardRequest(
  card: DelosCardPlacement,
  words: WordTimestamp[] | undefined,
  accentColor: string,
  apiKey?: string,
): Promise<{ request: RenderableCard; usedAiText: boolean }> {
  const duration = Math.max(1, card.endTime - card.startTime);
  const windowWords = sliceWordsToWindow(words, card.startTime, card.endTime);
  const windowText =
    card.sourceText && card.sourceText.trim().length > 0
      ? card.sourceText
      : windowWords.map((word) => word.text).join(' ');

  const inputProps: Record<string, unknown> = {
    kind: card.kind,
    accentColor,
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
    Object.assign(inputProps, cardContentToSlots(content));
  } catch {
    // Leave composition defaults in place when content generation fails.
    usedAiText = false;
  }

  return {
    request: { inputProps, startTime: card.startTime, duration },
    usedAiText,
  };
}

// ---------------------------------------------------------------------------
// Public API — render + composite all surviving cards in one pass
// ---------------------------------------------------------------------------

export interface ApplyDelosCardsOptions {
  /** Concatenated base video (post phrase-overlay pass; cards stay upper-left). */
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
    fps,
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

  // Cards now share the packaged Remotion renderer used by blocks and phrases,
  // instead of relying on the removed HyperFrames CLI.
  const { renderRemotionSegment } = await import('../../remotion/render');
  const accent = accentColor ?? DEFAULT_CARD_ACCENT;
  const requests: RenderableCard[] = [];
  let aiText = 0;
  let fallbackText = 0;
  for (const card of surviving) {
    const { request, usedAiText } = await buildCardRequest(card, words, accent, apiKey);
    requests.push(request);
    if (usedAiText) aiText++;
    else fallbackText++;
  }

  const tempFiles: string[] = [];
  const overlays: DelosCardOverlayInput[] = [];
  for (const request of requests) {
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const overlayPath = join(tmpdir(), `batchcontent-card-${stamp}.mov`);
    try {
      await renderRemotionSegment({
        compositionId: 'DelosEvidenceCard',
        inputProps: request.inputProps,
        durationSec: request.duration,
        fps,
        width,
        height,
        transparent: true,
        outputPath: overlayPath,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[longform] Evidence card render failed: ${message}`);
      try {
        unlinkSync(overlayPath);
      } catch {
        // Ignore a missing or partially-created overlay.
      }
      continue;
    }
    tempFiles.push(overlayPath);
    overlays.push({
      overlayPath,
      startTime: request.startTime,
      endTime: request.startTime + request.duration,
    });
  }

  const rendered = overlays.length;
  const dropped = surviving.length - rendered;
  const stats: DelosCardStats = { rendered, dropped, aiText, fallbackText };

  if (overlays.length === 0) {
    return { outputPath: inputPath, tempFiles, stats };
  }

  try {
    await compositeDelosCards({
      inputPath,
      outputPath,
      overlays,
      width,
      height,
      qualityParams,
    });
  } catch (err) {
    for (const tempFile of tempFiles) {
      try {
        unlinkSync(tempFile);
      } catch {
        // Best-effort cleanup.
      }
    }
    throw err;
  }

  return { outputPath, tempFiles, stats };
}
