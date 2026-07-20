// ---------------------------------------------------------------------------
// Opening guard — guarantee a speaker (talking-head) opening for segmented clips
// ---------------------------------------------------------------------------
//
// A segmented clip can be authored to open on a non-speaker archetype (a
// fullscreen image / quote card, or a split-image where the speaker only
// occupies part of the frame). When that happens the first frames of the
// clip show no person, which hurts retention and looks like a static graphic.
//
// This guard inspects the first segment and, when it is NOT a speaker
// (talking-head) archetype, enforces a speaker-visible opening so the viewer
// sees a face within the first `MIN_FACE_LEAD_SECONDS`. Any media/card overlay
// that would have started at t=0 is pushed back to begin no earlier than that
// lead so it can never preempt the speaker opening.
//
// It is intentionally additive: it only mutates the segment list, never the
// downstream feature pipeline, and is a no-op when the clip already opens on a
// speaker archetype.
// ---------------------------------------------------------------------------

import type { Archetype } from '@shared/types';
import { isSpeakerFullscreen } from '../edit-styles';
import { ARCHETYPE_DEFAULT_TRANSITION_IN } from '../edit-styles/shared/archetypes';
import type { ResolvedSegment } from './segment-render';

/**
 * Minimum amount of time (seconds) a speaker/talking-head must be visible at
 * the very start of every segmented clip. The first frames up to this lead are
 * guaranteed to show a face; media/card overlays cannot start before it.
 */
export const MIN_FACE_LEAD_SECONDS = 1.0;

/** The archetype every enforced opening collapses to. It is always a speaker
 *  archetype (`isSpeakerFullscreen('talking-head') === true`). */
const SPEAKER_OPENING_ARCHETYPE: Archetype = 'talking-head';

/**
 * Is this segment a speaker opening? `talking-head`, `tight-punch`, and
 * `wide-breather` all frame a full-screen view of the speaker, so any of them
 * shows a face from frame 0. Everything else (quote cards, fullscreen image,
 * split-image, quote-lower) is treated as a non-speaker opening.
 */
function opensOnSpeaker(archetype: Archetype): boolean {
  return isSpeakerFullscreen(archetype);
}

/**
 * Enforce a speaker-visible opening for a segmented clip.
 *
 * Returns a new segment array (the input is not mutated). When the first
 * segment already opens on a speaker archetype, the input segments are
 * returned unchanged.
 *
 * When the first segment is a non-speaker archetype:
 *  - If it is longer than `minLead`, it is split: a `talking-head` lead
 *    covering `[start, start + minLead]` is prepended, and the original
 *    archetype (carrying any b-roll `videoPath`) is clamped to start at
 *    `start + minLead`. This delays the media/card so it begins no earlier
 *    than the lead.
 *  - If it is shorter than (or equal to) `minLead`, the whole first segment is
 *    demoted to `talking-head` and any media reference is dropped, so the
 *    speaker fills the entire opening segment.
 *
 * @param segments  Resolved segments in source-time order (first = opening).
 * @param minLead   Minimum face-lead in seconds (defaults to MIN_FACE_LEAD_SECONDS).
 */
export function enforceSpeakerOpening(
  segments: ResolvedSegment[],
  minLead: number = MIN_FACE_LEAD_SECONDS,
): ResolvedSegment[] {
  if (segments.length === 0) return segments;

  const first = segments[0];
  if (opensOnSpeaker(first.archetype)) {
    // Already opens on the speaker — nothing to do.
    return segments;
  }

  const rest = segments.slice(1);
  const firstDuration = first.endTime - first.startTime;

  // Build a speaker lead segment from `first`, stripped of any media so the
  // face is unobstructed. transitionIn is the talking-head default (ignored
  // on the opening segment anyway).
  const speakerLead: ResolvedSegment = {
    ...first,
    archetype: SPEAKER_OPENING_ARCHETYPE,
    transitionIn: ARCHETYPE_DEFAULT_TRANSITION_IN[SPEAKER_OPENING_ARCHETYPE],
    videoPath: undefined,
    imagePath: undefined,
    fallbackReason: undefined,
  };

  // Short opening: demote the entire first segment to the speaker.
  if (firstDuration <= minLead) {
    speakerLead.startTime = first.startTime;
    speakerLead.endTime = first.endTime;
    return [speakerLead, ...rest];
  }

  // Long opening: split into a speaker lead + the clamped original card so the
  // media/card overlay starts no earlier than `minLead` into the clip.
  speakerLead.startTime = first.startTime;
  speakerLead.endTime = first.startTime + minLead;

  const clampedCard: ResolvedSegment = {
    ...first,
    startTime: first.startTime + minLead,
    endTime: first.endTime,
  };

  return [speakerLead, clampedCard, ...rest];
}
