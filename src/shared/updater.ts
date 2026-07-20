export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

export interface AppUpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  availableVersion: string | null;
  progressPercent: number | null;
  message: string | null;
  /** True only when a user-triggered check should surface idle/error feedback. */
  manual: boolean;
}
