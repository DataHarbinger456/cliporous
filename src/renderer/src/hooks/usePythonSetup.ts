import { useCallback, useEffect } from 'react';
import { useStore } from '@/store';

export interface UsePythonSetup {
  refresh: () => Promise<void>;
  start: () => Promise<void>;
  retry: () => Promise<void>;
  cancel: () => Promise<void>;
}

function stateFromStage(stage: 'ready' | 'not-setup' | 'incomplete') {
  if (stage === 'ready') return 'ready' as const;
  if (stage === 'incomplete') return 'repair-needed' as const;
  return 'not-setup' as const;
}

/**
 * Keeps one renderer window synchronized with the main-process setup job.
 * App mounts it once for the studio window; Settings mounts it once for its
 * separate renderer context. Visual setup components call it with listeners
 * disabled so they can reuse the actions without duplicating IPC subscriptions.
 */
export function usePythonSetup(listen = true): UsePythonSetup {
  const setPythonStatus = useStore((s) => s.setPythonStatus);
  const setPythonSetupDetails = useStore((s) => s.setPythonSetupDetails);
  const setPythonSetupError = useStore((s) => s.setPythonSetupError);
  const setPythonSetupProgress = useStore((s) => s.setPythonSetupProgress);
  const addError = useStore((s) => s.addError);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const details = await window.api.getPythonStatus();
      setPythonSetupDetails(details);
      setPythonStatus(stateFromStage(details.stage));
      setPythonSetupError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPythonStatus('error');
      setPythonSetupError(message);
    }
  }, [setPythonSetupDetails, setPythonSetupError, setPythonStatus]);

  useEffect(() => {
    if (!listen) return;

    let active = true;
    const offProgress = window.api.onPythonSetupProgress((data) => {
      if (!active) return;
      setPythonStatus('installing');
      setPythonSetupError(null);
      setPythonSetupProgress(data);
    });

    const offDone = window.api.onPythonSetupDone((data) => {
      if (!active) return;
      setPythonSetupProgress(null);
      if (data.success) {
        setPythonStatus('ready');
        setPythonSetupError(null);
        void refresh();
        return;
      }
      if (data.canceled) {
        const details = useStore.getState().pythonSetupDetails;
        setPythonStatus(details ? stateFromStage(details.stage) : 'not-setup');
        setPythonSetupError(null);
        return;
      }

      const message = data.error ?? 'Local content-tool setup failed';
      setPythonStatus('error');
      setPythonSetupError(message);
      addError({
        source: 'python-setup',
        message,
        headline: 'Content tools could not be installed',
        whatHappened: 'BatchClip could not finish installing its local transcription tools.',
        whatIsSafe: 'Your projects and source media have not been changed.',
        whatToDoNext: 'Check your connection and free disk space, then retry setup.',
        failedStage: 'python-setup',
        recoveryAction: 'retry',
        retryable: true,
      });
    });

    void refresh();

    return () => {
      active = false;
      offProgress();
      offDone();
    };
  }, [addError, listen, refresh, setPythonSetupError, setPythonSetupProgress, setPythonStatus]);

  const start = useCallback(async (): Promise<void> => {
    setPythonSetupError(null);
    setPythonStatus('installing');
    setPythonSetupProgress({
      stage: 'downloading-python',
      message: 'Preparing local content tools…',
      percent: 0,
    });
    const result = await window.api.startPythonSetup();
    if (!result.started) {
      if (result.reason === 'already-running') return;
      setPythonSetupProgress(null);
      await refresh();
      if (result.reason === 'offline') {
        throw new Error('Connect to the internet before starting setup.');
      }
      throw new Error('Free at least 6 GB on the setup drive before starting.');
    }
  }, [refresh, setPythonSetupError, setPythonSetupProgress, setPythonStatus]);

  const cancel = useCallback(async (): Promise<void> => {
    setPythonStatus('cancelling');
    const result = await window.api.cancelPythonSetup();
    if (!result.canceled) await refresh();
  }, [refresh, setPythonStatus]);

  return { refresh, start, retry: start, cancel };
}
