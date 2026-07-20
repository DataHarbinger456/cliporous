import { Ch } from '@shared/ipc-channels';
import { type BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { name: 'BatchClip', getVersion: () => '0.1.0' },
  dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) },
  Menu: {
    buildFromTemplate: vi.fn((template) => template),
    getApplicationMenu: vi.fn(() => null),
    setApplicationMenu: vi.fn(),
  },
}));

import {
  buildApplicationMenuTemplate,
  installApplicationMenu,
  updateRecentProjectsMenu,
} from './app-menu';

const originalPlatform = process.platform;

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform });
});

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform });
}

function fakeWindow(): BrowserWindow {
  return {
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  } as unknown as BrowserWindow;
}

function submenu(item: MenuItemConstructorOptions | undefined): MenuItemConstructorOptions[] {
  return Array.isArray(item?.submenu) ? item.submenu : [];
}

function findItem(
  items: readonly MenuItemConstructorOptions[],
  label: string,
): MenuItemConstructorOptions | undefined {
  for (const item of items) {
    if (item.label === label) return item;
    const nested = submenu(item);
    const found = findItem(nested, label);
    if (found) return found;
  }
  return undefined;
}

describe('native application menu', () => {
  it('exposes the complete creator project menu and opens a recent path', () => {
    setPlatform('darwin');
    const window = fakeWindow();
    const template = buildApplicationMenuTemplate(window, [
      { name: 'Founder & Story', path: '/projects/founder.batchclip' },
    ]);

    expect(findItem(template, 'New Project')?.accelerator).toBe('CmdOrCtrl+N');
    expect(findItem(template, 'Open Project…')?.accelerator).toBe('CmdOrCtrl+O');
    expect(findItem(template, 'Save')?.accelerator).toBe('CmdOrCtrl+S');
    expect(findItem(template, 'Save As…')?.accelerator).toBe('CmdOrCtrl+Shift+S');
    expect(findItem(template, 'Settings…')?.accelerator).toBe('CmdOrCtrl+,');
    expect(findItem(template, 'Keyboard Shortcuts')?.accelerator).toBe('CmdOrCtrl+/');
    expect(findItem(template, 'Actual Size')?.accelerator).toBe('CmdOrCtrl+0');
    expect(findItem(template, 'Zoom In')?.registerAccelerator).toBe(false);
    expect(findItem(template, 'Check for Updates…')).toBeDefined();
    expect(findItem(template, 'What’s New')).toBeDefined();
    expect(findItem(template, 'Founder && Story')).toBeDefined();

    findItem(template, 'Founder && Story')?.click?.({} as never, window, {} as never);
    expect(window.webContents.send).toHaveBeenCalledWith(Ch.Send.PROJECT_OPEN_RECENT_REQUEST, {
      path: '/projects/founder.batchclip',
    });

    findItem(template, 'Zoom In')?.click?.({} as never, window, {} as never);
    expect(window.webContents.send).toHaveBeenCalledWith(Ch.Send.UI_ZOOM_REQUEST, {
      direction: 'in',
    });

    findItem(template, 'Check for Updates…')?.click?.({} as never, window, {} as never);
    expect(window.webContents.send).toHaveBeenCalledWith(Ch.Send.UPDATE_CHECK_REQUEST, {});

    findItem(template, 'What’s New')?.click?.({} as never, window, {} as never);
    expect(window.webContents.send).toHaveBeenCalledWith(Ch.Send.WHATS_NEW_REQUEST, {});
  });

  it('rebuilds Open Recent when project metadata changes after launch', () => {
    const window = fakeWindow();
    const buildFromTemplate = vi.mocked(Menu.buildFromTemplate);
    buildFromTemplate.mockClear();

    installApplicationMenu(window, []);
    updateRecentProjectsMenu([{ name: 'Launch Cut', path: '/projects/launch-cut.batchclip' }]);

    const latestTemplate = buildFromTemplate.mock.calls.at(-1)?.[0];
    expect(latestTemplate).toBeDefined();
    expect(findItem(latestTemplate ?? [], 'Launch Cut')).toBeDefined();
  });

  it('uses Windows redo and settings conventions with Help-based update and About items', () => {
    setPlatform('win32');
    const template = buildApplicationMenuTemplate(fakeWindow(), []);

    expect(findItem(template, 'Redo')?.accelerator).toBe('Ctrl+Y');
    expect(findItem(template, 'Settings')?.accelerator).toBe('CmdOrCtrl+,');
    expect(findItem(template, 'No Recent Projects')?.enabled).toBe(false);
    expect(findItem(template, 'Check for Updates…')).toBeDefined();
    expect(findItem(template, 'About BatchClip')).toBeDefined();
  });
});
