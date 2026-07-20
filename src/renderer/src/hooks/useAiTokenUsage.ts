import { useEffect } from 'react';
import { useStore } from '@/store';

/** Subscribe once at the renderer root so every main-process usage event reaches the session ledger. */
export function useAiTokenUsage(): void {
  useEffect(() => {
    return window.api.onAiTokenUsage((event) => {
      useStore.getState().trackTokenUsage(event);
    });
  }, []);
}
