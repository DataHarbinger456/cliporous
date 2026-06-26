import { describe, expect, it } from 'vitest'

import { classifyRenderError } from './render-error-map'

describe('classifyRenderError', () => {
  it('maps disk-full (ENOSPC) to an actionable message', () => {
    const r = classifyRenderError('ffmpeg exited with code 1: ...\nav_interleaved_write_frame(): No space left on device')
    expect(r.message).toMatch(/disk ran out of space/i)
    expect(r.suggestion).toMatch(/free up disk space/i)
    expect(r.details).toContain('No space left on device')
  })

  it('maps missing audio stream', () => {
    const r = classifyRenderError("ffmpeg exited with code 1: Stream specifier ':a' in filtergraph matches no streams")
    expect(r.message).toMatch(/no audio track/i)
    expect(r.suggestion).toMatch(/includes audio/i)
  })

  it('maps corrupt/unreadable source (moov atom)', () => {
    const r = classifyRenderError('ffmpeg exited with code 1: moov atom not found')
    expect(r.message).toMatch(/couldn't be read|missing or corrupt/i)
    expect(r.suggestion).toMatch(/re-download|re-export/i)
  })

  it('maps unsupported codec', () => {
    const r = classifyRenderError('ffmpeg exited with code 1: Unknown encoder libfoo')
    expect(r.message).toMatch(/codec/i)
    expect(r.suggestion).toMatch(/H\.264|MP4/i)
  })

  it('maps permission denied', () => {
    const r = classifyRenderError('ffmpeg exited with code 1: out.mp4: Permission denied')
    expect(r.message).toMatch(/permission denied/i)
  })

  it('gives a generic friendly summary for unrecognised ffmpeg output, keeping raw details', () => {
    const raw = 'ffmpeg exited with code 1: some unrecognised filter graph error xyz'
    const r = classifyRenderError(raw)
    expect(r.message).toMatch(/failed in the video engine/i)
    expect(r.details).toBe(raw)
  })

  it('passes through already-human errors without a details blob', () => {
    const r = classifyRenderError('Filler removal removed every segment; clip is empty.')
    expect(r.message).toBe('Filler removal removed every segment; clip is empty.')
    expect(r.details).toBeUndefined()
    expect(r.suggestion).toBeUndefined()
  })

  it('prioritises specific signatures over generic ones', () => {
    // contains both a generic "Invalid data" and a specific ENOSPC — ENOSPC wins
    const r = classifyRenderError('Invalid data found when processing input ... No space left on device')
    expect(r.message).toMatch(/disk ran out of space/i)
  })
})
