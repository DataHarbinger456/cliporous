import { useEffect, useState } from 'react';
import { useStore } from '../store';

/**
 * Tracks save feedback for the project header.
 *
 * Close, quit, and restart saves are coordinated by the main-process lifecycle
 * guard, which waits for an explicit renderer confirmation. The configured
 * debounced autosave timer lives in `services/project-service.ts`.
 */
export function useAutosave(): { lastSavedAt: number | null; justSaved: boolean } {
  const lastSavedAt = useStore((s) => s.lastSavedAt);
  const [justSaved, setJustSaved] = useState(false);

  // Show the "Autosaved" indicator for 2 seconds after each save
  useEffect(() => {
    if (!lastSavedAt) return;
    setJustSaved(true);
    const timer = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [lastSavedAt]);

  return { lastSavedAt, justSaved };
}
