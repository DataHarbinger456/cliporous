import { describe, it, expect } from 'vitest'
import {
  computeBusyIntervals,
  computeIdleIntervals,
  scheduleIdleZooms,
  idleZoomShotConfigs
} from './auto-zoom.feature'
import type { RenderClipJob } from '../types'
import type { ZoomSettings } from '../../auto-zoom'
import type { BRollPlacement } from '../../broll-placement'

const ENABLED: ZoomSettings = {
  enabled: true,
  mode: 'reactive',
  intensity: 'subtle',
  intervalSeconds: 4
}

function brollWindow(startTime: number, duration: number): BRollPlacement {
  return {
    startTime,
    duration,
    videoPath: '/tmp/broll.mp4',
    displayMode: 'fullscreen',
    transition: 'hard-cut',
    pipSize: 0.25,
    pipPosition: 'bottom-right',
    keyword: 'test'
  }
}

function makeJob(overrides: Partial<RenderClipJob> = {}): RenderClipJob {
  return {
    clipId: 'idle-test',
    sourceVideoPath: '/tmp/source.mp4',
    startTime: 0,
    endTime: 10,
    ...overrides
  } as RenderClipJob
}

describe('auto-zoom idle scheduling', () => {
  it('schedules idle zooms on both gaps around a single b-roll window (3–5s)', () => {
    const job = makeJob({ brollPlacements: [brollWindow(3, 2)] })

    const busy = computeBusyIntervals(job, 10)
    expect(busy).toEqual([{ start: 3, end: 5 }])

    const idle = computeIdleIntervals(busy, 10)
    expect(idle).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 10 }
    ])

    const shots = scheduleIdleZooms(job, ENABLED, 10)
    expect(shots).toHaveLength(2)
    expect(shots[0]).toMatchObject({ start: 0, end: 3 })
    expect(shots[1]).toMatchObject({ start: 5, end: 10 })
    // Consecutive idle zooms stagger direction so they don't push identically.
    expect(shots[0].direction).not.toBe(shots[1].direction)
  })

  it('produces a piecewise zoom filter from the scheduled idle shots', () => {
    const shots = scheduleIdleZooms(makeJob({ brollPlacements: [brollWindow(3, 2)] }), ENABLED, 10)
    const configs = idleZoomShotConfigs(shots)
    expect(configs).toHaveLength(2)
    // Staggered interval reuses the existing low-intensity ken-burns motion.
    expect(configs[0].zoom).toMatchObject({ mode: 'ken-burns', intensity: 'subtle' })
    expect(configs[0].zoom!.intervalSeconds).not.toBe(configs[1].zoom!.intervalSeconds)
  })

  it('schedules nothing when every idle gap is shorter than 2.5s', () => {
    // A wide busy window leaves only sub-threshold gaps (2.4s each).
    const job = makeJob({ brollPlacements: [brollWindow(2.4, 5.2)] })

    const idle = computeIdleIntervals(computeBusyIntervals(job, 10), 10)
    expect(idle).toEqual([
      { start: 0, end: 2.4 },
      { start: 7.6, end: 10 }
    ])

    expect(scheduleIdleZooms(job, ENABLED, 10)).toHaveLength(0)
  })

  it('is a no-op when there are no overlays at all (global zoom owns the clip)', () => {
    const job = makeJob()
    expect(computeBusyIntervals(job, 10)).toHaveLength(0)
    expect(scheduleIdleZooms(job, ENABLED, 10)).toHaveLength(0)
  })

  it('is a no-op when the clip is fully busy (no idle intervals)', () => {
    const job = makeJob({ brollPlacements: [brollWindow(0, 10)] })
    expect(computeIdleIntervals(computeBusyIntervals(job, 10), 10)).toHaveLength(0)
    expect(scheduleIdleZooms(job, ENABLED, 10)).toHaveLength(0)
  })

  it('respects controls: disabled auto-zoom or per-clip override → no zooms', () => {
    const job = makeJob({ brollPlacements: [brollWindow(3, 2)] })

    expect(scheduleIdleZooms(job, { ...ENABLED, enabled: false }, 10)).toHaveLength(0)
    expect(scheduleIdleZooms(job, undefined, 10)).toHaveLength(0)

    const overridden = makeJob({
      brollPlacements: [brollWindow(3, 2)],
      clipOverrides: { enableAutoZoom: false }
    })
    expect(scheduleIdleZooms(overridden, ENABLED, 10)).toHaveLength(0)
  })

  it('skips an idle interval already covered by reactive emphasis keyframes', () => {
    const job = makeJob({
      brollPlacements: [brollWindow(3, 2)],
      // Emphasis fills most of the [0,3] idle stretch → that one is skipped.
      emphasisKeyframes: [{ time: 0, end: 2.6, level: 'emphasis' }]
    })

    const shots = scheduleIdleZooms(job, ENABLED, 10)
    expect(shots).toHaveLength(1)
    expect(shots[0]).toMatchObject({ start: 5, end: 10 })
  })
})
