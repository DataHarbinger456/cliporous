import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { Ch } from '@shared/ipc-channels';
import { BrowserWindow, ipcMain, screen, shell } from 'electron';
import { wrapHandler } from './ipc-error-handler';
import { loadWindowState, trackWindowState } from './window-state';

const SETTINGS_WINDOW_STATE_FILE = 'settings-window-state.json';
const DEFAULT_WIDTH = 540;
const DEFAULT_HEIGHT = 700;
const MIN_WIDTH = 400;
const MIN_HEIGHT = 480;

let settingsWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let handlersRegistered = false;

function alive(window: BrowserWindow | null): window is BrowserWindow {
  return window !== null && !window.isDestroyed();
}

export function openSettingsWindow(): void {
  if (alive(settingsWindow)) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.focus();
    return;
  }
  if (!alive(mainWindow)) return;

  const mainBounds = mainWindow.getBounds();
  const workArea = screen.getDisplayMatching(mainBounds).workArea;
  const defaultWidth = Math.min(DEFAULT_WIDTH, workArea.width);
  const defaultHeight = Math.min(DEFAULT_HEIGHT, workArea.height);
  const restoredState = loadWindowState(SETTINGS_WINDOW_STATE_FILE, {
    bounds: {
      x: mainBounds.x + mainBounds.width + 10,
      y: mainBounds.y,
      width: defaultWidth,
      height: defaultHeight,
    },
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
  });

  const owner = mainWindow;
  const restoredWorkArea = screen.getDisplayMatching(restoredState.bounds).workArea;
  const window = new BrowserWindow({
    ...restoredState.bounds,
    minWidth: Math.min(MIN_WIDTH, restoredWorkArea.width),
    minHeight: Math.min(MIN_HEIGHT, restoredWorkArea.height),
    parent: owner,
    modal: false,
    resizable: true,
    maximizable: true,
    show: false,
    autoHideMenuBar: process.platform === 'darwin',
    title: 'Settings — BatchContent',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      // Dev only: allow file:// media from the http://localhost Vite origin
      // (matches the main window). Packaged builds keep webSecurity on.
      webSecurity: !is.dev,
    },
  });
  settingsWindow = window;
  const stopTrackingWindowState = trackWindowState(window, SETTINGS_WINDOW_STATE_FILE);

  window.once('ready-to-show', () => {
    if (restoredState.isMaximized) window.maximize();
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url).catch(() => {
        // External help links are optional; the settings form remains usable.
      });
    }
    return { action: 'deny' };
  });

  window.on('closed', () => {
    stopTrackingWindowState();
    if (settingsWindow === window) settingsWindow = null;
    if (alive(owner)) owner.webContents.send(Ch.Send.SETTINGS_WINDOW_CLOSED, {});
  });

  if (is.dev) {
    window.webContents.on('before-input-event', (_event, input) => {
      if (
        input.key === 'F12' ||
        (input.control && input.shift && input.key.toLowerCase() === 'i')
      ) {
        window.webContents.toggleDevTools();
      }
    });
  }

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}#settings`);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'settings' });
  }
}

export function registerSettingsWindowHandlers(owner: BrowserWindow): void {
  mainWindow = owner;
  owner.on('closed', () => {
    if (mainWindow === owner) mainWindow = null;
    closeSettingsWindow();
  });

  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle(
    Ch.Invoke.SETTINGS_WINDOW_OPEN,
    wrapHandler(Ch.Invoke.SETTINGS_WINDOW_OPEN, () => openSettingsWindow()),
  );
  ipcMain.handle(
    Ch.Invoke.SETTINGS_WINDOW_CLOSE,
    wrapHandler(Ch.Invoke.SETTINGS_WINDOW_CLOSE, () => closeSettingsWindow()),
  );
  ipcMain.handle(
    Ch.Invoke.SETTINGS_WINDOW_IS_OPEN,
    wrapHandler(Ch.Invoke.SETTINGS_WINDOW_IS_OPEN, () => alive(settingsWindow)),
  );
}

export function closeSettingsWindow(): void {
  if (alive(settingsWindow)) settingsWindow.close();
}
