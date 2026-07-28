/**
 * Main process entry point — thin bootstrap.
 *
 * Responsibilities:
 *   • Initialise the file logger as soon as the app is ready.
 *   • Configure FFmpeg paths.
 *   • Register every IPC handler module under `./ipc/`.
 *   • Create the main BrowserWindow with the light default background so launch
 *     never flashes white before the renderer applies the persisted theme.
 *   • Wire process-level crash handlers — `uncaughtException` shows a native
 *     dialog with a copy-to-clipboard option then exits;
 *     `unhandledRejection` is logged to the console only.
 *
 * No business logic lives here.
 */

import { join } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { app, BrowserWindow, clipboard, dialog, screen, shell } from 'electron';
import { installApplicationMenu } from './app-menu';
import { setupFFmpeg } from './ffmpeg';
import {
  registerAiHandlers,
  registerBrandKitHandlers,
  registerExportHandlers,
  registerFfmpegHandlers,
  registerHyperFramesHandlers,
  registerLifecycleHandlers,
  registerLongformHandlers,
  registerMediaHandlers,
  registerMenuHandlers,
  registerProjectHandlers,
  registerRenderHandlers,
  registerSecretsHandlers,
  registerSystemHandlers,
  registerUpdateHandlers,
} from './ipc';
import { loadRecentProjects } from './ipc/project-handlers';
import { closeLogger, initLogger, log } from './logger';
import { installProjectFileIntegration } from './project-file-integration';
import { registerSettingsWindowHandlers } from './settings-window';
import { loadWindowState, trackWindowState } from './window-state';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Light default surface — matched here to prevent a white/dark launch flash. */
const WINDOW_BACKGROUND = '#f7f3ec';

const DEFAULT_WIDTH = 1180;
const DEFAULT_HEIGHT = 760;
const MIN_WIDTH = 900;
const MIN_HEIGHT = 640;
const MAIN_WINDOW_STATE_FILE = 'main-window-state.json';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;

function releaseIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../build/icon.png');
}

/**
 * Return the main window only if it exists AND has not been destroyed.
 *
 * Required because optional chaining (`mainWindow?.webContents.send`) only
 * guards against `null` — it does NOT catch the "Object has been destroyed"
 * Electron throws when you touch any property of a `BrowserWindow` after
 * its native peer is gone. That crash bubbles up through `app` event
 * handlers (e.g. `second-instance` after the user closed the window on
 * macOS while the app stays alive) and kills the whole main process.
 */
function getAliveMainWindow(): BrowserWindow | null {
  if (mainWindow !== null && !mainWindow.isDestroyed()) return mainWindow;
  return null;
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

function createMainWindow(): BrowserWindow {
  const workArea = screen.getPrimaryDisplay().workArea;
  const defaultWidth = Math.min(DEFAULT_WIDTH, workArea.width);
  const defaultHeight = Math.min(DEFAULT_HEIGHT, workArea.height);
  const restoredState = loadWindowState(MAIN_WINDOW_STATE_FILE, {
    bounds: {
      x: workArea.x + Math.round((workArea.width - defaultWidth) / 2),
      y: workArea.y + Math.round((workArea.height - defaultHeight) / 2),
      width: defaultWidth,
      height: defaultHeight,
    },
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
  });
  const restoredWorkArea = screen.getDisplayMatching(restoredState.bounds).workArea;
  const win = new BrowserWindow({
    ...restoredState.bounds,
    minWidth: Math.min(MIN_WIDTH, restoredWorkArea.width),
    minHeight: Math.min(MIN_HEIGHT, restoredWorkArea.height),
    show: false,
    backgroundColor: WINDOW_BACKGROUND,
    icon: releaseIconPath(),
    autoHideMenuBar: process.platform === 'darwin',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 14 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Dev only: the renderer is served from http://localhost (Vite), so
      // Chromium blocks file:// <video> sources unless webSecurity is off.
      // Packaged builds load index.html via file:// and keep webSecurity on.
      webSecurity: app.isPackaged,
    },
  });

  // Register before navigation so the renderer cannot report lifecycle state
  // before the corresponding IPC handlers exist.
  registerLifecycleHandlers(win);
  const stopTrackingWindowState = trackWindowState(win, MAIN_WINDOW_STATE_FILE);
  win.once('ready-to-show', () => {
    if (restoredState.isMaximized) win.maximize();
    win.show();
  });

  // Null the module-level reference as soon as the native peer is gone so
  // later `app` event handlers (second-instance, activate) and async IPC
  // senders (Python setup, render progress) don't touch a destroyed window.
  win.on('closed', () => {
    stopTrackingWindowState();
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  // Open external links in the default browser instead of a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {
      /* ignore */
    });
    return { action: 'deny' };
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  installApplicationMenu(win, loadRecentProjects());
  return win;
}

// ---------------------------------------------------------------------------
// Crash handlers
// ---------------------------------------------------------------------------

function showFatalDialog(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error && err.stack ? err.stack : message;

  const detail = `${message}\n\n${stack}`;

  // dialog.showMessageBoxSync is safe to call before/after windows exist.
  const choice = dialog.showMessageBoxSync({
    type: 'error',
    title: 'BatchClip needs to close',
    message: 'The cut room stopped unexpectedly.',
    detail: `Your saved project and existing exports stay on disk. Reopen BatchClip to check recovery options.\n\nTechnical details:\n${detail}`,
    buttons: ['Copy technical details', 'Close BatchClip'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });

  if (choice === 0) {
    clipboard.writeText(detail);
  }
}

function installCrashHandlers(): void {
  process.on('uncaughtException', (err) => {
    try {
      log('error', 'main', 'uncaughtException', {
        message: String(err),
        stack: (err as Error)?.stack,
      });
      console.error('[main] uncaughtException:', err);
      showFatalDialog(err);
    } finally {
      closeLogger();
      app.exit(1);
    }
  });

  process.on('unhandledRejection', (reason) => {
    // Console-only by design — do not crash, do not surface a dialog.
    console.error('[main] unhandledRejection:', reason);
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

installCrashHandlers();

// Single-instance lock plus native .batchclip open routing.
installProjectFileIntegration(getAliveMainWindow);
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    initLogger();
    log('info', 'main', 'app ready');

    app.setAboutPanelOptions({
      applicationName: 'BatchClip',
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      credits: 'A calm creator cut room for publish-ready clips.',
      iconPath: releaseIconPath(),
    });
    electronApp.setAppUserModelId('com.batchcontent.app');

    setupFFmpeg();

    // Register every IPC handler module.
    registerAiHandlers();
    registerBrandKitHandlers();
    registerExportHandlers();
    registerFfmpegHandlers();
    registerMediaHandlers();
    registerMenuHandlers();
    registerProjectHandlers();
    registerRenderHandlers();
    registerSecretsHandlers();
    registerSystemHandlers();
    registerHyperFramesHandlers();
    registerLongformHandlers();
    registerUpdateHandlers();

    mainWindow = createMainWindow();
    registerSettingsWindowHandlers(mainWindow);

    // Dev-only: F12 toggles DevTools, Ctrl/Cmd+R is suppressed in production.
    app.on('browser-window-created', (_event, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
        registerSettingsWindowHandlers(mainWindow);
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      closeLogger();
      app.quit();
    }
  });

  app.on('will-quit', () => {
    closeLogger();
  });
}
