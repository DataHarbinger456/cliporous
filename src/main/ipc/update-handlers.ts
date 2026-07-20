import { Ch } from '@shared/ipc-channels';
import type { AppUpdateState } from '@shared/updater';
import { app, BrowserWindow, ipcMain } from 'electron';
import electronUpdater, { type AppUpdater } from 'electron-updater';
import { wrapHandler } from '../ipc-error-handler';
import { log } from '../logger';
import { prepareManagedUpdateRestart } from './lifecycle-handlers';

const POLL_INTERVAL_MS = 60 * 60 * 1_000;

let handlersRegistered = false;
let updaterConfigured = false;
let checkingManually = false;
let updater: AppUpdater | null = null;

function getUpdater(): AppUpdater {
  updater ??= electronUpdater.autoUpdater;
  return updater;
}
let state: AppUpdateState = {
  phase: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: null,
  progressPercent: null,
  message: null,
  manual: false,
};

function broadcast(next: Partial<AppUpdateState>): AppUpdateState {
  state = { ...state, ...next };
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(Ch.Send.UPDATE_STATE, state);
  }
  return state;
}

function quietFailure(error: unknown): void {
  log('warn', 'updater', 'Update check failed', {
    message: error instanceof Error ? error.message : String(error),
  });
  if (checkingManually || state.phase === 'downloading') {
    broadcast({
      phase: 'error',
      message:
        state.phase === 'downloading'
          ? 'The signed update could not finish downloading. Your project was not changed.'
          : 'Couldn’t reach the release service. Your current cut stays safe.',
      progressPercent: null,
      manual: true,
    });
  } else {
    broadcast({ phase: 'idle', message: null, progressPercent: null, manual: false });
  }
  checkingManually = false;
}

function configureUpdater(): void {
  if (updaterConfigured || !app.isPackaged) return;
  const activeUpdater = getUpdater();
  updaterConfigured = true;
  activeUpdater.autoDownload = false;
  activeUpdater.autoInstallOnAppQuit = false;
  activeUpdater.allowPrerelease = false;
  activeUpdater.disableWebInstaller = true;
  activeUpdater.logger = {
    info: (message?: unknown) => log('info', 'updater', String(message ?? '')),
    warn: (message?: unknown) => log('warn', 'updater', String(message ?? '')),
    error: (message?: unknown) => log('error', 'updater', String(message ?? '')),
    debug: (message?: unknown) => log('debug', 'updater', String(message ?? '')),
  };

  activeUpdater.on('checking-for-update', () => {
    broadcast({
      phase: 'checking',
      message: null,
      progressPercent: null,
      manual: checkingManually,
    });
  });
  activeUpdater.on('update-available', (info) => {
    checkingManually = false;
    broadcast({
      phase: 'available',
      availableVersion: info.version,
      progressPercent: null,
      message: 'A signed BatchClip update is ready to download.',
    });
  });
  activeUpdater.on('update-not-available', () => {
    const manual = checkingManually;
    checkingManually = false;
    broadcast({
      phase: 'idle',
      availableVersion: null,
      progressPercent: null,
      message: manual ? 'BatchClip is up to date.' : null,
      manual,
    });
  });
  activeUpdater.on('download-progress', (progress) => {
    broadcast({
      phase: 'downloading',
      progressPercent: Math.max(0, Math.min(100, progress.percent)),
      message: 'Downloading the signed update.',
    });
  });
  activeUpdater.on('update-downloaded', (info) => {
    broadcast({
      phase: 'ready',
      availableVersion: info.version,
      progressPercent: 100,
      message: 'Update ready. Restart when your studio work is saved.',
    });
  });
  activeUpdater.on('error', quietFailure);
}

export async function checkForAppUpdates(manual = false): Promise<AppUpdateState> {
  if (!app.isPackaged) {
    return broadcast({
      phase: 'idle',
      message: manual ? 'Update checks run in installed, signed builds.' : null,
      manual,
    });
  }
  configureUpdater();
  checkingManually = manual;
  try {
    await getUpdater().checkForUpdates();
  } catch (error) {
    quietFailure(error);
  }
  return state;
}

export function registerUpdateHandlers(): void {
  configureUpdater();
  if (!handlersRegistered) {
    handlersRegistered = true;
    ipcMain.handle(
      Ch.Invoke.UPDATE_GET_STATE,
      wrapHandler(Ch.Invoke.UPDATE_GET_STATE, () => state),
    );
    ipcMain.handle(
      Ch.Invoke.UPDATE_CHECK,
      wrapHandler(Ch.Invoke.UPDATE_CHECK, () => checkForAppUpdates(true)),
    );
    ipcMain.handle(
      Ch.Invoke.UPDATE_DOWNLOAD,
      wrapHandler(Ch.Invoke.UPDATE_DOWNLOAD, async () => {
        if (state.phase !== 'available') return state;
        broadcast({ phase: 'downloading', progressPercent: 0, message: 'Starting download.' });
        await getUpdater().downloadUpdate();
        return state;
      }),
    );
    ipcMain.handle(
      Ch.Invoke.UPDATE_INSTALL,
      wrapHandler(Ch.Invoke.UPDATE_INSTALL, async (event) => {
        if (state.phase !== 'ready') return false;
        const senderWindow = BrowserWindow.fromWebContents(event.sender);
        const parent =
          senderWindow ?? BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
        if (!parent || !(await prepareManagedUpdateRestart(parent))) return false;
        setImmediate(() => getUpdater().quitAndInstall(false, true));
        return true;
      }),
    );
  }

  if (!app.isPackaged) return;
  void checkForAppUpdates(false);
  const timer = setInterval(() => void checkForAppUpdates(false), POLL_INTERVAL_MS);
  timer.unref();
}
