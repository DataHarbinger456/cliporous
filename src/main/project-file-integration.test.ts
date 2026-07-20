import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ch } from '@shared/ipc-channels';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appMock = vi.hoisted(() => ({
  listeners: new Map<string, (...args: unknown[]) => void>(),
  on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
    appMock.listeners.set(event, listener);
  }),
}));

vi.mock('electron', () => ({ app: appMock }));

import {
  consumePendingProjectPath,
  installProjectFileIntegration,
} from './project-file-integration';

describe('native project-file integration', () => {
  beforeEach(() => {
    appMock.listeners.clear();
    appMock.on.mockClear();
    consumePendingProjectPath();
  });

  it('queues a startup .batchclip path and delivers later second-instance opens', () => {
    const directory = mkdtempSync(join(tmpdir(), 'batchclip-file-open-'));
    const startupPath = join(directory, 'Startup.batchclip');
    const secondPath = join(directory, 'Second.batchclip');
    writeFileSync(startupPath, '{}');
    writeFileSync(secondPath, '{}');

    const send = vi.fn();
    const focus = vi.fn();
    const show = vi.fn();
    const window = {
      isDestroyed: () => false,
      isMinimized: () => false,
      show,
      focus,
      webContents: { isLoadingMainFrame: () => false, send },
    };

    try {
      installProjectFileIntegration(() => window as never, ['electron', startupPath]);
      expect(consumePendingProjectPath()).toBe(startupPath);

      appMock.listeners.get('second-instance')?.({}, ['batchclip', secondPath], directory);
      expect(show).toHaveBeenCalledOnce();
      expect(focus).toHaveBeenCalledOnce();
      expect(send).toHaveBeenCalledWith(Ch.Send.PROJECT_OPEN_RECENT_REQUEST, {
        path: secondPath,
      });
    } finally {
      unlinkSync(startupPath);
      unlinkSync(secondPath);
      rmdirSync(directory);
    }
  });

  it('ignores missing and non-project startup arguments', () => {
    installProjectFileIntegration(() => null, ['electron', '/missing/video.mp4']);
    expect(consumePendingProjectPath()).toBeNull();
  });
});
