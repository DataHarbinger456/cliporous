import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildCardContent,
  buildCardContentWithSource,
  type CardWord,
  type ScanResultContent,
  type ConsoleContent,
  type MatrixContent,
  type SystemDiagnosticsContent
} from './card-content'

// Mock the Gemini client so the default (apiKey) path never hits the network.
const callMock = vi.fn<(...args: unknown[]) => Promise<string>>()
vi.mock('../ai/gemini-client', () => ({
  callGeminiWithRetry: (...args: unknown[]) => callMock(...args),
  MODELS: { FAST: ['model-a', 'model-b'] }
}))
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor(_opts: unknown) {
      void _opts
    }
  }
}))

// A transcript window with 3 distinct points.
const TRANSCRIPT =
  'The first thing you need is a clear morning routine. ' +
  'Next, you have to protect your deep focus time from meetings. ' +
  'Finally, review your wins at the end of every single day.'

const WORDS: CardWord[] = TRANSCRIPT.split(' ').map((text, i) => ({
  text,
  start: i * 0.3,
  end: i * 0.3 + 0.25
}))

const PLACEHOLDERS = ['Fidelity normal', 'No anomalies', 'Memory intact', 'System anomaly detected']

function isPlaceholder(s: string): boolean {
  return PLACEHOLDERS.some((p) => p.toLowerCase() === s.trim().toLowerCase())
}

beforeEach(() => {
  callMock.mockReset()
})

describe('buildCardContent — delos-scan-result', () => {
  it('returns 3 non-placeholder findings from a 3-point transcript (AI path)', async () => {
    callMock.mockResolvedValueOnce(
      JSON.stringify({
        title: 'DAILY SYSTEM',
        findings: ['Build a morning routine', 'Protect deep focus time', 'Review wins each day'],
        progress: 100
      })
    )

    const content = (await buildCardContent('delos-scan-result', TRANSCRIPT, WORDS, {
      apiKey: 'test-key'
    })) as ScanResultContent

    expect(content.kind).toBe('delos-scan-result')
    expect(content.findings).toHaveLength(3)
    for (const f of content.findings) {
      expect(f.trim().length).toBeGreaterThan(0)
      expect(isPlaceholder(f)).toBe(false)
    }
    expect(content.title.length).toBeGreaterThan(0)
  })

  it('fallback path (no API key) still returns non-empty, non-placeholder findings', async () => {
    const content = (await buildCardContent(
      'delos-scan-result',
      TRANSCRIPT,
      WORDS
    )) as ScanResultContent

    expect(callMock).not.toHaveBeenCalled()
    expect(content.findings.length).toBeGreaterThan(0)
    for (const f of content.findings) {
      expect(f.trim().length).toBeGreaterThan(0)
      expect(isPlaceholder(f)).toBe(false)
    }
  })

  it('enforces the findings <= 3 cap even if the AI returns more', async () => {
    callMock.mockResolvedValueOnce(
      JSON.stringify({
        title: 'OVERFLOW',
        findings: ['one', 'two', 'three', 'four', 'five'],
        progress: 100
      })
    )

    const content = (await buildCardContent('delos-scan-result', TRANSCRIPT, WORDS, {
      apiKey: 'test-key'
    })) as ScanResultContent

    expect(content.findings.length).toBeLessThanOrEqual(3)
  })

  it('caps finding string length so cards do not overflow', async () => {
    const longText =
      'This is an extremely long finding that would absolutely overflow the card panel and ruin the layout entirely.'
    callMock.mockResolvedValueOnce(
      JSON.stringify({ title: 'X', findings: [longText, longText, longText], progress: 100 })
    )

    const content = (await buildCardContent('delos-scan-result', TRANSCRIPT, WORDS, {
      apiKey: 'test-key'
    })) as ScanResultContent

    for (const f of content.findings) {
      expect(f.length).toBeLessThanOrEqual(48)
    }
  })
})

describe('buildCardContent — fallback never returns placeholders or empties', () => {
  it('clamps console metrics to <= 3 and non-empty', async () => {
    const content = (await buildCardContent('delos-console', TRANSCRIPT, WORDS)) as ConsoleContent
    expect(content.metrics.length).toBeGreaterThan(0)
    expect(content.metrics.length).toBeLessThanOrEqual(3)
    for (const m of content.metrics) {
      expect(m.label.trim().length).toBeGreaterThan(0)
      expect(m.value.trim().length).toBeGreaterThan(0)
    }
  })

  it('matrix metrics are numeric 0-100 and capped at 3', async () => {
    const content = (await buildCardContent('delos-matrix', TRANSCRIPT, WORDS)) as MatrixContent
    expect(content.metrics.length).toBeLessThanOrEqual(3)
    for (const m of content.metrics) {
      expect(m.name.trim().length).toBeGreaterThan(0)
      expect(m.value).toBeGreaterThanOrEqual(0)
      expect(m.value).toBeLessThanOrEqual(100)
    }
  })

  it('system-diagnostics services have valid status enums', async () => {
    const content = (await buildCardContent(
      'delos-system-diagnostics',
      TRANSCRIPT,
      WORDS
    )) as SystemDiagnosticsContent
    expect(content.services.length).toBeGreaterThan(0)
    for (const s of content.services) {
      expect(['online', 'warning', 'offline']).toContain(s.status)
    }
  })

  it('reconstructs content from word timings when transcriptText is empty', async () => {
    const content = (await buildCardContent('delos-scan-result', '', WORDS)) as ScanResultContent
    expect(content.findings.length).toBeGreaterThan(0)
    for (const f of content.findings) {
      expect(f.trim().length).toBeGreaterThan(0)
    }
  })

  it('falls back deterministically when the AI returns garbage', async () => {
    callMock.mockResolvedValueOnce('not json at all <<<')
    const content = (await buildCardContent('delos-scan-result', TRANSCRIPT, WORDS, {
      apiKey: 'test-key'
    })) as ScanResultContent
    expect(content.findings.length).toBeGreaterThan(0)
  })
})

describe('buildCardContentWithSource — reports AI vs offline origin (RF-008)', () => {
  it('reports source: ai when the Gemini pass succeeds', async () => {
    callMock.mockResolvedValueOnce(
      JSON.stringify({ title: 'OK', findings: ['a', 'b', 'c'], progress: 100 })
    )
    const { source } = await buildCardContentWithSource('delos-scan-result', TRANSCRIPT, WORDS, {
      apiKey: 'test-key'
    })
    expect(source).toBe('ai')
  })

  it('reports source: fallback when no API key is supplied', async () => {
    const { source } = await buildCardContentWithSource('delos-scan-result', TRANSCRIPT, WORDS)
    expect(callMock).not.toHaveBeenCalled()
    expect(source).toBe('fallback')
  })

  it('reports source: fallback when the Gemini pass fails (e.g. rate-limit)', async () => {
    callMock.mockRejectedValueOnce(new Error('429 rate limit'))
    const { source, content } = await buildCardContentWithSource(
      'delos-scan-result',
      TRANSCRIPT,
      WORDS,
      { apiKey: 'test-key' }
    )
    expect(source).toBe('fallback')
    expect((content as ScanResultContent).findings.length).toBeGreaterThan(0)
  })

  it('reports source: fallback when forceFallback is set even with a key', async () => {
    const { source } = await buildCardContentWithSource('delos-scan-result', TRANSCRIPT, WORDS, {
      apiKey: 'test-key',
      forceFallback: true
    })
    expect(callMock).not.toHaveBeenCalled()
    expect(source).toBe('fallback')
  })
})
