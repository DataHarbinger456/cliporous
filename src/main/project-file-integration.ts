import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { Ch } from '@shared/ipc-channels';
import { app, type BrowserWindow } from 'electron';

let pendingProjectPath: string | null = null;

function projectPathFromArgs(
  argv: readonly string[],
  workingDirectory = process.cwd(),
): string | null {
  const candidate = argv.find((value) => value.toLowerCase().endsWith('.batchclip'));
  if (!candidate) return null;
  const absolutePath = isAbsolute(candidate) ? candidate : resolve(workingDirectory, candidate);
  return existsSync(absolutePath) ? absolutePath : null;
}

function focusWindow(window: BrowserWindow): void {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function deliverOrQueue(window: BrowserWindow | null, filePath: string): void {
  if (!window || window.isDestroyed() || window.webContents.isLoadingMainFrame()) {
    pendingProjectPath = filePath;
    return;
  }
  focusWindow(window);
  window.webContents.send(Ch.Send.PROJECT_OPEN_RECENT_REQUEST, { path: filePath });
}

/**
 * Register native .batchclip open events before app readiness. Startup opens are
 * queued for the renderer's initial hydrate; later opens reuse the same typed
 * project-open event as the native Open Recent menu.
 */
export function installProjectFileIntegration(
  getMainWindow: () => BrowserWindow | null,
  initialArgv: readonly string[] = process.argv,
): void {
  pendingProjectPath = projectPathFromArgs(initialArgv);

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (!filePath.toLowerCase().endsWith('.batchclip') || !existsSync(filePath)) return;
    deliverOrQueue(getMainWindow(), filePath);
  });

  app.on('second-instance', (_event, argv, workingDirectory) => {
    const window = getMainWindow();
    const filePath = projectPathFromArgs(argv, workingDirectory);
    if (filePath) deliverOrQueue(window, filePath);
    else if (window) focusWindow(window);
  });
}

export function consumePendingProjectPath(): string | null {
  const filePath = pendingProjectPath;
  pendingProjectPath = null;
  return filePath;
}

export const projectFileIntegrationTestUtils = { projectPathFromArgs };
