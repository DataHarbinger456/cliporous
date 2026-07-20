import type { HistoryMenuState } from '@shared/history';
import { Ch } from '@shared/ipc-channels';
import { app, type BrowserWindow, dialog, Menu, type MenuItemConstructorOptions } from 'electron';

const HISTORY_UNDO_MENU_ID = 'edit.history.undo';
const HISTORY_REDO_MENU_ID = 'edit.history.redo';

interface RecentProjectMenuEntry {
  name: string;
  path: string;
}

interface MenuContext {
  window: BrowserWindow;
  recents: RecentProjectMenuEntry[];
  history: HistoryMenuState;
}

let menuContext: MenuContext | null = null;

function sendRendererCommand(window: BrowserWindow, channel: string, payload: unknown = {}): void {
  if (!window.isDestroyed()) window.webContents.send(channel, payload);
}

function displayMenuLabel(label: string): string {
  return label.replace(/&/g, '&&');
}

function showUpdateStatus(window: BrowserWindow): void {
  sendRendererCommand(window, Ch.Send.UPDATE_CHECK_REQUEST);
}

function showAbout(window: BrowserWindow): void {
  void dialog.showMessageBox(window, {
    type: 'info',
    title: 'About BatchClip',
    message: `BatchClip ${app.getVersion()}`,
    detail: 'A calm cut room for turning long-form footage into publish-ready clips.',
    buttons: ['Done'],
  });
}

function recentProjectSubmenu(
  window: BrowserWindow,
  recents: readonly RecentProjectMenuEntry[],
): MenuItemConstructorOptions[] {
  if (recents.length === 0) return [{ label: 'No Recent Projects', enabled: false }];
  return recents.map((entry) => ({
    label: displayMenuLabel(entry.name),
    sublabel: entry.path,
    click: () =>
      sendRendererCommand(window, Ch.Send.PROJECT_OPEN_RECENT_REQUEST, { path: entry.path }),
  }));
}

export function buildApplicationMenuTemplate(
  window: BrowserWindow,
  recents: readonly RecentProjectMenuEntry[],
): MenuItemConstructorOptions[] {
  const isMac = process.platform === 'darwin';
  const settingsItem: MenuItemConstructorOptions = {
    label: isMac ? 'Settings…' : 'Settings',
    accelerator: 'CmdOrCtrl+,',
    click: () => sendRendererCommand(window, Ch.Send.SETTINGS_OPEN_REQUEST),
  };
  const keyboardShortcutsItem: MenuItemConstructorOptions = {
    label: 'Keyboard Shortcuts',
    accelerator: 'CmdOrCtrl+/',
    click: () => sendRendererCommand(window, Ch.Send.KEYBOARD_SHORTCUTS_REQUEST),
  };
  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: 'Check for Updates…',
    click: () => showUpdateStatus(window),
  };
  const whatsNewItem: MenuItemConstructorOptions = {
    label: 'What’s New',
    click: () => sendRendererCommand(window, Ch.Send.WHATS_NEW_REQUEST),
  };

  return [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              checkForUpdatesItem,
              { type: 'separator' as const },
              settingsItem,
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendRendererCommand(window, Ch.Send.PROJECT_NEW_REQUEST),
        },
        {
          label: 'Open Project…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendRendererCommand(window, Ch.Send.PROJECT_OPEN_REQUEST),
        },
        {
          label: 'Open Recent',
          submenu: recentProjectSubmenu(window, recents),
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendRendererCommand(window, Ch.Send.PROJECT_SAVE_REQUEST),
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendRendererCommand(window, Ch.Send.PROJECT_SAVE_AS_REQUEST),
        },
        ...(!isMac
          ? ([
              { type: 'separator' },
              settingsItem,
              { type: 'separator' },
              { role: 'quit' },
            ] as MenuItemConstructorOptions[])
          : []),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          id: HISTORY_UNDO_MENU_ID,
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          registerAccelerator: false,
          enabled: false,
          click: () => sendRendererCommand(window, Ch.Send.EDIT_UNDO_REQUEST),
        },
        {
          id: HISTORY_REDO_MENU_ID,
          label: 'Redo',
          accelerator: isMac ? 'CmdOrCtrl+Shift+Z' : 'Ctrl+Y',
          registerAccelerator: false,
          enabled: false,
          click: () => sendRendererCommand(window, Ch.Send.EDIT_REDO_REQUEST),
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? ([{ role: 'pasteAndMatchStyle' }] as MenuItemConstructorOptions[]) : []),
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          registerAccelerator: false,
          click: () => sendRendererCommand(window, Ch.Send.UI_ZOOM_REQUEST, { direction: 'reset' }),
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          registerAccelerator: false,
          click: () => sendRendererCommand(window, Ch.Send.UI_ZOOM_REQUEST, { direction: 'in' }),
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          registerAccelerator: false,
          click: () => sendRendererCommand(window, Ch.Send.UI_ZOOM_REQUEST, { direction: 'out' }),
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        keyboardShortcutsItem,
        whatsNewItem,
        ...(!isMac
          ? ([
              { type: 'separator' },
              checkForUpdatesItem,
              { type: 'separator' },
              {
                label: 'About BatchClip',
                click: () => showAbout(window),
              },
            ] as MenuItemConstructorOptions[])
          : []),
      ],
    },
  ];
}

function applyHistoryMenuState(state: HistoryMenuState): void {
  const menu = Menu.getApplicationMenu();
  const undoItem = menu?.getMenuItemById(HISTORY_UNDO_MENU_ID);
  const redoItem = menu?.getMenuItemById(HISTORY_REDO_MENU_ID);
  if (undoItem) {
    undoItem.label = state.undoLabel;
    undoItem.enabled = state.canUndo;
  }
  if (redoItem) {
    redoItem.label = state.redoLabel;
    redoItem.enabled = state.canRedo;
  }
}

function rebuildApplicationMenu(): void {
  if (!menuContext || menuContext.window.isDestroyed()) return;
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(buildApplicationMenuTemplate(menuContext.window, menuContext.recents)),
  );
  applyHistoryMenuState(menuContext.history);
}

export function updateHistoryMenuState(state: HistoryMenuState): void {
  if (menuContext) menuContext.history = state;
  applyHistoryMenuState(state);
}

export function updateRecentProjectsMenu(recents: readonly RecentProjectMenuEntry[]): void {
  if (!menuContext) return;
  menuContext.recents = [...recents];
  rebuildApplicationMenu();
}

/** Install standard desktop project commands and platform-correct accelerators. */
export function installApplicationMenu(
  window: BrowserWindow,
  recents: readonly RecentProjectMenuEntry[] = [],
): void {
  menuContext = {
    window,
    recents: [...recents],
    history: {
      canUndo: false,
      canRedo: false,
      undoLabel: 'Undo',
      redoLabel: 'Redo',
    },
  };
  rebuildApplicationMenu();
}
