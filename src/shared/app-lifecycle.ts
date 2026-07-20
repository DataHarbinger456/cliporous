export type AppRestartReason = 'update' | 'settings';

export type LifecycleWindowKind = 'main' | 'settings';

export interface LifecycleSnapshot {
  windowKind: LifecycleWindowKind;
  projectName: string | null;
  projectDirty: boolean;
  settingsDirty: boolean;
  processingStage: string | null;
  rendering: boolean;
}

export type LifecyclePrepareAction = 'inspect' | 'save' | 'cancel-work';

export interface LifecyclePrepareRequest {
  requestId: string;
  action: LifecyclePrepareAction;
}

export interface LifecyclePrepareResult {
  requestId: string;
  ok: boolean;
  snapshot: LifecycleSnapshot;
  error?: string;
}

export function hasActiveWork(snapshot: LifecycleSnapshot): boolean {
  return snapshot.processingStage !== null || snapshot.rendering;
}

export function hasUnsavedWork(snapshot: LifecycleSnapshot): boolean {
  return snapshot.projectDirty || snapshot.settingsDirty;
}
