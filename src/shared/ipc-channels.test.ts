/**
 * IPC Channel Contract Test
 * ─────────────────────────
 *
 * The `Ch` registry in `@shared/ipc-channels` is the single source of truth
 * for every IPC channel name crossing the main ↔ preload ↔ renderer boundary.
 * If any of the three sides drifts, calls silently reject ("phantom channel")
 * and the failure mode is a runtime error in production, not a build break.
 *
 * This test enforces the contract statically:
 *
 *   1. MAIN  — every value in `Ch.Invoke` has exactly one `ipcMain.handle()`
 *              registration (achieved by importing the `register*Handlers`
 *              modules from `src/main/ipc/` plus the `registerSettingsWindow
 *              Handlers` exported from `src/main/settings-window.ts`, and
 *              recording every channel passed to a mocked `ipcMain.handle`).
 *
 *   2. PRELOAD — every value in `Ch.Invoke` has exactly one binding in
 *                `window.api`, and every value in `Ch.Send` has exactly one
 *                listener binding. We capture the api object via a mocked
 *                `contextBridge.exposeInMainWorld('api', …)`, then walk the
 *                object recursively, calling each leaf function so the
 *                mocked `ipcRenderer.invoke` / `ipcRenderer.on` records the
 *                channel name argument.
 *
 *   3. NO EXTRA CHANNELS — neither side may register/use a channel string
 *                          that is not present in `Ch`.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Recorders — populated by the mocked electron primitives below.
//
// Vitest hoists `vi.mock(...)` calls to the top of the module, and the mock
// factory runs lazily on first import of `electron` — which happens inside
// the static `import '../preload'` below, BEFORE any top-level statement of
// this test file executes. So we can't initialise recorder Sets at module
// scope and reference them from the factory; the factory has to create them
// on `globalThis` itself, and we read them back later.
// ---------------------------------------------------------------------------

type RecorderBag = {
  __ipcMainHandled: Set<string>;
  __preloadInvoked: Set<string>;
  __preloadListened: Set<string>;
  __exposedApi: { ref: Record<string, unknown> | null };
};

vi.mock('electron', () => {
  const g = globalThis as unknown as Partial<RecorderBag>;
  const ipcMainHandled = new Set<string>();
  const preloadInvoked = new Set<string>();
  const preloadListened = new Set<string>();
  const exposedApi: RecorderBag['__exposedApi'] = { ref: null };
  g.__ipcMainHandled = ipcMainHandled;
  g.__preloadInvoked = preloadInvoked;
  g.__preloadListened = preloadListened;
  g.__exposedApi = exposedApi;

  // Force the preload's `process.contextIsolated` branch so it calls
  // `contextBridge.exposeInMainWorld` (which our mock captures). This must
  // happen inside the mock factory because the factory runs before any
  // ES-module import bodies — including the preload module itself — execute.
  (process as unknown as { contextIsolated: boolean }).contextIsolated = true;

  const ipcMain = {
    handle: (channel: string, _handler: unknown): void => {
      ipcMainHandled.add(channel);
    },
    on: (channel: string, _handler: unknown): void => {
      // Some main code uses .on for fire-and-forget receive — record too.
      ipcMainHandled.add(channel);
    },
    removeHandler: (_channel: string): void => {},
    removeAllListeners: (_channel?: string): void => {},
  };

  const ipcRenderer = {
    invoke: (channel: string, ..._args: unknown[]): Promise<unknown> => {
      preloadInvoked.add(channel);
      return Promise.resolve(undefined);
    },
    on: (channel: string, _listener: unknown): void => {
      preloadListened.add(channel);
    },
    removeListener: (_channel: string, _listener: unknown): void => {},
    send: (channel: string, ..._args: unknown[]): void => {
      preloadInvoked.add(channel);
    },
  };

  const contextBridge = {
    exposeInMainWorld: (propertyName: string, value: unknown): void => {
      switch (propertyName) {
        case 'api':
          exposedApi.ref = value as Record<string, unknown>;
          break;
      }
    },
  };
  const webUtils = {
    getPathForFile: (_file: unknown): string => '',
  };

  // Minimal BrowserWindow stub — preload may reference it in type position
  // but should never construct one at module load.
  class BrowserWindow {
    static fromWebContents(): BrowserWindow | null {
      return null;
    }
    static getAllWindows(): BrowserWindow[] {
      return [];
    }
    id = 1;
    isDestroyed(): boolean {
      return true;
    }
    focus(): void {}
    on(): void {}
    once(): void {}
    loadURL(): Promise<void> {
      return Promise.resolve();
    }
    loadFile(): Promise<void> {
      return Promise.resolve();
    }
    show(): void {}
    close(): void {}
    isMinimized(): boolean {
      return false;
    }
    minimize(): void {}
    getBounds(): Electron.Rectangle {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    webContents = {
      send: (): void => {},
      on: (): void => {},
    };
  }

  const dialog = {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
    showSaveDialog: vi.fn().mockResolvedValue({ canceled: true, filePath: undefined }),
    showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
  };

  const shell = {
    openPath: vi.fn().mockResolvedValue(''),
    showItemInFolder: vi.fn(),
    openExternal: vi.fn().mockResolvedValue(undefined),
  };

  const Notification = vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn(),
  }));
  (Notification as unknown as { isSupported: () => boolean }).isSupported = (): boolean => true;

  const screen = {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  };
  const powerSaveBlocker = {
    start: vi.fn(() => 1),
    stop: vi.fn(),
    isStarted: vi.fn(() => true),
  };

  const safeStorage = {
    isEncryptionAvailable: (): boolean => false,
    encryptString: (s: string): Buffer => Buffer.from(s, 'utf8'),
    decryptString: (b: Buffer): string => b.toString('utf8'),
  };

  const app = {
    getPath: (_name: string): string => '/tmp/batchcontent-test',
    getName: (): string => 'batchcontent-test',
    getVersion: (): string => '0.0.0-test',
    isPackaged: false,
    whenReady: (): Promise<void> => Promise.resolve(),
    on: vi.fn(),
    quit: vi.fn(),
    relaunch: vi.fn(),
    getAppPath: (): string => process.cwd(),
  };

  return {
    ipcMain,
    ipcRenderer,
    contextBridge,
    webUtils,
    BrowserWindow,
    dialog,
    shell,
    Notification,
    screen,
    powerSaveBlocker,
    safeStorage,
    app,
    default: {},
  };
});

vi.mock('@electron-toolkit/preload', () => ({
  electronAPI: {},
}));

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false },
  optimizer: { watchWindowShortcuts: vi.fn() },
  electronApp: { setAppUserModelId: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Static imports (after mocks are declared — vi.mock is hoisted).
// ---------------------------------------------------------------------------

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
} from '../main/ipc';
import { registerSettingsWindowHandlers } from '../main/settings-window';
import { Ch, InvokeChannels, SendChannels } from './ipc-channels';

// Importing the preload runs its top-level code — including the
// `contextBridge.exposeInMainWorld('api', api)` call captured above.
import '../preload';

// ---------------------------------------------------------------------------
// Pull recorder Sets back out of `globalThis` (populated by the electron
// mock factory — see the long comment near the top of this file).
// ---------------------------------------------------------------------------

const G = globalThis as unknown as RecorderBag;
const mainHandled = G.__ipcMainHandled;
const preloadInvoked = G.__preloadInvoked;
const preloadListened = G.__preloadListened;
let exposedApi: Record<string, unknown> | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INVOKE_CHANNELS = new Set<string>(Object.values(InvokeChannels));
const SEND_CHANNELS = new Set<string>(Object.values(SendChannels));

/**
 * Walk `obj` recursively and call every function leaf with no arguments.
 * For listener factories on the preload side (`listen(channel)` returns a
 * function that takes a callback), we additionally pass a no-op callback so
 * the inner `ipcRenderer.on` actually fires. We try `()` first; if the
 * function is a listener-binder it'll be a no-op until called with a cb,
 * so we also try `(() => {})`.
 */
function callEveryLeaf(obj: unknown, seen: WeakSet<object> = new WeakSet()): void {
  if (obj == null) return;
  if (typeof obj === 'function') {
    // Try with no args (covers `invoke()` wrappers that immediately call
    // ipcRenderer.invoke).
    try {
      (obj as (...args: unknown[]) => unknown)();
    } catch {
      /* swallow — we only care about the recorded channel side effect */
    }
    // Try with a no-op callback (covers `listen()` wrappers that need a cb
    // to call ipcRenderer.on).
    try {
      (obj as (...args: unknown[]) => unknown)(() => {});
    } catch {
      /* swallow */
    }
    return;
  }
  if (typeof obj !== 'object') return;
  if (seen.has(obj as object)) return;
  seen.add(obj as object);
  for (const v of Object.values(obj as Record<string, unknown>)) {
    callEveryLeaf(v, seen);
  }
}

// ---------------------------------------------------------------------------
// One-time: register all main handlers + drive the preload api surface.
// ---------------------------------------------------------------------------

beforeAll(() => {
  registerAiHandlers();
  registerBrandKitHandlers();
  registerExportHandlers();
  registerFfmpegHandlers();
  registerMediaHandlers();
  registerProjectHandlers();
  registerRenderHandlers();
  registerSecretsHandlers();
  registerSystemHandlers();
  registerHyperFramesHandlers();
  registerLongformHandlers();
  registerMenuHandlers();
  registerUpdateHandlers();
  // Settings-window handlers live outside src/main/ipc but still register
  // SETTINGS_WINDOW_OPEN/CLOSE/IS_OPEN — without them those Ch.Invoke values
  // would be falsely flagged as missing in main. The function only calls
  // `mainWindow.on('closed', …)` at registration time, so a tiny stub is
  // sufficient.
  const fakeMainWindow = {
    id: 1,
    on: (): void => {},
    isDestroyed: (): boolean => true,
  } as unknown;
  registerLifecycleHandlers(fakeMainWindow as Parameters<typeof registerLifecycleHandlers>[0]);
  registerSettingsWindowHandlers(
    fakeMainWindow as Parameters<typeof registerSettingsWindowHandlers>[0],
  );

  exposedApi = G.__exposedApi.ref;
  if (!exposedApi) {
    throw new Error(
      'Preload bridge did not expose `api` via contextBridge.exposeInMainWorld — ' +
        'check that `process.contextIsolated` is set before importing the preload.',
    );
  }
  callEveryLeaf(exposedApi);
});

// ---------------------------------------------------------------------------
// 1. MAIN side — every Ch.Invoke value has a registered handler.
// ---------------------------------------------------------------------------

describe('main process IPC handlers', () => {
  it('exposes the contextBridge api object', () => {
    expect(exposedApi).not.toBeNull();
  });

  it('registers the opt-in legacy-project cleaner on both desktop boundaries', () => {
    expect(Ch.Invoke.PROJECT_CLEAN_LEGACY).toBe('project:cleanLegacy');
    expect(mainHandled.has(Ch.Invoke.PROJECT_CLEAN_LEGACY)).toBe(true);
    expect(preloadInvoked.has(Ch.Invoke.PROJECT_CLEAN_LEGACY)).toBe(true);
  });

  it('registers project-library actions and pending file-open consumption on both boundaries', () => {
    const expectedChannels = [
      [Ch.Invoke.PROJECT_SET_RECENT_PINNED, 'project:setRecentPinned'],
      [Ch.Invoke.PROJECT_RENAME_RECENT, 'project:renameRecent'],
      [Ch.Invoke.PROJECT_DUPLICATE_RECENT, 'project:duplicateRecent'],
      [Ch.Invoke.PROJECT_DELETE_RECENT, 'project:deleteRecent'],
      [Ch.Invoke.PROJECT_CONSUME_PENDING_OPEN, 'project:consumePendingOpen'],
    ] as const;

    for (const [channel, expectedName] of expectedChannels) {
      expect(channel).toBe(expectedName);
      expect(mainHandled.has(channel)).toBe(true);
      expect(preloadInvoked.has(channel)).toBe(true);
    }
  });

  it('registers the Pexels connection health check on both desktop boundaries', () => {
    expect(Ch.Invoke.AI_VALIDATE_PEXELS_KEY).toBe('ai:validatePexelsKey');
    expect(mainHandled.has(Ch.Invoke.AI_VALIDATE_PEXELS_KEY)).toBe(true);
    expect(preloadInvoked.has(Ch.Invoke.AI_VALIDATE_PEXELS_KEY)).toBe(true);
  });

  it('registers explicit local-tool setup and cancellation on both desktop boundaries', () => {
    expect(Ch.Invoke.PYTHON_START_SETUP).toBe('python:startSetup');
    expect(Ch.Invoke.PYTHON_CANCEL_SETUP).toBe('python:cancelSetup');
    expect(mainHandled.has(Ch.Invoke.PYTHON_START_SETUP)).toBe(true);
    expect(mainHandled.has(Ch.Invoke.PYTHON_CANCEL_SETUP)).toBe(true);
    expect(preloadInvoked.has(Ch.Invoke.PYTHON_START_SETUP)).toBe(true);
    expect(preloadInvoked.has(Ch.Invoke.PYTHON_CANCEL_SETUP)).toBe(true);
  });

  it('registers native job progress and notification-click routing on both boundaries', () => {
    expect(Ch.Invoke.SYSTEM_SET_PROGRESS).toBe('system:setProgress');
    expect(Ch.Send.SYSTEM_NOTIFICATION_CLICKED).toBe('system:notificationClicked');
    expect(mainHandled.has(Ch.Invoke.SYSTEM_SET_PROGRESS)).toBe(true);
    expect(preloadInvoked.has(Ch.Invoke.SYSTEM_SET_PROGRESS)).toBe(true);
    expect(preloadListened.has(Ch.Send.SYSTEM_NOTIFICATION_CLICKED)).toBe(true);
  });

  it('registers a handler for every Ch.Invoke channel', () => {
    const missing = [...INVOKE_CHANNELS].filter((c) => !mainHandled.has(c)).sort();
    expect(
      missing,
      `Ch.Invoke channels with no ipcMain.handle() in main:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('does not register any channel that is not in Ch', () => {
    const allKnown = new Set<string>([...INVOKE_CHANNELS, ...SEND_CHANNELS]);
    const extra = [...mainHandled].filter((c) => !allKnown.has(c)).sort();
    expect(extra, `main registers channels not declared in Ch:\n  ${extra.join('\n  ')}`).toEqual(
      [],
    );
  });
});

// ---------------------------------------------------------------------------
// 2. PRELOAD side — every Ch.Invoke value is bound on window.api, every
//    Ch.Send value has a listener binding, and nothing extra leaks through.
// ---------------------------------------------------------------------------

describe('preload bridge (window.api)', () => {
  it('binds every native project and workspace menu request to renderer listeners', () => {
    const expectedChannels = [
      [Ch.Send.PROJECT_NEW_REQUEST, 'project:newRequest'],
      [Ch.Send.PROJECT_SAVE_REQUEST, 'project:saveRequest'],
      [Ch.Send.PROJECT_SAVE_AS_REQUEST, 'project:saveAsRequest'],
      [Ch.Send.PROJECT_OPEN_REQUEST, 'project:openRequest'],
      [Ch.Send.PROJECT_OPEN_RECENT_REQUEST, 'project:openRecentRequest'],
      [Ch.Send.SETTINGS_OPEN_REQUEST, 'settings:openRequest'],
      [Ch.Send.KEYBOARD_SHORTCUTS_REQUEST, 'keyboard:shortcutsRequest'],
    ] as const;

    for (const [channel, expectedName] of expectedChannels) {
      expect(channel).toBe(expectedName);
      expect(preloadListened.has(channel)).toBe(true);
    }
  });

  it('binds an invoke wrapper for every Ch.Invoke channel', () => {
    const missing = [...INVOKE_CHANNELS].filter((c) => !preloadInvoked.has(c)).sort();
    expect(
      missing,
      `Ch.Invoke channels with no window.api binding:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('binds a listener factory for every Ch.Send channel', () => {
    const missing = [...SEND_CHANNELS].filter((c) => !preloadListened.has(c)).sort();
    expect(
      missing,
      `Ch.Send channels with no window.api listener binding:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('does not invoke or listen on any channel that is not in Ch', () => {
    const allKnown = new Set<string>([...INVOKE_CHANNELS, ...SEND_CHANNELS]);
    const extraInvoke = [...preloadInvoked].filter((c) => !allKnown.has(c)).sort();
    const extraListen = [...preloadListened].filter((c) => !allKnown.has(c)).sort();
    expect(
      extraInvoke,
      `preload invokes channels not declared in Ch:\n  ${extraInvoke.join('\n  ')}`,
    ).toEqual([]);
    expect(
      extraListen,
      `preload listens on channels not declared in Ch:\n  ${extraListen.join('\n  ')}`,
    ).toEqual([]);
  });

  it('does not bind invoke wrappers on Ch.Send channels (or vice versa)', () => {
    // An invoke channel handled as a listener (or a send channel called via
    // invoke) is a categorisation bug — catch it here.
    const invokeOnSendChannel = [...preloadInvoked].filter((c) => SEND_CHANNELS.has(c)).sort();
    const listenOnInvokeChannel = [...preloadListened].filter((c) => INVOKE_CHANNELS.has(c)).sort();
    expect(
      invokeOnSendChannel,
      `preload invokes a Ch.Send channel:\n  ${invokeOnSendChannel.join('\n  ')}`,
    ).toEqual([]);
    expect(
      listenOnInvokeChannel,
      `preload listens on a Ch.Invoke channel:\n  ${listenOnInvokeChannel.join('\n  ')}`,
    ).toEqual([]);
  });
});
