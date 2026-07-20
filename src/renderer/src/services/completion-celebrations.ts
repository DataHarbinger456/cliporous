export type CompletionCelebrationKind = 'first-export' | 'clean-batch';

type Listener = (kind: CompletionCelebrationKind) => void;

const listeners = new Set<Listener>();

export const FIRST_EXPORT_STORAGE_KEY = 'batchclip.delight.first-export-celebrated.v1';

export function showCompletionCelebration(kind: CompletionCelebrationKind): void {
  listeners.forEach((listener) => {
    listener(kind);
  });
}

export function subscribeToCompletionCelebrations(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Returns true exactly once per local install after the first successful export. */
export function claimFirstExportCelebration(): boolean {
  try {
    if (window.localStorage.getItem(FIRST_EXPORT_STORAGE_KEY) === '1') return false;
    window.localStorage.setItem(FIRST_EXPORT_STORAGE_KEY, '1');
    return true;
  } catch {
    // Storage being unavailable should not turn a finite celebration into a blocker.
    return false;
  }
}
