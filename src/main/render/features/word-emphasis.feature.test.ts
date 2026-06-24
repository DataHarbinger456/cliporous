import { describe, it, expect } from 'vitest'
import { wordEmphasisFeature } from './word-emphasis.feature'
import type { RenderClipJob, RenderBatchOptions } from '../types'
import type { EmphasizedWord } from '../../word-emphasis'
import { MIN_EMPHASIS_DWELL_SECONDS } from '../../emphasis-dwell'

// Build a minimal RenderClipJob that drives the word-emphasis feature's
// keyframe computation. `wordEmphasis` is pre-set (clip-relative) so the
// feature skips heuristic/AI analysis and only exercises the dwell logic.
function makeJob(wordEmphasis: EmphasizedWord[], clipEnd: number): RenderClipJob {
  return {
    clipId: 'test-clip',
    startTime: 0,
    endTime: clipEnd,
    // Word timestamps gate the feature (must be non-empty and within range).
    wordTimestamps: wordEmphasis.map((w) => ({
      text: w.text,
      start: w.start,
      end: w.end
    })),
    wordEmphasis
  } as unknown as RenderClipJob
}

const batchOptions = {} as RenderBatchOptions

describe('word-emphasis feature — minimum emphasis dwell', () => {
  it('extends a 0.15s emphasised word to a >= MIN_EMPHASIS_DWELL window', async () => {
    const job = makeJob(
      [{ text: 'NEVER', start: 1.0, end: 1.15, emphasis: 'emphasis' }],
      5
    )

    await wordEmphasisFeature.prepare!(job, batchOptions)

    const kfs = job.emphasisKeyframes ?? []
    expect(kfs).toHaveLength(1)

    const window = kfs[0].end - kfs[0].time
    expect(window).toBeGreaterThanOrEqual(MIN_EMPHASIS_DWELL_SECONDS - 1e-9)
    // Raw word was only 0.15s; dwell should have stretched it well past that.
    expect(kfs[0].end).toBeGreaterThanOrEqual(1.0 + MIN_EMPHASIS_DWELL_SECONDS - 1e-9)
  })

  it('does not let back-to-back emphasised words overlap', async () => {
    const job = makeJob(
      [
        { text: 'STOP', start: 1.0, end: 1.15, emphasis: 'emphasis' },
        { text: 'NOW', start: 1.2, end: 1.35, emphasis: 'supersize' }
      ],
      5
    )

    await wordEmphasisFeature.prepare!(job, batchOptions)

    const kfs = (job.emphasisKeyframes ?? []).slice().sort((a, b) => a.time - b.time)
    expect(kfs).toHaveLength(2)

    // First window must end strictly before the second word begins.
    expect(kfs[0].end).toBeLessThanOrEqual(kfs[1].time)
    expect(kfs[0].end).toBeLessThan(kfs[1].time + 1e-9)
    // Second (last) word has room, so it keeps the full dwell.
    expect(kfs[1].end - kfs[1].time).toBeGreaterThanOrEqual(MIN_EMPHASIS_DWELL_SECONDS - 1e-9)
  })

  it('never extends an emphasis window past the clip end', async () => {
    const job = makeJob(
      [{ text: 'WOW', start: 1.7, end: 1.85, emphasis: 'emphasis' }],
      2.0
    )

    await wordEmphasisFeature.prepare!(job, batchOptions)

    const kfs = job.emphasisKeyframes ?? []
    expect(kfs).toHaveLength(1)
    expect(kfs[0].end).toBeLessThanOrEqual(2.0)
  })
})
