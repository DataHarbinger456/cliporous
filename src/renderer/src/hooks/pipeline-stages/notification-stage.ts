import type { ClipCandidate } from '../../store';
import type { PipelineContext } from './types';

/** Mark the pipeline as ready and fire the OS notification when unfocused. */
export function notificationStage(ctx: PipelineContext, clips: ClipCandidate[]): void {
  const { setPipeline } = ctx;

  // A finished run with zero clips is still 'ready' (the clips screen owns the
  // "0 passed scoring" empty state), but the message must not read like work is
  // still pending.
  const message =
    clips.length > 0 ? `Found ${clips.length} clip candidates` : 'No clips passed scoring';
  setPipeline({ stage: 'ready', message, percent: 100 });

  // Native progress and notifications are coordinated once at the App root so
  // they continue while the processing screen is hidden and are never duplicated.
}
