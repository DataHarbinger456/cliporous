// ---------------------------------------------------------------------------
// Promo Mode — per-clip render preparation
// ---------------------------------------------------------------------------
//
// Bridges the pure orchestrator (promo-mode.ts) to the render pipeline's job
// shape. For one clip job it:
//
//   1. Slices word timestamps to the clip and makes them 0-based.
//   2. Builds the evidence plan (template overlays + capture placements).
//   3. Materializes capture placements into video clips (images → Ken Burns
//      video via imageToVideoClip; existing video files pass straight through)
//      and attaches them as BRollPlacement[] on the job.
//   4. Attaches template overlays as HyperFrames overlay requests on the job.
//
// The existing broll + hyperframes features then render/composite everything —
// no changes to those features are needed. Fail-safe: any capture that can't be
// materialized is skipped, never aborting the clip.
// ---------------------------------------------------------------------------

import { extname } from 'node:path';
import { imageToVideoClip } from '../broll-image-overlay';
import type { BRollPlacement } from '../broll-placement';
import type { OverlayRequest } from '../hyperframes/types';
import type { RenderClipJob } from '../render/types';
import type { BrandPack } from './brand-pack';
import { buildPromoEvidencePlan, type PromoCapturePlacement } from './promo-mode';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.m4v']);

function isVideoFile(path: string): boolean {
  return VIDEO_EXTENSIONS.has(extname(path).toLowerCase());
}

/** Convert a resolved capture placement into a pipeline BRollPlacement. */
async function materializeCapture(
  placement: PromoCapturePlacement,
): Promise<BRollPlacement | null> {
  try {
    // Floating-card scales the source into a rounded card, so its image must
    // keep its native aspect (a landscape screenshot must not be stretched
    // into portrait). Other modes fill the locked 1080×1920 canvas.
    const preserveAspect = placement.display === 'floating-card';
    const videoPath = isVideoFile(placement.mediaPath)
      ? placement.mediaPath
      : await imageToVideoClip(placement.mediaPath, placement.duration, undefined, {
          preserveAspect,
        });

    return {
      startTime: placement.startTime,
      duration: placement.duration,
      videoPath,
      displayMode: placement.display,
      transition: 'crossfade',
      pipSize: 0.28,
      pipPosition: 'bottom-right',
      keyword: placement.assetId,
      source: 'ai-generated',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Promo] Capture "${placement.assetId}" failed to materialize: ${msg}`);
    return null;
  }
}

export interface PreparePromoJobOptions {
  accentColor?: string;
  forceCta?: boolean;
}

/**
 * Prepare a single clip job for Promo Mode. Mutates the job in place, setting
 * `brollPlacements` (captures) and `hyperframesOverlays` (templates). Returns a
 * small summary for progress reporting.
 */
export async function preparePromoJob(
  job: RenderClipJob,
  pack: BrandPack,
  options: PreparePromoJobOptions = {},
): Promise<{ overlays: number; captures: number }> {
  const clipEnd = job.endTime - job.startTime;
  const clipWords = (job.wordTimestamps ?? [])
    .filter((w) => w.start >= job.startTime && w.end <= job.endTime)
    .map((w) => ({
      text: w.text,
      start: w.start - job.startTime,
      end: w.end - job.startTime,
    }));

  const plan = buildPromoEvidencePlan(clipWords, clipEnd, pack, {
    ...(options.accentColor ? { accentColor: options.accentColor } : {}),
    ...(options.forceCta !== undefined ? { forceCta: options.forceCta } : {}),
  });

  // Materialize captures → BRollPlacement[] (drop any that fail).
  const placements: BRollPlacement[] = [];
  for (const capture of plan.capturePlacements) {
    const placement = await materializeCapture(capture);
    if (placement) placements.push(placement);
  }

  if (placements.length > 0) {
    job.brollPlacements = [...(job.brollPlacements ?? []), ...placements];
  }

  if (plan.templateOverlays.length > 0) {
    const overlays: OverlayRequest[] = [
      ...(job.hyperframesOverlays ?? []),
      ...plan.templateOverlays,
    ];
    job.hyperframesOverlays = overlays;
  }

  return { overlays: plan.templateOverlays.length, captures: placements.length };
}
