import type {
  LifecyclePrepareAction,
  LifecyclePrepareResult,
  LifecycleSnapshot,
} from '@shared/app-lifecycle';
import { useEffect, useRef } from 'react';

interface DesktopLifecycleOptions {
  getSnapshot: () => LifecycleSnapshot;
  onSave?: () => Promise<boolean>;
  onCancelWork?: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Connect one renderer window to the main-process lifecycle coordinator.
 *
 * Native close/quit/restart events stay in Electron's main process. This hook
 * only reports current risk and performs requested saves/cancellation, then
 * explicitly confirms settlement back to main.
 */
export function useDesktopLifecycle({
  getSnapshot,
  onSave,
  onCancelWork,
}: DesktopLifecycleOptions): void {
  const snapshotRef = useRef(getSnapshot);
  const saveRef = useRef(onSave);
  const cancelRef = useRef(onCancelWork);

  snapshotRef.current = getSnapshot;
  saveRef.current = onSave;
  cancelRef.current = onCancelWork;

  const { windowKind, projectName, projectDirty, settingsDirty, processingStage, rendering } =
    getSnapshot();
  useEffect(() => {
    const currentSnapshot: LifecycleSnapshot = {
      windowKind,
      projectName,
      projectDirty,
      settingsDirty,
      processingStage,
      rendering,
    };
    void window.api.reportLifecycleState(currentSnapshot).catch((error) => {
      window.api.logToMain?.(
        'error',
        'lifecycle',
        `Could not report renderer lifecycle state: ${errorMessage(error)}`,
      );
    });
  }, [windowKind, projectName, projectDirty, settingsDirty, processingStage, rendering]);

  useEffect(() => {
    const complete = async (requestId: string, action: LifecyclePrepareAction): Promise<void> => {
      let ok = true;
      let error: string | undefined;

      try {
        if (action === 'save') {
          if (!saveRef.current) throw new Error('This window cannot save its pending changes.');
          ok = await saveRef.current();
          if (!ok) error = 'The save was cancelled or did not complete.';
        } else if (action === 'cancel-work') {
          if (!cancelRef.current) throw new Error('This window cannot cancel running work.');
          await cancelRef.current();
        }
      } catch (caught) {
        ok = false;
        error = errorMessage(caught);
      }

      const result: LifecyclePrepareResult = {
        requestId,
        ok,
        snapshot: snapshotRef.current(),
        ...(error ? { error } : {}),
      };
      await window.api.completeLifecyclePreparation(result);
    };

    return window.api.onLifecyclePrepare((request) => {
      void complete(request.requestId, request.action).catch((error) => {
        window.api.logToMain?.(
          'error',
          'lifecycle',
          `Could not confirm ${request.action}: ${errorMessage(error)}`,
        );
      });
    });
  }, []);
}
