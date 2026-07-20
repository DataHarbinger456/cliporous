// ---------------------------------------------------------------------------
// Auto-Zoom feature — Ken Burns-style zoom/pan via crop+scale filter
// ---------------------------------------------------------------------------

import type { ShotStyleConfig, ZoomIntensity, ZoomMode } from '@shared/types';
import type { EmphasisKeyframe, ZoomSettings } from '../../auto-zoom';
import { generatePiecewiseZoomFilter, generateZoomFilter } from '../../auto-zoom';
import type { RenderBatchOptions, RenderClipJob } from '../types';
import type { FilterContext, PrepareResult, RenderFeature } from './feature';

// `job.hyperframesOverlays` is added to RenderClipJob via module augmentation in
// hyperframes-overlay.feature.ts (already part of the pipeline compilation), so
// it's typed here without importing that file directly.

// ---------------------------------------------------------------------------
// Idle talking-head punch-in zoom — named constants
// ---------------------------------------------------------------------------
//
// When a clip has overlay/b-roll/hyperframe/transition windows, those stretches
// carry their own motion. The complement — plain talking-head with nothing on
// screen — is static and disengaging. We schedule a gentle, low-intensity
// ken-burns punch-in over each sufficiently long idle stretch so the frame
// always has subtle motion. These are deliberately small; we reuse the
// existing 'subtle' intensity and never invent a new aggressive zoom.

/** Idle stretches shorter than this (seconds) are left static — not worth a zoom. */
const MIN_IDLE_FOR_ZOOM_SECONDS = 2.5;

/** Idle zooms reuse the existing ken-burns breathing motion. */
const IDLE_ZOOM_MODE: ZoomMode = 'ken-burns';

/** Idle zooms reuse the existing lowest-intensity setting (±5%, no drift). */
const IDLE_ZOOM_INTENSITY: ZoomIntensity = 'subtle';

/**
 * Stagger: consecutive idle zooms alternate between a slow push ('in') and a
 * quicker breathe ('hold') by using different ken-burns intervals, so they
 * don't all push the same way back-to-back.
 */
const IDLE_ZOOM_INTERVAL_IN_SECONDS = 6;
const IDLE_ZOOM_INTERVAL_HOLD_SECONDS = 3;

/** Busy pad (seconds) marked on either side of each shot-transition boundary. */
const SHOT_TRANSITION_BUSY_PAD_SECONDS = 0.5;

/**
 * If reactive emphasis keyframes already cover at least this fraction of an
 * idle interval, that interval already has motion — skip it (no double-zoom).
 */
const IDLE_KEYFRAME_COVERAGE_FRACTION = 0.5;

// ---------------------------------------------------------------------------
// Idle-interval scheduling (pure, unit-tested)
// ---------------------------------------------------------------------------

export interface TimeInterval {
  start: number;
  end: number;
}

export interface IdleZoomShot {
  start: number;
  end: number;
  /** Staggered motion flavour so consecutive idle zooms don't push identically. */
  direction: 'in' | 'hold';
}

/** Merge overlapping/adjacent intervals into a sorted, disjoint union. */
function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  const valid = intervals.filter((iv) => iv.end > iv.start).sort((a, b) => a.start - b.start);
  const merged: TimeInterval[] = [];
  for (const iv of valid) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
    } else {
      merged.push({ start: iv.start, end: iv.end });
    }
  }
  return merged;
}

/**
 * Compute the clip's "busy" intervals (clip-relative seconds): the union of all
 * b-roll, hyperframe/card overlay, and shot-transition windows. Any media or
 * card overlay that means "not a plain talking head" lands here.
 */
export function computeBusyIntervals(job: RenderClipJob, clipDuration: number): TimeInterval[] {
  const busy: TimeInterval[] = [];
  const clamp = (s: number, e: number): TimeInterval => ({
    start: Math.max(0, Math.min(clipDuration, s)),
    end: Math.max(0, Math.min(clipDuration, e)),
  });

  // B-roll / media overlays (clip-relative, 0-based).
  for (const p of job.brollPlacements ?? []) {
    busy.push(clamp(p.startTime, p.startTime + p.duration));
  }

  // HyperFrames / card overlays (clip-relative via timing.start/duration).
  for (const o of job.hyperframesOverlays ?? []) {
    busy.push(clamp(o.timing.start, o.timing.start + o.timing.duration));
  }

  // Shot-transition boundaries → short busy windows so we don't zoom across a cut.
  const shots = job.shotStyleConfigs ?? [];
  if (shots.length >= 2) {
    const sorted = [...shots].sort((a, b) => a.shotIndex - b.shotIndex);
    for (let i = 0; i < sorted.length - 1; i++) {
      const outgoing = sorted[i];
      const incoming = sorted[i + 1];
      if (!outgoing || !incoming) continue;
      const transition = outgoing.transitionOut ?? incoming.transitionIn;
      if (!transition || transition.type === 'none') continue;
      const boundary = outgoing.endTime - (job.startTime ?? 0);
      busy.push(
        clamp(
          boundary - SHOT_TRANSITION_BUSY_PAD_SECONDS,
          boundary + SHOT_TRANSITION_BUSY_PAD_SECONDS,
        ),
      );
    }
  }

  return mergeIntervals(busy);
}

/** Complement of the busy intervals within [0, clipDuration] = idle stretches. */
export function computeIdleIntervals(busy: TimeInterval[], clipDuration: number): TimeInterval[] {
  const merged = mergeIntervals(busy);
  const idle: TimeInterval[] = [];
  let cursor = 0;
  for (const b of merged) {
    if (b.start > cursor) idle.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < clipDuration) idle.push({ start: cursor, end: clipDuration });
  return idle;
}

/** Fraction of `interval` covered by the union of emphasis-keyframe windows. */
function keyframeCoverage(keyframes: EmphasisKeyframe[], interval: TimeInterval): number {
  const span = interval.end - interval.start;
  if (span <= 0) return 0;
  const windows = mergeIntervals(
    keyframes.map((kf) => ({
      start: Math.max(interval.start, kf.time),
      end: Math.min(interval.end, kf.end),
    })),
  );
  let covered = 0;
  for (const w of windows) covered += Math.max(0, w.end - w.start);
  return covered / span;
}

/**
 * Schedule gentle idle punch-in zooms for a clip. Returns one staggered shot
 * per idle stretch longer than MIN_IDLE_FOR_ZOOM_SECONDS. Returns [] when
 * auto-zoom is disabled (globally or per-clip) or there are no idle stretches.
 */
export function scheduleIdleZooms(
  job: RenderClipJob,
  autoZoom: ZoomSettings | undefined | null,
  clipDuration: number,
): IdleZoomShot[] {
  // Respect existing controls — global disable or per-clip override wins.
  if (!autoZoom?.enabled) return [];
  if (job.clipOverrides?.enableAutoZoom === false) return [];
  if (clipDuration <= 0) return [];

  const busy = computeBusyIntervals(job, clipDuration);
  // No overlays at all → the global zoom already owns the whole clip; idle
  // punch-ins only exist to fill the static gaps *between* overlays.
  if (busy.length === 0) return [];

  const idle = computeIdleIntervals(busy, clipDuration);
  const keyframes = job.emphasisKeyframes ?? [];

  const shots: IdleZoomShot[] = [];
  let index = 0;
  for (const iv of idle) {
    if (iv.end - iv.start <= MIN_IDLE_FOR_ZOOM_SECONDS) continue;
    // Reactive emphasis already moves the frame here — don't double-zoom.
    if (keyframeCoverage(keyframes, iv) >= IDLE_KEYFRAME_COVERAGE_FRACTION) continue;
    shots.push({
      start: iv.start,
      end: iv.end,
      direction: index % 2 === 0 ? 'in' : 'hold',
    });
    index++;
  }
  return shots;
}

/** Map scheduled idle zooms onto per-shot zoom configs for the piecewise filter. */
export function idleZoomShotConfigs(shots: IdleZoomShot[]): ShotStyleConfig[] {
  return shots.map((s, i) => ({
    shotIndex: i,
    startTime: s.start,
    endTime: s.end,
    zoom: {
      mode: IDLE_ZOOM_MODE,
      intensity: IDLE_ZOOM_INTENSITY,
      intervalSeconds:
        s.direction === 'in' ? IDLE_ZOOM_INTERVAL_IN_SECONDS : IDLE_ZOOM_INTERVAL_HOLD_SECONDS,
    },
  }));
}

/**
 * Applies subtle Ken Burns-style zoom and pan movements using FFmpeg's crop
 * filter with time-based expressions. The zoom filter is inserted into the
 * base video filter chain AFTER `scale` and BEFORE any subtitle burn-in.
 *
 * Unlike overlay features (which run as separate FFmpeg passes), auto-zoom is
 * part of the base video filter chain via `videoFilter()`.
 */
class AutoZoomFeature implements RenderFeature {
  readonly name = 'auto-zoom';

  /**
   * Effective zoom settings resolved per-clip during prepare().
   * Keyed by clipId so concurrent renders don't clash.
   */
  private clipZoomSettings = new Map<string, ZoomSettings | null>();

  async prepare(
    job: RenderClipJob,
    batchOptions: RenderBatchOptions,
    _onProgress?: (message: string, percent: number) => void,
  ): Promise<PrepareResult> {
    const globalSettings = batchOptions.autoZoom;

    // No global auto-zoom configured → skip
    if (!globalSettings?.enabled) {
      this.clipZoomSettings.set(job.clipId, null);
      return { tempFiles: [], modified: false };
    }

    // Per-clip override can disable auto-zoom for this clip
    if (job.clipOverrides?.enableAutoZoom === false) {
      this.clipZoomSettings.set(job.clipId, null);
      console.log(`[AutoZoom] Disabled for clip ${job.clipId} (per-clip override)`);
      return { tempFiles: [], modified: false };
    }

    // Store the effective settings for videoFilter() to consume
    this.clipZoomSettings.set(job.clipId, globalSettings);

    const clipDuration = job.endTime - job.startTime;

    // For reactive mode, emphasis keyframes should already be populated by the
    // upstream word-emphasis feature. Log availability for diagnostics.
    if (globalSettings.mode === 'reactive') {
      if (job.emphasisKeyframes && job.emphasisKeyframes.length > 0) {
        console.log(
          `[AutoZoom] Reactive mode — using ${job.emphasisKeyframes.length} emphasis keyframes ` +
            `from upstream feature for clip ${job.clipId}`,
        );
      } else {
        // Fallback: no emphasis data available (e.g. no word timestamps)
        console.log(
          `[AutoZoom] Reactive mode — no emphasis keyframes available for clip ${job.clipId}, ` +
            `falling back to ken-burns behavior`,
        );
      }
    }

    console.log(
      `[AutoZoom] Enabled — mode: ${globalSettings.mode}, intensity: ${globalSettings.intensity}, ` +
        `interval: ${globalSettings.intervalSeconds}s, clip duration: ${clipDuration.toFixed(1)}s`,
    );

    return { tempFiles: [], modified: true };
  }

  videoFilter(job: RenderClipJob, context: FilterContext): string | null {
    const settings = this.clipZoomSettings.get(job.clipId);
    if (!settings) return null;

    try {
      let filter: string | undefined;

      // When per-shot style configs are present with zoom overrides, use piecewise zoom
      if (job.shotStyleConfigs && job.shotStyleConfigs.length > 0) {
        const shotsWithZoom = job.shotStyleConfigs.filter(
          (s) => s.zoom !== null && s.zoom !== undefined,
        );
        if (shotsWithZoom.length > 0) {
          filter = generatePiecewiseZoomFilter(
            context.clipDuration,
            settings,
            job.shotStyleConfigs,
            0.38,
            context.targetWidth,
            context.targetHeight,
            job.wordTimestamps,
            job.emphasisKeyframes,
          );
        }
      }

      // Idle punch-in: when no per-shot zoom is configured, fill plain
      // talking-head stretches (no b-roll/hyperframe/transition) with a gentle
      // staggered ken-burns push. Busy stretches keep the global behavior.
      if (!filter) {
        const idleShots = scheduleIdleZooms(job, settings, context.clipDuration);
        if (idleShots.length > 0) {
          filter = generatePiecewiseZoomFilter(
            context.clipDuration,
            settings,
            idleZoomShotConfigs(idleShots),
            0.38,
            context.targetWidth,
            context.targetHeight,
            job.wordTimestamps,
            job.emphasisKeyframes,
          );
          console.log(
            `[AutoZoom] Idle punch-in — ${idleShots.length} idle interval(s) ` +
              `scheduled for clip ${job.clipId}`,
          );
        }
      }

      // Fall back to uniform zoom for the entire clip
      if (!filter) {
        filter = generateZoomFilter(
          context.clipDuration,
          settings,
          0.38,
          context.targetWidth,
          context.targetHeight,
          job.wordTimestamps,
          job.emphasisKeyframes,
        );
      }

      // Clean up the stored settings now that we've consumed them
      this.clipZoomSettings.delete(job.clipId);

      return filter || null;
    } catch (err) {
      console.error(
        `[AutoZoom] Filter generation failed for clip ${job.clipId}, skipping zoom:`,
        err,
      );
      this.clipZoomSettings.delete(job.clipId);
      return null;
    }
  }
}

export const autoZoomFeature = new AutoZoomFeature();
