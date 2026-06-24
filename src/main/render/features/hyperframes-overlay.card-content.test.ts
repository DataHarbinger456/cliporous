import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { OverlayRequest } from '../../hyperframes/types'
import type { WordTimestamp } from '../point-coverage'

// Mock buildCardContent so the feature wrapper is tested in isolation — no
// Gemini network calls, deterministic resolve/reject per test.
const buildMock = vi.fn<(...args: unknown[]) => Promise<unknown>>()
vi.mock('../../hyperframes/card-content', () => ({
  buildCardContent: (...args: unknown[]) => buildMock(...args)
}))

// Imported after the mock is registered.
const { populateDelosCardContent } = await import('./hyperframes-overlay.feature')

// One word per 0.4s slot starting at `t0`.
function wordsFrom(sentence: string, t0 = 0, step = 0.4): WordTimestamp[] {
  return sentence.split(' ').map((text, i) => ({
    text,
    start: t0 + i * step,
    end: t0 + i * step + step
  }))
}

beforeEach(() => {
  buildMock.mockReset()
})

describe('populateDelosCardContent', () => {
  it('fills a delos-scan-result with the 3 spoken findings from its window', async () => {
    const findings = ['Build a morning routine', 'Protect deep focus time', 'Review wins each day']
    buildMock.mockResolvedValueOnce({
      kind: 'delos-scan-result',
      title: 'DAILY SYSTEM',
      findings,
      progress: 100
    })

    const words = wordsFrom(
      'first build a morning routine then protect deep focus time finally review wins each day',
      0
    )
    const request: OverlayRequest = {
      block: 'delos-scan-result',
      // Preset defaults that must be replaced for findings but preserved for accent.
      props: {
        // biome-ignore lint/suspicious/noExplicitAny: loose preset props bag
        findings: ['Fidelity normal', 'No anomalies', 'Memory intact'],
        accentColor: '#9f75ff'
      } as unknown as OverlayRequest['props'],
      timing: { start: 0, duration: 6 }
    }

    await populateDelosCardContent(request, words, 'test-key')

    const props = request.props as Record<string, unknown>
    expect(props.findings).toEqual(findings)
    expect((props.findings as string[]).length).toBe(3)
    // Decorative slots preserved.
    expect(props.accentColor).toBe('#9f75ff')
    // The window's spoken text was handed to the builder.
    expect(buildMock).toHaveBeenCalledTimes(1)
    const [kind, windowText] = buildMock.mock.calls[0] as [string, string]
    expect(kind).toBe('delos-scan-result')
    expect(windowText).toContain('morning routine')
  })

  it('keeps preset-default props when the content build fails', async () => {
    buildMock.mockRejectedValueOnce(new Error('boom'))

    const defaults = ['Fidelity normal', 'No anomalies', 'Memory intact']
    const request: OverlayRequest = {
      block: 'delos-scan-result',
      props: {
        // biome-ignore lint/suspicious/noExplicitAny: loose preset props bag
        findings: [...defaults],
        accentColor: '#9f75ff'
      } as unknown as OverlayRequest['props'],
      timing: { start: 0, duration: 4 }
    }

    await expect(
      populateDelosCardContent(request, wordsFrom('some narration here over the window', 0), 'k')
    ).resolves.toBeUndefined()

    const props = request.props as Record<string, unknown>
    expect(props.findings).toEqual(defaults)
    expect(props.accentColor).toBe('#9f75ff')
  })

  it('leaves non-delos blocks completely untouched', async () => {
    const request: OverlayRequest = {
      block: 'checklist',
      props: { items: ['One', 'Two'] } as unknown as OverlayRequest['props'],
      timing: { start: 0, duration: 3 }
    }

    await populateDelosCardContent(request, wordsFrom('one two three four', 0), 'k')

    expect(buildMock).not.toHaveBeenCalled()
    expect((request.props as Record<string, unknown>).items).toEqual(['One', 'Two'])
  })

  it('keeps preset defaults when no words fall in the card window', async () => {
    const request: OverlayRequest = {
      block: 'delos-alert',
      props: { title: 'ALERT', message: 'System anomaly detected' } as unknown as OverlayRequest['props'],
      timing: { start: 20, duration: 3 }
    }

    await populateDelosCardContent(request, wordsFrom('narration well before the card', 0), 'k')

    expect(buildMock).not.toHaveBeenCalled()
    expect((request.props as Record<string, unknown>).message).toBe('System anomaly detected')
  })
})
