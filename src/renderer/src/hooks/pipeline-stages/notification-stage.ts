import type { ClipCandidate } from '../../store'
import type { PipelineContext } from './types'

/** Mark the pipeline as ready and fire the OS notification when unfocused. */
export function notificationStage(ctx: PipelineContext, clips: ClipCandidate[]): void {
  const { setPipeline, getState } = ctx

  // A finished run with zero clips is still 'ready' (the clips screen owns the
  // "0 passed scoring" empty state), but the message must not read like work is
  // still pending.
  const message =
    clips.length > 0
      ? `Found ${clips.length} clip candidates`
      : 'No clips passed scoring'
  setPipeline({ stage: 'ready', message, percent: 100 })

  // Intentionally reading latest state at execution time — notification
  // preferences should reflect the current settings.
  const state = getState()
  if (state.settings.enableNotifications && !document.hasFocus()) {
    const body =
      clips.length > 0
        ? `Found ${clips.length} clips with scores up to ${Math.max(...clips.map((c) => c.score))}`
        : 'No clips passed scoring — try lowering the score threshold in Settings'
    window.api.sendNotification({
      title: 'Processing Complete',
      body
    })
  }
}
