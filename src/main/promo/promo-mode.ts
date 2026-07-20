// ---------------------------------------------------------------------------
// Promo Mode — orchestrator
// ---------------------------------------------------------------------------
//
// Pure glue that turns a clip's transcript + a Brand Pack into the two emit
// shapes the render pipeline already understands:
//
//   • templateOverlays  — HyperFrames OverlayRequest[] (animated MM templates,
//     stats) composited by the hyperframes-overlay feature.
//   • capturePlacements — abstract capture placements (real screenshots /
//     recordings) that the IPC handler materializes into BRollPlacement[] (an
//     image is turned into a short video clip first via imageToVideoClip).
//
// The Skool About-page CTA is FORCED onto every clip's end when the pack has a
// CTA asset. This module is pure + deterministic — no I/O — so it is fully
// unit-tested. The handler owns the async materialization + pipeline wiring.
// ---------------------------------------------------------------------------

import type { WordTimestamp } from '@shared/types';
import type { BRollDisplayMode } from '../broll-placement';
import type { OverlayBlockName, OverlayRequest } from '../hyperframes/types';
import { type BrandPack, type BrandPackAsset, BrandPackResolver } from './brand-pack';
import {
  type EvidenceBeat,
  type EvidencePacing,
  matchEvidenceBeatsHeuristic,
} from './evidence-trigger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A resolved capture to overlay on the clip. The handler converts this into a
 * BRollPlacement (materializing an image into a video clip when needed).
 */
export interface PromoCapturePlacement {
  assetId: string;
  mediaPath: string;
  /** Clip-relative start in seconds. */
  startTime: number;
  duration: number;
  display: BRollDisplayMode;
  /** For diagnostics / semantic reselection. */
  tags: string[];
  /** True for the forced end-of-clip CTA. */
  isCta: boolean;
}

export interface PromoEvidencePlan {
  templateOverlays: OverlayRequest[];
  capturePlacements: PromoCapturePlacement[];
}

export interface PromoModeOptions {
  /** Pacing overrides for the trigger matcher. */
  pacing?: EvidencePacing;
  /** Accent color for templates. Default: PRESTYJ violet. */
  accentColor?: string;
  /**
   * Force the CTA onto the clip end even if no CTA phrase was spoken.
   * Default: true (the whole funnel is the Skool CTA).
   */
  forceCta?: boolean;
  /**
   * Pre-computed beats (e.g. from the Gemini planner). When omitted, the
   * deterministic heuristic matcher is used. Beats must be clip-relative.
   */
  beats?: EvidenceBeat[];
}

// ---------------------------------------------------------------------------
// Beat → emit-shape conversion
// ---------------------------------------------------------------------------

const DEFAULT_ACCENT = '#9f75ff';

/** Below this many seconds of room, a mid-clip pop is too short to register. */
const MIN_USEFUL_DURATION = 0.8;

/** Map an asset's display mode to a hyperframes vertical position (yPos %). */
function displayToYPos(display: BRollDisplayMode): number {
  switch (display) {
    case 'split-top':
      return 28; // upper third — above the speaker
    case 'pip':
      return 22;
    case 'split-bottom':
      return 72;
    default:
      return 50; // fullscreen / centered
  }
}

/** Build a template OverlayRequest from a resolved asset + beat. */
function toTemplateOverlay(
  asset: BrandPackAsset,
  beat: EvidenceBeat,
  clipEnd: number,
  accentColor: string,
): OverlayRequest | null {
  const room = Math.max(0, clipEnd - beat.timestamp);
  if (room < MIN_USEFUL_DURATION) return null;
  const duration = Math.min(asset.durationSeconds, room);
  const props: Record<string, unknown> = {
    accentColor,
    position: { x: 50, y: displayToYPos(asset.display) },
  };
  // The agent toast reads `message`; big-stat reads `number`/`label`. We pass
  // the distilled text as `text` (a universal fallback) plus `message` so the
  // MM toast picks it up. Numeric templates keep their preset defaults unless a
  // richer planner supplies structured props later.
  if (beat.textFill) {
    props.text = beat.textFill;
    props.message = beat.textFill;
  }

  return {
    block: asset.templateId as OverlayBlockName,
    props: props as OverlayRequest['props'],
    timing: { start: beat.timestamp, duration },
  };
}

/** Build a capture placement from a resolved asset + beat. */
function toCapturePlacement(
  asset: BrandPackAsset,
  beat: EvidenceBeat,
  clipEnd: number,
): PromoCapturePlacement | null {
  if (!asset.mediaPath) return null;
  const room = Math.max(0, clipEnd - beat.timestamp);
  if (room < MIN_USEFUL_DURATION) return null;
  const duration = Math.min(asset.durationSeconds, room);
  return {
    assetId: asset.id,
    mediaPath: asset.mediaPath,
    startTime: beat.timestamp,
    duration,
    display: asset.display,
    tags: asset.tags,
    isCta: false,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Build the evidence plan for a single promo clip.
 *
 * @param words    Clip-relative word timestamps (0-based).
 * @param clipEnd  Clip duration in seconds.
 * @param pack     The active Brand Pack.
 */
export function buildPromoEvidencePlan(
  words: WordTimestamp[],
  clipEnd: number,
  pack: BrandPack,
  options: PromoModeOptions = {},
): PromoEvidencePlan {
  const accentColor = options.accentColor ?? DEFAULT_ACCENT;
  const forceCta = options.forceCta ?? true;

  const beats = options.beats ?? matchEvidenceBeatsHeuristic(words, options.pacing);
  const resolver = new BrandPackResolver(pack);

  const templateOverlays: OverlayRequest[] = [];
  const capturePlacements: PromoCapturePlacement[] = [];

  for (const beat of beats) {
    // The end CTA is handled separately below; drop mid-clip CTA beats so we
    // never double-show it.
    if (beat.category === 'cta') continue;

    const asset = resolver.resolve(beat);
    if (!asset) continue;

    if (asset.kind === 'template' && asset.templateId) {
      const overlay = toTemplateOverlay(asset, beat, clipEnd, accentColor);
      if (overlay) templateOverlays.push(overlay);
    } else if (asset.kind === 'capture') {
      const placement = toCapturePlacement(asset, beat, clipEnd);
      if (placement) capturePlacements.push(placement);
    }
  }

  // Force the Skool CTA onto the clip end.
  if (forceCta) {
    const cta = resolver.ctaAsset();
    if (cta) {
      // Never exceed the clip; prefer the asset's duration, floored to 1.5s
      // but always clamped to the clip length so short clips don't overshoot.
      const dur = Math.min(cta.durationSeconds, Math.max(1.5, clipEnd - 0.3), clipEnd);
      const startTime = Math.max(0, clipEnd - dur);
      if (cta.kind === 'capture' && cta.mediaPath) {
        capturePlacements.push({
          assetId: cta.id,
          mediaPath: cta.mediaPath,
          startTime,
          duration: dur,
          display: cta.display,
          tags: cta.tags,
          isCta: true,
        });
      } else if (cta.kind === 'template' && cta.templateId) {
        templateOverlays.push({
          block: cta.templateId as OverlayBlockName,
          props: { accentColor, position: { x: 50, y: 50 } } as OverlayRequest['props'],
          timing: { start: startTime, duration: dur },
        });
      }
    }
  }

  // Keep placements ordered by time (the b-roll engine expects ascending).
  capturePlacements.sort((a, b) => a.startTime - b.startTime);
  templateOverlays.sort((a, b) => a.timing.start - b.timing.start);

  return { templateOverlays, capturePlacements };
}
