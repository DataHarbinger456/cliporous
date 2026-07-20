export const PROJECT_SCHEMA_VERSION = 4 as const;

export const AUTOSAVE_MIN_MS = 10_000;
export const AUTOSAVE_MAX_MS = 300_000;
export const AUTOSAVE_STEP_MS = 10_000;
export const DEFAULT_AUTOSAVE_INTERVAL_MS = 60_000;

export interface ProjectIdentity {
  id: string;
  displayName: string;
  filePath: string | null;
  createdAt: number;
  modifiedAt: number;
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
}

export type ProjectSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** Identity stored only in autosave recovery snapshots, never normal project files. */
export interface RecoverySnapshotMetadata {
  id: string;
  savedAt: number;
  stage: string;
}

export interface ProjectLoadResult {
  json: string;
  filePath: string;
}

export interface ProjectSaveOptions {
  currentPath: string | null;
  forceDialog?: boolean;
  suggestedName: string;
}

export function clampAutosaveInterval(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AUTOSAVE_INTERVAL_MS;
  return Math.min(AUTOSAVE_MAX_MS, Math.max(AUTOSAVE_MIN_MS, Math.round(value)));
}
