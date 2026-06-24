// ---------------------------------------------------------------------------
// card-content.ts — PRESTYJ "delos-*" card content builder.
//
// Pure(-ish), testable layer that turns a transcript window into the structured
// content slots each delos-* hyperframe card consumes via
// `window.__hyperframes.getVariables()`. This module ONLY produces the data —
// wiring it into the render pipeline / HTML happens in a later task.
//
// Two paths, one normalizer:
//   1. Gemini pass (via ../ai/gemini-client) when an API key is supplied —
//      summarizes the window into the card's slots.
//   2. Deterministic non-LLM fallback that derives slots directly from the
//      transcript text. ALWAYS returns populated, non-empty content so a
//      missing / failed / no-API-key path still works.
//
// Both paths run through the SAME normalizer, which enforces per-card item
// caps and max string lengths and back-fills any missing slot from the
// deterministic fallback — so the result is never empty and never a canned
// placeholder like "Fidelity normal".
// ---------------------------------------------------------------------------

import { GoogleGenAI } from '@google/genai'
import { callGeminiWithRetry, MODELS } from '../ai/gemini-client'
import { log } from '../logger'

// ---------------------------------------------------------------------------
// Card kinds + variable contracts
//
// Each interface mirrors EXACTLY the variables the matching catalog/*.html
// reads from getVariables(). Decorative-only variables (accentColor, yPos,
// timingDuration, footerText) are injected by the render layer, not here.
// ---------------------------------------------------------------------------

export type CardKind =
  | 'delos-scan-result'
  | 'delos-alert'
  | 'delos-console'
  | 'delos-matrix'
  | 'delos-system-diagnostics'
  | 'delos-tracking-map'
  | 'delos-biometric'

export type AlertSeverity = 'critical' | 'warning' | 'info' | 'ok'
export type ServiceStatus = 'online' | 'warning' | 'offline'

/** delos-scan-result.html → { title, findings[], progress } */
export interface ScanResultContent {
  kind: 'delos-scan-result'
  title: string
  findings: string[]
  progress: number
}

/** delos-alert.html → { title, message, severity } */
export interface AlertContent {
  kind: 'delos-alert'
  title: string
  message: string
  severity: AlertSeverity
}

/** delos-console.html → { title, statusText, metrics:[{label,value}] } */
export interface ConsoleContent {
  kind: 'delos-console'
  title: string
  statusText: string
  metrics: Array<{ label: string; value: string }>
}

/** delos-matrix.html → { title, hostId, metrics:[{name,value:number}] } */
export interface MatrixContent {
  kind: 'delos-matrix'
  title: string
  hostId: string
  metrics: Array<{ name: string; value: number }>
}

/** delos-system-diagnostics.html → { title, services:[{name,status}] } */
export interface SystemDiagnosticsContent {
  kind: 'delos-system-diagnostics'
  title: string
  services: Array<{ name: string; status: ServiceStatus }>
}

/** delos-tracking-map.html → { label, waypoints:[{x,y,label}] } */
export interface TrackingMapContent {
  kind: 'delos-tracking-map'
  label: string
  waypoints: Array<{ x: number; y: number; label: string }>
}

/** delos-biometric.html → { identity, pulse:number, stressLevel:number } */
export interface BiometricContent {
  kind: 'delos-biometric'
  identity: string
  pulse: number
  stressLevel: number
}

/** Discriminated union over every delos-* card. */
export type CardContent =
  | ScanResultContent
  | AlertContent
  | ConsoleContent
  | MatrixContent
  | SystemDiagnosticsContent
  | TrackingMapContent
  | BiometricContent

/** Maps a card kind to its concrete content type. */
export type CardContentOf<K extends CardKind> = Extract<CardContent, { kind: K }>

/** Word timing entry, matching wordTimestamps in src/main/render/types.ts. */
export interface CardWord {
  text: string
  start: number
  end: number
}

export interface BuildCardContentOptions {
  /** Gemini API key. When absent/empty the deterministic fallback is used. */
  apiKey?: string
  /**
   * Force the deterministic fallback even if an apiKey is present. Used by
   * tests and any caller that wants a guaranteed offline result.
   */
  forceFallback?: boolean
}

// ---------------------------------------------------------------------------
// Caps — keep cards from overflowing their fixed-size panels.
// ---------------------------------------------------------------------------

const CAPS = {
  titleMaxChars: 36,
  maxFindings: 3,
  findingMaxChars: 48,
  messageMaxChars: 140,
  maxMetrics: 3,
  metricLabelMaxChars: 14,
  metricValueMaxChars: 8,
  matrixNameMaxChars: 14,
  maxServices: 4,
  serviceNameMaxChars: 14,
  maxWaypoints: 5,
  waypointLabelMaxChars: 10,
  identityMaxChars: 28,
  statusTextMaxChars: 16,
  hostIdMaxChars: 12
} as const

// Filler tokens stripped from the head of derived phrases / titles.
const LEADING_FILLER = new Set([
  'so',
  'and',
  'but',
  'or',
  'like',
  'well',
  'um',
  'uh',
  'er',
  'okay',
  'ok',
  'right',
  'now',
  'just',
  'really',
  'actually',
  'basically',
  'literally',
  'honestly',
  'anyway',
  'yeah',
  'yes',
  'no',
  'i',
  'we',
  'you',
  'they',
  'it',
  'the',
  'a',
  'an',
  'that',
  'this'
])

// ---------------------------------------------------------------------------
// Text helpers (deterministic)
// ---------------------------------------------------------------------------

/** Collapse whitespace and trim. */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Stable non-negative hash for deriving pseudo-stats from a phrase. */
function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** Capitalize the first visible character. */
function capitalize(s: string): string {
  if (s.length === 0) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Truncate to maxChars, appending an ellipsis when cut (counted in the cap). */
function truncate(s: string, maxChars: number): string {
  const t = normalizeWhitespace(s)
  if (t.length <= maxChars) return t
  // Cut on a word boundary where possible.
  const slice = t.slice(0, Math.max(1, maxChars - 1))
  const lastSpace = slice.lastIndexOf(' ')
  const base = lastSpace > maxChars * 0.5 ? slice.slice(0, lastSpace) : slice
  return `${base.trimEnd()}…`
}

/**
 * Resolve the raw transcript text to use. Prefers the explicit transcriptText
 * but reconstructs from word timings when the text is empty.
 */
function resolveText(transcriptText: string, words: CardWord[]): string {
  const t = normalizeWhitespace(transcriptText)
  if (t.length > 0) return t
  return normalizeWhitespace(words.map((w) => w.text).join(' '))
}

/** Strip leading filler words, take a short window, capitalize. */
function condensePhrase(phrase: string, maxWords = 7): string {
  const words = normalizeWhitespace(phrase)
    .replace(/[^\p{L}\p{N}\s'%$.-]/gu, '')
    .split(' ')
    .filter((w) => w.length > 0)

  let start = 0
  while (start < words.length - 1) {
    const head = words[start]
    if (head === undefined || !LEADING_FILLER.has(head.toLowerCase())) break
    start++
  }
  const picked = words.slice(start, start + maxWords)
  if (picked.length === 0) return ''
  return capitalize(picked.join(' '))
}

/**
 * Split a transcript window into meaningful key phrases. Splits on sentence /
 * clause boundaries, drops fillers, condenses each clause to a short phrase.
 */
function extractKeyPhrases(text: string): string[] {
  const raw = normalizeWhitespace(text)
  if (raw.length === 0) return []

  // Split on strong punctuation, newlines, and clause-joining conjunctions.
  const segments = raw
    .split(/[.!?;:\n]+|,(?=\s)|\s+(?:and|but|so|because|which|while|then)\s+/i)
    .map((s) => condensePhrase(s))
    .filter((s) => s.length > 0)

  // De-duplicate case-insensitively while preserving order.
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of segments) {
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }

  // If splitting produced nothing useful (single long run-on), chunk by words.
  if (out.length === 0) {
    const words = raw.split(' ')
    for (let i = 0; i < words.length && out.length < 6; i += 6) {
      const phrase = condensePhrase(words.slice(i, i + 6).join(' '))
      if (phrase.length > 0) out.push(phrase)
    }
  }

  return out
}

/** A short, title-cased token suitable for labels (1–2 words). */
function shortToken(phrase: string, maxChars: number): string {
  return truncate(condensePhrase(phrase, 2), maxChars)
}

/** Pad an index-derived phrase list so we always have at least `n` entries. */
function ensureCount(phrases: string[], n: number, seed: string): string[] {
  if (phrases.length >= n) return phrases.slice(0, n)
  const out = [...phrases]
  let i = 0
  while (out.length < n) {
    // Reuse existing phrases (rotated) rather than invent placeholders.
    const source = phrases.length > 0 ? phrases[i % phrases.length] ?? seed : seed
    const candidate = condensePhrase(source, 4) || capitalize(seed)
    out.push(candidate)
    i++
  }
  return out
}

// ---------------------------------------------------------------------------
// Deterministic fallback builders (one per card kind)
// ---------------------------------------------------------------------------

function deriveTitle(phrases: string[], fallbackText: string): string {
  const source = phrases[0] ?? fallbackText
  const title = condensePhrase(source, 5)
  return truncate(title || capitalize(fallbackText) || 'Signal', CAPS.titleMaxChars)
}

function deriveSeverity(text: string): AlertSeverity {
  const t = text.toLowerCase()
  if (/\b(critical|danger|fail|failure|emergency|fatal|crash|breach|broke|broken)\b/.test(t)) {
    return 'critical'
  }
  if (/\b(warn|warning|risk|problem|issue|error|wrong|caution|threat|concern)\b/.test(t)) {
    return 'warning'
  }
  if (/\b(good|great|success|complete|done|safe|fine|stable|secure|ready|ok|nominal)\b/.test(t)) {
    return 'ok'
  }
  return 'info'
}

function deriveServiceStatus(phrase: string): ServiceStatus {
  const sev = deriveSeverity(phrase)
  if (sev === 'critical') return 'offline'
  if (sev === 'warning') return 'warning'
  return 'online'
}

/** Map a phrase to a 0–100 pseudo metric (deterministic). */
function deriveMetricValue(phrase: string): number {
  return 55 + (hashString(phrase) % 45) // 55–99
}

/** Map a phrase to a short stat string like "98%" / "2.4K". */
function deriveStatString(phrase: string): string {
  const h = hashString(phrase)
  const mode = h % 3
  if (mode === 0) return `${55 + (h % 45)}%`
  if (mode === 1) return `${(1 + (h % 90)) / 10}K`
  return `${100 + (h % 900)}`
}

function fallbackContent(kind: CardKind, text: string, phrases: string[]): CardContent {
  const title = deriveTitle(phrases, text)

  switch (kind) {
    case 'delos-scan-result': {
      const source = phrases.length > 1 ? phrases.slice(1) : phrases
      const findings = ensureCount(source, CAPS.maxFindings, title)
        .slice(0, CAPS.maxFindings)
        .map((f) => truncate(f, CAPS.findingMaxChars))
      return { kind, title, findings, progress: 100 }
    }
    case 'delos-alert': {
      const message = truncate(phrases.slice(1).join('. ') || text || title, CAPS.messageMaxChars)
      return { kind, title, message, severity: deriveSeverity(text) }
    }
    case 'delos-console': {
      const sources = ensureCount(phrases, CAPS.maxMetrics, title)
      const metrics = sources.slice(0, CAPS.maxMetrics).map((p) => ({
        label: truncate(shortToken(p, CAPS.metricLabelMaxChars), CAPS.metricLabelMaxChars),
        value: truncate(deriveStatString(p), CAPS.metricValueMaxChars)
      }))
      const statusText = deriveSeverity(text) === 'critical' ? 'Alert' : 'Operational'
      return { kind, title, statusText: truncate(statusText, CAPS.statusTextMaxChars), metrics }
    }
    case 'delos-matrix': {
      const sources = ensureCount(phrases, CAPS.maxMetrics, title)
      const metrics = sources.slice(0, CAPS.maxMetrics).map((p) => ({
        name: truncate(shortToken(p, CAPS.matrixNameMaxChars), CAPS.matrixNameMaxChars),
        value: deriveMetricValue(p)
      }))
      const hostId = `HC-${((hashString(title) % 9000) + 1000).toString()}`
      return { kind, title, hostId, metrics }
    }
    case 'delos-system-diagnostics': {
      const sources = ensureCount(phrases, CAPS.maxServices, title)
      const services = sources.slice(0, CAPS.maxServices).map((p) => ({
        name: truncate(shortToken(p, CAPS.serviceNameMaxChars), CAPS.serviceNameMaxChars),
        status: deriveServiceStatus(p)
      }))
      return { kind, title, services }
    }
    case 'delos-tracking-map': {
      const want = Math.min(CAPS.maxWaypoints, Math.max(3, phrases.length))
      const sources = ensureCount(phrases, want, title).slice(0, CAPS.maxWaypoints)
      const waypoints = sources.map((p, i) => {
        const h = hashString(p)
        return {
          // Spread across the map deterministically but legibly.
          x: 15 + (((h % 70) + i * 13) % 70),
          y: 15 + (((Math.floor(h / 7) % 60) + i * 9) % 60),
          label: truncate(shortToken(p, CAPS.waypointLabelMaxChars), CAPS.waypointLabelMaxChars)
        }
      })
      return { kind, label: title, waypoints }
    }
    case 'delos-biometric': {
      const h = hashString(title)
      const identity = condensePhrase(phrases[0] ?? text, 3) || title
      return {
        kind,
        identity: truncate(identity, CAPS.identityMaxChars),
        pulse: 64 + (h % 48), // 64–111 bpm
        stressLevel: deriveSeverity(text) === 'critical' ? 70 + (h % 30) : 10 + (h % 40)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Normalizer — enforces caps + back-fills missing slots from the fallback.
// Both the AI path and the fallback path are run through here, guaranteeing a
// non-empty, cap-compliant result regardless of source.
// ---------------------------------------------------------------------------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function coerceStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter(isNonEmptyString).map((s) => normalizeWhitespace(s))
}

function clampNumber(v: unknown, fallback: number, min: number, max: number): number {
  const n =
    typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function isAlertSeverity(v: unknown): v is AlertSeverity {
  return v === 'critical' || v === 'warning' || v === 'info' || v === 'ok'
}

function isServiceStatus(v: unknown): v is ServiceStatus {
  return v === 'online' || v === 'warning' || v === 'offline'
}

function coerceMetricPairs(v: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(v)) return []
  const out: Array<{ label: string; value: string }> = []
  for (const item of v) {
    if (item == null || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const label = rec.label
    const value = rec.value
    if (!isNonEmptyString(label)) continue
    const valueStr = isNonEmptyString(value)
      ? normalizeWhitespace(value)
      : typeof value === 'number'
        ? String(value)
        : ''
    if (valueStr.length === 0) continue
    out.push({ label: normalizeWhitespace(label), value: valueStr })
  }
  return out
}

function coerceNamedNumberMetrics(v: unknown): Array<{ name: string; value: number }> {
  if (!Array.isArray(v)) return []
  const out: Array<{ name: string; value: number }> = []
  for (const item of v) {
    if (item == null || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const name = rec.name
    if (!isNonEmptyString(name)) continue
    out.push({ name: normalizeWhitespace(name), value: clampNumber(rec.value, 90, 0, 100) })
  }
  return out
}

function coerceServices(v: unknown): Array<{ name: string; status: ServiceStatus }> {
  if (!Array.isArray(v)) return []
  const out: Array<{ name: string; status: ServiceStatus }> = []
  for (const item of v) {
    if (item == null || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const name = rec.name
    if (!isNonEmptyString(name)) continue
    out.push({
      name: normalizeWhitespace(name),
      status: isServiceStatus(rec.status) ? rec.status : 'online'
    })
  }
  return out
}

function coerceWaypoints(v: unknown): Array<{ x: number; y: number; label: string }> {
  if (!Array.isArray(v)) return []
  const out: Array<{ x: number; y: number; label: string }> = []
  for (let i = 0; i < v.length; i++) {
    const item = v[i]
    if (item == null || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const label = rec.label
    if (!isNonEmptyString(label)) continue
    out.push({
      x: clampNumber(rec.x, 20 + i * 15, 5, 95),
      y: clampNumber(rec.y, 30 + i * 10, 5, 95),
      label: truncate(label, CAPS.waypointLabelMaxChars)
    })
  }
  return out
}

function titleOf(c: CardContent): string {
  if ('title' in c) return c.title
  if ('label' in c) return c.label
  if ('identity' in c) return c.identity
  return 'Signal'
}

/**
 * Merge a partial (AI-produced) content object with the deterministic fallback,
 * applying every per-card cap. Always returns fully-populated content.
 */
function normalizeContent(
  kind: CardKind,
  partial: Record<string, unknown>,
  fallback: CardContent
): CardContent {
  const title = truncate(
    isNonEmptyString(partial.title) ? partial.title : titleOf(fallback),
    CAPS.titleMaxChars
  )

  switch (kind) {
    case 'delos-scan-result': {
      const fb = fallback as ScanResultContent
      const findingsRaw = coerceStringArray(partial.findings)
      const findings = (findingsRaw.length > 0 ? findingsRaw : fb.findings)
        .slice(0, CAPS.maxFindings)
        .map((f) => truncate(f, CAPS.findingMaxChars))
      return {
        kind,
        title,
        findings: findings.length > 0 ? findings : fb.findings,
        progress: clampNumber(partial.progress, fb.progress, 0, 100)
      }
    }
    case 'delos-alert': {
      const fb = fallback as AlertContent
      return {
        kind,
        title,
        message: truncate(
          isNonEmptyString(partial.message) ? partial.message : fb.message,
          CAPS.messageMaxChars
        ),
        severity: isAlertSeverity(partial.severity) ? partial.severity : fb.severity
      }
    }
    case 'delos-console': {
      const fb = fallback as ConsoleContent
      const metrics = coerceMetricPairs(partial.metrics)
        .slice(0, CAPS.maxMetrics)
        .map((m) => ({
          label: truncate(m.label, CAPS.metricLabelMaxChars),
          value: truncate(m.value, CAPS.metricValueMaxChars)
        }))
      return {
        kind,
        title,
        statusText: truncate(
          isNonEmptyString(partial.statusText) ? partial.statusText : fb.statusText,
          CAPS.statusTextMaxChars
        ),
        metrics: metrics.length > 0 ? metrics : fb.metrics
      }
    }
    case 'delos-matrix': {
      const fb = fallback as MatrixContent
      const metrics = coerceNamedNumberMetrics(partial.metrics)
        .slice(0, CAPS.maxMetrics)
        .map((m) => ({ name: truncate(m.name, CAPS.matrixNameMaxChars), value: m.value }))
      return {
        kind,
        title,
        hostId: truncate(
          isNonEmptyString(partial.hostId) ? partial.hostId : fb.hostId,
          CAPS.hostIdMaxChars
        ),
        metrics: metrics.length > 0 ? metrics : fb.metrics
      }
    }
    case 'delos-system-diagnostics': {
      const fb = fallback as SystemDiagnosticsContent
      const services = coerceServices(partial.services)
        .slice(0, CAPS.maxServices)
        .map((s) => ({ name: truncate(s.name, CAPS.serviceNameMaxChars), status: s.status }))
      return { kind, title, services: services.length > 0 ? services : fb.services }
    }
    case 'delos-tracking-map': {
      const fb = fallback as TrackingMapContent
      const waypoints = coerceWaypoints(partial.waypoints).slice(0, CAPS.maxWaypoints)
      return {
        kind,
        label: truncate(isNonEmptyString(partial.label) ? partial.label : fb.label, CAPS.titleMaxChars),
        waypoints: waypoints.length > 0 ? waypoints : fb.waypoints
      }
    }
    case 'delos-biometric': {
      const fb = fallback as BiometricContent
      return {
        kind,
        identity: truncate(
          isNonEmptyString(partial.identity) ? partial.identity : fb.identity,
          CAPS.identityMaxChars
        ),
        pulse: clampNumber(partial.pulse, fb.pulse, 40, 180),
        stressLevel: clampNumber(partial.stressLevel, fb.stressLevel, 0, 100)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Gemini pass
// ---------------------------------------------------------------------------

/** Per-card JSON schema description handed to Gemini. */
function slotSpec(kind: CardKind): string {
  switch (kind) {
    case 'delos-scan-result':
      return `{ "title": "2-5 word heading", "findings": ["3 concise findings, each <= ${CAPS.findingMaxChars} chars"], "progress": 0-100 }`
    case 'delos-alert':
      return `{ "title": "2-4 word heading", "message": "one sentence <= ${CAPS.messageMaxChars} chars", "severity": "critical|warning|info|ok" }`
    case 'delos-console':
      return `{ "title": "short heading", "statusText": "one word status", "metrics": [{ "label": "<= ${CAPS.metricLabelMaxChars} chars", "value": "short stat e.g. 98% <= ${CAPS.metricValueMaxChars} chars" }] (max ${CAPS.maxMetrics}) }`
    case 'delos-matrix':
      return `{ "title": "short heading", "hostId": "code like HC-0421", "metrics": [{ "name": "<= ${CAPS.matrixNameMaxChars} chars", "value": 0-100 }] (max ${CAPS.maxMetrics}) }`
    case 'delos-system-diagnostics':
      return `{ "title": "short heading", "services": [{ "name": "<= ${CAPS.serviceNameMaxChars} chars", "status": "online|warning|offline" }] (max ${CAPS.maxServices}) }`
    case 'delos-tracking-map':
      return `{ "label": "short heading", "waypoints": [{ "x": 5-95, "y": 5-95, "label": "<= ${CAPS.waypointLabelMaxChars} chars" }] (3-${CAPS.maxWaypoints}) }`
    case 'delos-biometric':
      return `{ "identity": "subject/topic name <= ${CAPS.identityMaxChars} chars", "pulse": 60-110, "stressLevel": 0-100 }`
  }
}

function buildPrompt(kind: CardKind, transcriptText: string): string {
  return `You generate the on-screen text for a futuristic "Delos" HUD card overlaid on a short-form video. The card MUST reflect what the speaker is actually saying — distil the transcript into the card's slots.

Card kind: ${kind}

Return ONLY valid JSON in exactly this shape (no markdown, no commentary):
${slotSpec(kind)}

Rules:
- Derive every value from the transcript content below. Do NOT invent unrelated sci-fi jargon.
- Keep text punchy and within the stated character limits.
- Never output empty strings or empty arrays.

Transcript window:
"${transcriptText.slice(0, 1200)}"`
}

async function callGeminiJSON(apiKey: string, prompt: string): Promise<Record<string, unknown>> {
  const ai = new GoogleGenAI({ apiKey })
  const text = await callGeminiWithRetry(
    ai,
    {
      model: MODELS.FAST[0],
      fallbacks: MODELS.FAST.slice(1),
      config: { responseMimeType: 'application/json' }
    },
    prompt,
    'card-content'
  )
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    const match = text.match(/[[{][\s\S]*[\]}]/)
    if (!match) throw new Error('Gemini returned an unparseable JSON response')
    parsed = JSON.parse(match[0])
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Gemini returned a non-object JSON response')
  }
  return parsed as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build structured content slots for a delos-* card from a transcript window.
 *
 * Prefers a Gemini summarization pass (when `opts.apiKey` is set and
 * `forceFallback` is not). On any failure — missing key, network, bad JSON —
 * it transparently falls back to a deterministic transcript-derived result.
 * The return value is ALWAYS fully populated, cap-compliant, and free of canned
 * placeholder strings.
 */
export async function buildCardContent<K extends CardKind>(
  kind: K,
  transcriptText: string,
  words: CardWord[] = [],
  opts: BuildCardContentOptions = {}
): Promise<CardContentOf<K>> {
  const text = resolveText(transcriptText, words)
  const phrases = extractKeyPhrases(text)
  const fallback = fallbackContent(kind, text, phrases)

  const apiKey = opts.apiKey?.trim()
  if (!apiKey || opts.forceFallback) {
    return fallback as CardContentOf<K>
  }

  try {
    const raw = await callGeminiJSON(apiKey, buildPrompt(kind, text))
    return normalizeContent(kind, raw, fallback) as CardContentOf<K>
  } catch (err) {
    log(
      'warn',
      'hyperframes',
      `card-content: Gemini pass failed for ${kind}, using deterministic fallback: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
    return fallback as CardContentOf<K>
  }
}
