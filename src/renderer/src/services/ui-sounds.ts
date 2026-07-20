
/** Finite creator-work cues. These files are UI-only and never enter exported media. */
export type StudioSound =
  | 'approve'
  | 'reject'
  | 'job-ready'
  | 'batch-success'
  | 'warning'
  | 'failure';

/** UI sounds are disabled until cleared project-owned cues replace the removed assets. */
export function playStudioSound(_sound: StudioSound): void {}
