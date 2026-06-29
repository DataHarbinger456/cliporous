// ---------------------------------------------------------------------------
// applyDelosCards stats wiring (RF-008).
//
// Proves the card pass reports what actually rendered instead of swallowing
// failures: rendered vs. dropped (a surviving card whose overlay render failed),
// and aiText vs. fallbackText (Gemini pass vs. deterministic offline text).
//
// The renderer, compositor, and card-content builder are mocked so the test
// stays in the node env with no Remotion / FFmpeg / Gemini dependency.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DelosCardPlacement } from '@shared/types'
import type { OverlayRenderResult } from '../../hyperframes/types'

// renderOverlays is dynamically imported inside applyDelosCards.
const renderOverlaysMock = vi.fn<(...args: unknown[]) => Promise<OverlayRenderResult[]>>()
vi.mock('../../hyperframes/renderer', () => ({
  renderOverlays: (...args: unknown[]) => renderOverlaysMock(...args)
}))

// The final composite is a side-effect we don't exercise here.
const compositeMock = vi.fn<(...args: unknown[]) => Promise<void>>()
vi.mock('../longform-encode', () => ({
  compositeDelosCards: (...args: unknown[]) => compositeMock(...args)
}))

// Control the AI-vs-offline origin per card via the source field.
const buildSourceMock = vi.fn<(...args: unknown[]) => Promise<unknown>>()
vi.mock('../../hyperframes/card-content', () => ({
  buildCardContentWithSource: (...args: unknown[]) => buildSourceMock(...args)
}))

const { applyDelosCards } = await import('./delos-card.feature')

function card(startTime: number, endTime: number): DelosCardPlacement {
  return { kind: 'delos-console', startTime, endTime }
}

function mov(movPath: string): OverlayRenderResult {
  return { movPath, duration: 5, width: 1920, height: 1080 }
}

const SPEAKER = [{ start: 0, end: 60 }]
const BASE_OPTS = {
  inputPath: '/tmp/in.mp4',
  outputPath: '/tmp/out.mp4',
  speakerRanges: SPEAKER,
  width: 1920,
  height: 1080,
  fps: 30,
  qualityParams: {},
  apiKey: 'test-key'
}

beforeEach(() => {
  renderOverlaysMock.mockReset()
  compositeMock.mockReset()
  buildSourceMock.mockReset()
  compositeMock.mockResolvedValue(undefined)
})

describe('applyDelosCards — RF-008 stats', () => {
  it('counts a dropped card (survived filtering, failed to render) and ai/fallback text', async () => {
    // Three cards, all inside the speaker range.
    const cards = [card(2, 7), card(12, 17), card(22, 27)]
    // Text origin: ai, ai, fallback.
    buildSourceMock
      .mockResolvedValueOnce({ content: { kind: 'delos-console' }, source: 'ai' })
      .mockResolvedValueOnce({ content: { kind: 'delos-console' }, source: 'ai' })
      .mockResolvedValueOnce({ content: { kind: 'delos-console' }, source: 'fallback' })
    // Render: first ok, second FAILED (empty movPath), third ok.
    renderOverlaysMock.mockResolvedValueOnce([mov('/tmp/a.mov'), mov(''), mov('/tmp/c.mov')])

    const { outputPath, stats } = await applyDelosCards({ ...BASE_OPTS, cards })

    expect(stats).toEqual({ rendered: 2, dropped: 1, aiText: 2, fallbackText: 1 })
    // Two overlays survived → composite ran and the final path is returned.
    expect(compositeMock).toHaveBeenCalledTimes(1)
    expect(outputPath).toBe('/tmp/out.mp4')
  })

  it('returns the input untouched with zeroed stats when no card survives filtering', async () => {
    // A card entirely outside the speaker range is rejected before any render.
    const { outputPath, stats, tempFiles } = await applyDelosCards({
      ...BASE_OPTS,
      cards: [card(100, 110)]
    })

    expect(stats).toEqual({ rendered: 0, dropped: 0, aiText: 0, fallbackText: 0 })
    expect(renderOverlaysMock).not.toHaveBeenCalled()
    expect(compositeMock).not.toHaveBeenCalled()
    expect(outputPath).toBe(BASE_OPTS.inputPath)
    expect(tempFiles).toEqual([])
  })

  it('reports every surviving card as dropped when all renders fail (no composite)', async () => {
    const cards = [card(2, 7), card(12, 17)]
    buildSourceMock
      .mockResolvedValueOnce({ content: { kind: 'delos-console' }, source: 'fallback' })
      .mockResolvedValueOnce({ content: { kind: 'delos-console' }, source: 'fallback' })
    renderOverlaysMock.mockResolvedValueOnce([mov(''), mov('')])

    const { outputPath, stats } = await applyDelosCards({ ...BASE_OPTS, cards })

    expect(stats).toEqual({ rendered: 0, dropped: 2, aiText: 0, fallbackText: 2 })
    expect(compositeMock).not.toHaveBeenCalled()
    // Nothing composited → caller gets the untouched base to finalize itself.
    expect(outputPath).toBe(BASE_OPTS.inputPath)
  })
})
