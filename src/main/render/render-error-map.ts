/**
 * render-error-map — turn raw FFmpeg / engine failures into short, actionable
 * human messages for the render UI (RF-022 "render floor").
 *
 * The render pipeline forwards `RENDER_CLIP_ERROR` with whatever the engine
 * threw — typically `ffmpeg exited with code 1: <last 20 stderr lines>`. That
 * is non-actionable for a first-run user. This module pattern-matches common
 * failure signatures to a one-line summary + suggested action, while keeping
 * the raw engine output available behind a "details" expander.
 *
 * Precedent: `isGpuSessionError()` in src/main/ffmpeg.ts does the same kind of
 * narrow stderr signature matching to drive software-encoder fallback.
 */

export interface ClassifiedRenderError {
  /** Short, human-readable summary of what went wrong. */
  message: string
  /** Suggested action the user can take, when the cause is recognised. */
  suggestion?: string
  /**
   * Raw engine output (stderr tail / original error message), preserved so the
   * renderer can expose it behind a "details" expander or in developer mode.
   * Omitted when it would be identical to `message` (i.e. an already-human
   * error that didn't come from FFmpeg).
   */
  details?: string
}

interface Signature {
  /** All patterns are tested case-insensitively against the raw error. */
  match: RegExp
  message: string
  suggestion: string
}

/**
 * Ordered most-specific → most-general. The first matching signature wins, so
 * keep narrow patterns (disk full, no audio) ahead of broad ones (unreadable
 * source) to avoid a generic match swallowing a precise one.
 */
const SIGNATURES: Signature[] = [
  // ── Disk full / ENOSPC ────────────────────────────────────────────────
  {
    match: /no space left on device|ENOSPC|disk (?:is )?full/i,
    message: 'Your disk ran out of space while writing this clip.',
    suggestion: 'Free up disk space (or choose a different output folder), then retry.'
  },
  // ── Permission denied ─────────────────────────────────────────────────
  {
    match: /permission denied|EACCES|EROFS|read-only file system/i,
    message: "BatchClip couldn't write the output file (permission denied).",
    suggestion: 'Pick an output folder you can write to, or check the folder permissions, then retry.'
  },
  // ── No audio stream ───────────────────────────────────────────────────
  {
    match: /matches no streams|does not contain any stream|stream specifier.*matches no|cannot find audio|audio stream.*not found/i,
    message: 'The source video has no audio track that could be used.',
    suggestion: 'Use a source video that includes audio, or re-export it with an audio track.'
  },
  // ── Unsupported / missing codec ───────────────────────────────────────
  {
    match: /unknown encoder|encoder.*not found|unknown decoder|decoder.*not found|unsupported codec|codec not currently supported|could not find tag for codec/i,
    message: "This video uses a codec BatchClip's engine can't handle.",
    suggestion: 'Convert the source to standard H.264/MP4 and try again.'
  },
  // ── Unreadable / corrupt / missing source ─────────────────────────────
  {
    match: /moov atom not found|invalid data found when processing input|error (?:while )?opening input|could not (?:open|find codec parameters)|no such file or directory|ENOENT|invalid data found|end of file/i,
    message: "The source video couldn't be read — it may be missing or corrupt.",
    suggestion: 'Re-download or re-export the source video, then try again.'
  }
]

/**
 * Classify a raw render error into a human summary + suggestion, preserving the
 * raw text as `details`. Always returns a usable `message`: when nothing
 * matches, the raw error becomes the message and no suggestion is offered.
 */
export function classifyRenderError(rawError: string): ClassifiedRenderError {
  const raw = (rawError ?? '').trim()

  for (const sig of SIGNATURES) {
    if (sig.match.test(raw)) {
      const out: ClassifiedRenderError = { message: sig.message, suggestion: sig.suggestion }
      if (raw) out.details = raw
      return out
    }
  }

  // Unrecognised. If it's clearly raw FFmpeg engine output, give a generic
  // friendly summary and keep the raw text in details. Otherwise the error was
  // already a human sentence (e.g. "Filler removal removed every segment"), so
  // surface it as-is with no separate details blob.
  if (/^ffmpeg exited with code/i.test(raw)) {
    return {
      message: 'Rendering this clip failed in the video engine.',
      suggestion: 'Retry the clip. If it keeps failing, open the details below or contact support.',
      details: raw
    }
  }

  return { message: raw || 'Rendering this clip failed.' }
}
