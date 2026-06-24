import { describe, it, expect } from 'vitest'
import { enforceSpeakerOpening, MIN_FACE_LEAD_SECONDS } from './opening-guard'
import { isSpeakerFullscreen } from '../edit-styles'
import type { ResolvedSegment } from './segment-render'
import type { Archetype } from '@shared/types'

function seg(
  archetype: Archetype,
  startTime: number,
  endTime: number,
  extra: Partial<ResolvedSegment> = {}
): ResolvedSegment {
  return {
    startTime,
    endTime,
    archetype,
    zoom: { style: 'drift', intensity: 1.1 },
    transitionIn: 'hard-cut',
    ...extra
  }
}

/** Compute the clip-local time at which the first speaker-visible frame appears. */
function firstSpeakerLocalTime(segments: ResolvedSegment[]): number | null {
  let cumulative = 0
  for (const s of segments) {
    if (isSpeakerFullscreen(s.archetype)) return cumulative
    cumulative += s.endTime - s.startTime
  }
  return null
}

describe('enforceSpeakerOpening', () => {
  it('shows a speaker within 1.0s when first segment is a fullscreen-image card', () => {
    const input = [
      seg('fullscreen-image', 10, 14, { videoPath: '/tmp/broll.mp4' }),
      seg('talking-head', 14, 18)
    ]
    const out = enforceSpeakerOpening(input)

    const lead = firstSpeakerLocalTime(out)
    expect(lead).not.toBeNull()
    expect(lead!).toBeLessThanOrEqual(MIN_FACE_LEAD_SECONDS)
    // Specifically, the opening frame (local t=0) is a speaker.
    expect(lead).toBe(0)
    expect(isSpeakerFullscreen(out[0].archetype)).toBe(true)
  })

  it('splits a long card opening and delays the media past the lead', () => {
    const input = [
      seg('fullscreen-image', 0, 5, { videoPath: '/tmp/broll.mp4' }),
      seg('talking-head', 5, 9)
    ]
    const out = enforceSpeakerOpening(input)

    // Lead speaker segment covers exactly the first MIN_FACE_LEAD_SECONDS.
    expect(out[0].archetype).toBe('talking-head')
    expect(out[0].endTime - out[0].startTime).toBeCloseTo(MIN_FACE_LEAD_SECONDS)
    expect(out[0].videoPath).toBeUndefined()

    // The card (with its media) is clamped to start after the lead.
    expect(out[1].archetype).toBe('fullscreen-image')
    expect(out[1].startTime).toBeCloseTo(0 + MIN_FACE_LEAD_SECONDS)
    expect(out[1].videoPath).toBe('/tmp/broll.mp4')

    // No media overlay appears before the lead.
    const cardLocalStart = out[0].endTime - out[0].startTime
    expect(cardLocalStart).toBeGreaterThanOrEqual(MIN_FACE_LEAD_SECONDS)
  })

  it('demotes a short card opening entirely to the speaker', () => {
    const input = [
      seg('fullscreen-quote', 0, 0.6),
      seg('talking-head', 0.6, 4)
    ]
    const out = enforceSpeakerOpening(input)

    expect(out).toHaveLength(2)
    expect(out[0].archetype).toBe('talking-head')
    expect(out[0].startTime).toBe(0)
    expect(out[0].endTime).toBe(0.6)
    expect(firstSpeakerLocalTime(out)).toBe(0)
  })

  it('is a no-op when the clip already opens on a speaker archetype', () => {
    const input = [
      seg('tight-punch', 0, 3),
      seg('fullscreen-image', 3, 6, { videoPath: '/tmp/broll.mp4' })
    ]
    const out = enforceSpeakerOpening(input)
    expect(out).toBe(input)
  })

  it('handles an empty segment list', () => {
    expect(enforceSpeakerOpening([])).toEqual([])
  })
})
