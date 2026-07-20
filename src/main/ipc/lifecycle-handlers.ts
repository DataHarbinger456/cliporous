import { randomUUID } from 'node:crypto';
import type {
  AppRestartReason,
  LifecyclePrepareAction,
  LifecyclePrepareResult,
  LifecycleSnapshot,
} from '@shared/app-lifecycle';
import { hasActiveWork, hasUnsavedWork } from '@shared/app-lifecycle';
import { Ch } from '@shared/ipc-channels';
import { app, BrowserWindow, dialog, type Event as ElectronEvent, ipcMain } from 'electron';
import { wrapHandler } from '../ipc-error-handler';
import { log } from '../logger';

const INSPECT_TIMEOUT_MS = 4_000;
const CANCELLATION_TIMEOUT_MS = 30_000;

interface PendingPreparation {
  resolve: (result: LifecyclePrepareResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  windowId: number;
}

type GlobalIntent = 'close' | 'quit' | 'restart-update' | 'restart-settings';

const snapshots = new Map<number, LifecycleSnapshot>();
const pendingPreparations = new Map<string, PendingPreparation>();
const attachedWindows = new Set<number>();
const allowedWindowCloses = new Set<number>();

let mainWindow: BrowserWindow | null = null;
let lifecycleOperation: Promise<boolean> | null = null;
let bypassLifecycleGuards = false;
let handlersRegistered = false;

/** Confirms and saves durable work before the updater owns the process restart. */
export function prepareManagedUpdateRestart(window: BrowserWindow): Promise<boolean> {
  if (lifecycleOperation) return lifecycleOperation;
  lifecycleOperation = coordinateGlobalIntent('restart-update', window, () => {
    bypassLifecycleGuards = true;
  }).finally(() => {
    lifecycleOperation = null;
  });
  return lifecycleOperation;
}

function alive(window: BrowserWindow | null | undefined): window is BrowserWindow {
  return Boolean(window && !window.isDestroyed());
}

function destination(intent: GlobalIntent): 'Quit' | 'Restart' {
  return intent.startsWith('restart') ? 'Restart' : 'Quit';
}

function activeWorkDescription(snapshot: LifecycleSnapshot): string {
  const projectName = snapshot.projectName?.trim() || 'this project';
  if (snapshot.rendering) return `An export is still running for “${projectName}”.`;
  const stage = snapshot.processingStage?.replace(/[-_]/g, ' ') || 'processing';
  return `“${projectName}” is still ${stage}.`;
}

function unsavedDescription(activeSnapshots: LifecycleSnapshot[]): string {
  const project = activeSnapshots.find((snapshot) => snapshot.projectDirty);
  const settingsDirty = activeSnapshots.some((snapshot) => snapshot.settingsDirty);
  if (project?.projectName && settingsDirty) {
    return `“${project.projectName}” and Settings have unsaved changes.`;
  }
  if (project?.projectName) return `“${project.projectName}” has unsaved changes.`;
  if (project) return 'This project has unsaved changes.';
  return 'Settings has unsaved changes.';
}

function rejectPendingForWindow(windowId: number): void {
  pendingPreparations.forEach((pending, requestId) => {
    if (pending.windowId !== windowId) return;
    clearTimeout(pending.timeout);
    pending.reject(new Error('The window closed before it confirmed the action.'));
    pendingPreparations.delete(requestId);
  });
}

function sendPreparation(
  window: BrowserWindow,
  action: LifecyclePrepareAction,
  timeoutMs: number,
): Promise<LifecyclePrepareResult> {
  if (!alive(window)) return Promise.reject(new Error('The window is no longer available.'));

  const requestId = randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingPreparations.delete(requestId);
      reject(
        new Error(
          action === 'cancel-work'
            ? 'The running job did not confirm cancellation in time.'
            : 'The window did not confirm its current state.',
        ),
      );
    }, timeoutMs);

    pendingPreparations.set(requestId, {
      resolve,
      reject,
      timeout,
      windowId: window.id,
    });

    try {
      window.webContents.send(Ch.Send.LIFECYCLE_PREPARE, { requestId, action });
    } catch (error) {
      clearTimeout(timeout);
      pendingPreparations.delete(requestId);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function trackedWindows(): BrowserWindow[] {
  const windows: BrowserWindow[] = [];
  if (alive(mainWindow)) windows.push(mainWindow);

  for (const window of BrowserWindow.getAllWindows()) {
    if (!alive(window) || window === mainWindow || !snapshots.has(window.id)) continue;
    windows.push(window);
  }
  return windows;
}

async function inspectWindows(windows: BrowserWindow[]): Promise<LifecycleSnapshot[]> {
  const inspected: LifecycleSnapshot[] = [];
  for (const window of windows) {
    const result = await sendPreparation(window, 'inspect', INSPECT_TIMEOUT_MS);
    if (!result.ok) throw new Error(result.error || 'The window could not report its state.');
    snapshots.set(window.id, result.snapshot);
    inspected.push(result.snapshot);
  }
  return inspected;
}

async function showCannotConfirmDialog(
  parent: BrowserWindow,
  intent: GlobalIntent,
): Promise<boolean> {
  const action = destination(intent);
  const { response } = await dialog.showMessageBox(parent, {
    type: 'warning',
    title: `Cannot Confirm Safe ${action}`,
    message: 'BatchClip could not confirm whether every edit and job is safe.',
    detail: `Keep the app open and try again. Choose “${action} Anyway” only if you accept that recent work may be lost.`,
    buttons: ['Keep App Open', `${action} Anyway`],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return response === 1;
}

async function showPreparationFailure(parent: BrowserWindow, message: string): Promise<void> {
  await dialog.showMessageBox(parent, {
    type: 'error',
    title: 'BatchClip Stayed Open',
    message: 'BatchClip could not finish the safety check.',
    detail: `${message}\n\nYour project and running work remain open. Fix the problem, then try again.`,
    buttons: ['Keep App Open'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
}

async function confirmActiveWork(
  parent: BrowserWindow,
  intent: GlobalIntent,
  activeSnapshots: LifecycleSnapshot[],
): Promise<'keep-running' | 'stop' | 'cancel'> {
  const action = destination(intent);
  const primary = activeSnapshots.find((snapshot) => hasActiveWork(snapshot));
  const { response } = await dialog.showMessageBox(parent, {
    type: 'warning',
    title: `Work Is Still Running`,
    message: primary ? activeWorkDescription(primary) : 'A content job is still running.',
    detail:
      'Keep Running minimizes BatchClip and leaves the job alone. Stop waits for cancellation to finish before the app closes. Completed clips and cached analysis stay available.',
    buttons: ['Keep Running in Background', `Stop and ${action}`, 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (response === 0) return 'keep-running';
  if (response === 1) return 'stop';
  return 'cancel';
}

async function confirmUnsavedWork(
  parent: BrowserWindow,
  intent: GlobalIntent,
  activeSnapshots: LifecycleSnapshot[],
): Promise<'save' | 'discard' | 'cancel'> {
  const action = destination(intent);
  const { response } = await dialog.showMessageBox(parent, {
    type: 'warning',
    title: `Save Before ${action}?`,
    message: unsavedDescription(activeSnapshots),
    detail: `Save and ${action} waits for every save to finish. ${action} Without Saving permanently discards changes made since the last confirmed save.`,
    buttons: [`Save and ${action}`, `${action} Without Saving`, 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (response === 0) return 'save';
  if (response === 1) return 'discard';
  return 'cancel';
}

async function stopActiveWork(windows: BrowserWindow[]): Promise<void> {
  const main = windows.find((window) => snapshots.get(window.id)?.windowKind === 'main');
  if (!main)
    throw new Error('The project window is unavailable, so cancellation was not attempted.');
  const result = await sendPreparation(main, 'cancel-work', CANCELLATION_TIMEOUT_MS);
  if (!result.ok) throw new Error(result.error || 'The running job could not be cancelled.');
  snapshots.set(main.id, result.snapshot);
  if (hasActiveWork(result.snapshot)) {
    throw new Error('The project window still reports active work after cancellation.');
  }
}

async function saveDirtyWindows(windows: BrowserWindow[]): Promise<void> {
  const dirtyWindows = windows.filter((window) => {
    const snapshot = snapshots.get(window.id);
    return snapshot ? hasUnsavedWork(snapshot) : false;
  });

  for (const window of dirtyWindows) {
    const result = await sendPreparation(window, 'save', 10 * 60_000);
    if (!result.ok) throw new Error(result.error || 'A save was cancelled or failed.');
    snapshots.set(window.id, result.snapshot);
    if (hasUnsavedWork(result.snapshot)) {
      throw new Error('A window still reports unsaved changes after saving.');
    }
  }
}

function keepRunning(parent: BrowserWindow): void {
  if (parent.isMinimized()) return;
  parent.minimize();
}

function finishGlobalIntent(intent: GlobalIntent, _initiatingWindow: BrowserWindow): void {
  bypassLifecycleGuards = true;
  if (intent.startsWith('restart')) {
    app.relaunch();
  }
  app.quit();
}

async function coordinateGlobalIntent(
  intent: GlobalIntent,
  initiatingWindow: BrowserWindow,
  finish: (intent: GlobalIntent, initiatingWindow: BrowserWindow) => void = finishGlobalIntent,
): Promise<boolean> {
  if (!alive(initiatingWindow)) return false;
  const windows = trackedWindows();
  let currentSnapshots: LifecycleSnapshot[];

  try {
    currentSnapshots = await inspectWindows(windows);
  } catch {
    const proceed = await showCannotConfirmDialog(initiatingWindow, intent);
    if (!proceed) return false;
    finish(intent, initiatingWindow);
    return true;
  }

  if (currentSnapshots.some(hasActiveWork)) {
    const choice = await confirmActiveWork(initiatingWindow, intent, currentSnapshots);
    if (choice === 'keep-running') {
      keepRunning(initiatingWindow);
      return false;
    }
    if (choice === 'cancel') return false;

    try {
      await stopActiveWork(windows);
      currentSnapshots = await inspectWindows(windows);
    } catch (error) {
      await showPreparationFailure(
        initiatingWindow,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }

  if (currentSnapshots.some(hasUnsavedWork)) {
    const choice = await confirmUnsavedWork(initiatingWindow, intent, currentSnapshots);
    if (choice === 'cancel') return false;
    if (choice === 'save') {
      try {
        await saveDirtyWindows(windows);
      } catch (error) {
        await showPreparationFailure(
          initiatingWindow,
          error instanceof Error ? error.message : String(error),
        );
        return false;
      }
    }
  }

  finish(intent, initiatingWindow);
  return true;
}

function runGlobalIntent(intent: GlobalIntent, initiatingWindow: BrowserWindow): Promise<boolean> {
  if (lifecycleOperation) return lifecycleOperation;
  lifecycleOperation = coordinateGlobalIntent(intent, initiatingWindow).finally(() => {
    lifecycleOperation = null;
  });
  return lifecycleOperation;
}

async function coordinateSettingsClose(window: BrowserWindow): Promise<void> {
  try {
    const [snapshot] = await inspectWindows([window]);
    if (!snapshot?.settingsDirty) {
      allowedWindowCloses.add(window.id);
      window.close();
      return;
    }

    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      title: 'Save Settings?',
      message: 'Settings has unsaved changes.',
      detail:
        'Save Changes waits for encrypted settings storage to confirm the write before closing.',
      buttons: ['Save Changes', 'Discard Changes', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (response === 2) return;
    if (response === 0) {
      const result = await sendPreparation(window, 'save', 10 * 60_000);
      if (!result.ok || result.snapshot.settingsDirty) {
        throw new Error(result.error || 'Settings still reports unsaved changes.');
      }
      snapshots.set(window.id, result.snapshot);
    }
    allowedWindowCloses.add(window.id);
    window.close();
  } catch (error) {
    await showPreparationFailure(window, error instanceof Error ? error.message : String(error));
  }
}

function attachWindowCloseGuard(window: BrowserWindow): void {
  if (attachedWindows.has(window.id)) return;
  attachedWindows.add(window.id);

  window.on('close', (event: ElectronEvent) => {
    if (bypassLifecycleGuards || allowedWindowCloses.delete(window.id)) return;

    const snapshot = snapshots.get(window.id);
    const isMain = window === mainWindow;
    if (!isMain && snapshot?.windowKind !== 'settings') return;

    event.preventDefault();
    if (isMain) {
      void runGlobalIntent('close', window);
    } else if (!lifecycleOperation) {
      lifecycleOperation = coordinateSettingsClose(window)
        .then(() => false)
        .finally(() => {
          lifecycleOperation = null;
        });
    }
  });

  window.on('closed', () => {
    snapshots.delete(window.id);
    attachedWindows.delete(window.id);
    allowedWindowCloses.delete(window.id);
    rejectPendingForWindow(window.id);
  });
}

export function registerLifecycleHandlers(window: BrowserWindow): void {
  mainWindow = window;
  attachWindowCloseGuard(window);

  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle(
    Ch.Invoke.LIFECYCLE_REPORT_STATE,
    wrapHandler(Ch.Invoke.LIFECYCLE_REPORT_STATE, (event, snapshot: LifecycleSnapshot): void => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (!senderWindow) throw new Error('No BrowserWindow found for lifecycle state');
      snapshots.set(senderWindow.id, snapshot);
      attachWindowCloseGuard(senderWindow);
    }),
  );

  ipcMain.handle(
    Ch.Invoke.LIFECYCLE_COMPLETE_PREPARATION,
    wrapHandler(
      Ch.Invoke.LIFECYCLE_COMPLETE_PREPARATION,
      (event, result: LifecyclePrepareResult): void => {
        const senderWindow = BrowserWindow.fromWebContents(event.sender);
        const pending = pendingPreparations.get(result.requestId);
        if (!pending || !senderWindow || pending.windowId !== senderWindow.id) return;
        clearTimeout(pending.timeout);
        pendingPreparations.delete(result.requestId);
        snapshots.set(senderWindow.id, result.snapshot);
        pending.resolve(result);
      },
    ),
  );

  ipcMain.handle(
    Ch.Invoke.LIFECYCLE_REQUEST_RESTART,
    wrapHandler(
      Ch.Invoke.LIFECYCLE_REQUEST_RESTART,
      async (event, reason: AppRestartReason): Promise<boolean> => {
        if (reason !== 'update' && reason !== 'settings') {
          throw new Error('Unknown restart reason');
        }
        const senderWindow = BrowserWindow.fromWebContents(event.sender);
        const parent = alive(mainWindow) ? mainWindow : senderWindow;
        if (!parent) throw new Error('No window is available for restart confirmation');
        log('info', 'lifecycle', `${reason} restart requested`);
        return runGlobalIntent(reason === 'update' ? 'restart-update' : 'restart-settings', parent);
      },
    ),
  );

  app.on('browser-window-created', (_event, createdWindow) => {
    attachWindowCloseGuard(createdWindow);
  });

  app.on('before-quit', (event) => {
    if (bypassLifecycleGuards) return;
    const parent = alive(mainWindow) ? mainWindow : BrowserWindow.getAllWindows().find(alive);
    if (!parent) return;
    event.preventDefault();
    void runGlobalIntent('quit', parent);
  });
}
