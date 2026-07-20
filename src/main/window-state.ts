import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BrowserWindow, Rectangle } from 'electron';
import { app, screen } from 'electron';

export interface PersistedWindowState {
  bounds: Rectangle;
  displayId: number;
  isMaximized: boolean;
}

export interface DisplayWorkArea {
  id: number;
  workArea: Rectangle;
}

export interface WindowBoundsDefaults {
  bounds: Rectangle;
  minWidth: number;
  minHeight: number;
}

export interface ResolvedWindowState {
  bounds: Rectangle;
  isMaximized: boolean;
}

function isFiniteRectangle(value: unknown): value is Rectangle {
  if (!value || typeof value !== 'object') return false;
  const rectangle = value as Partial<Rectangle>;
  return (
    Number.isFinite(rectangle.x) &&
    Number.isFinite(rectangle.y) &&
    Number.isFinite(rectangle.width) &&
    Number.isFinite(rectangle.height) &&
    (rectangle.width ?? 0) > 0 &&
    (rectangle.height ?? 0) > 0
  );
}

export function parsePersistedWindowState(value: unknown): PersistedWindowState | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Partial<PersistedWindowState>;
  if (
    !isFiniteRectangle(state.bounds) ||
    !Number.isFinite(state.displayId) ||
    typeof state.isMaximized !== 'boolean'
  ) {
    return null;
  }
  return {
    bounds: state.bounds,
    displayId: state.displayId as number,
    isMaximized: state.isMaximized,
  };
}

function intersectionArea(left: Rectangle, right: Rectangle): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );
  return width * height;
}

function chooseDisplay(
  bounds: Rectangle,
  savedDisplayId: number | null,
  displays: readonly DisplayWorkArea[],
): DisplayWorkArea {
  const savedDisplay = displays.find((display) => display.id === savedDisplayId);
  if (savedDisplay) return savedDisplay;

  let bestDisplay = displays[0];
  let bestArea = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  const boundsCenterX = bounds.x + bounds.width / 2;
  const boundsCenterY = bounds.y + bounds.height / 2;
  for (const display of displays) {
    const area = intersectionArea(bounds, display.workArea);
    const workAreaCenterX = display.workArea.x + display.workArea.width / 2;
    const workAreaCenterY = display.workArea.y + display.workArea.height / 2;
    const distance =
      (boundsCenterX - workAreaCenterX) ** 2 + (boundsCenterY - workAreaCenterY) ** 2;
    if (area > bestArea || (area === bestArea && distance < bestDistance)) {
      bestArea = area;
      bestDistance = distance;
      bestDisplay = display;
    }
  }
  if (!bestDisplay) throw new Error('At least one display is required to resolve window bounds');
  return bestDisplay;
}

export function fitBoundsToWorkArea(
  bounds: Rectangle,
  workArea: Rectangle,
  minWidth: number,
  minHeight: number,
): Rectangle {
  const effectiveMinWidth = Math.min(minWidth, workArea.width);
  const effectiveMinHeight = Math.min(minHeight, workArea.height);
  const width = Math.min(workArea.width, Math.max(effectiveMinWidth, Math.round(bounds.width)));
  const height = Math.min(workArea.height, Math.max(effectiveMinHeight, Math.round(bounds.height)));
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;
  return {
    x: Math.min(maxX, Math.max(workArea.x, Math.round(bounds.x))),
    y: Math.min(maxY, Math.max(workArea.y, Math.round(bounds.y))),
    width,
    height,
  };
}

export function resolveWindowState(
  saved: PersistedWindowState | null,
  defaults: WindowBoundsDefaults,
  displays: readonly DisplayWorkArea[],
): ResolvedWindowState {
  if (displays.length === 0) throw new Error('At least one display is required');
  const requestedBounds = saved?.bounds ?? defaults.bounds;
  const display = chooseDisplay(requestedBounds, saved?.displayId ?? null, displays);
  return {
    bounds: fitBoundsToWorkArea(
      requestedBounds,
      display.workArea,
      defaults.minWidth,
      defaults.minHeight,
    ),
    isMaximized: saved?.isMaximized ?? false,
  };
}

function statePath(fileName: string): string {
  return join(app.getPath('userData'), fileName);
}

function loadState(fileName: string): PersistedWindowState | null {
  try {
    const path = statePath(fileName);
    if (!existsSync(path)) return null;
    return parsePersistedWindowState(JSON.parse(readFileSync(path, 'utf8')) as unknown);
  } catch {
    return null;
  }
}

function saveState(fileName: string, state: PersistedWindowState): void {
  try {
    const path = statePath(fileName);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(state));
  } catch {
    // Window placement is convenience state. A write failure must not block close.
  }
}

function displayWorkAreas(): DisplayWorkArea[] {
  return screen.getAllDisplays().map((display) => ({ id: display.id, workArea: display.workArea }));
}

export function loadWindowState(
  fileName: string,
  defaults: WindowBoundsDefaults,
): ResolvedWindowState {
  return resolveWindowState(loadState(fileName), defaults, displayWorkAreas());
}

/** Persist normal bounds, display, and maximized state without saving transient drag frames. */
export function trackWindowState(window: BrowserWindow, fileName: string): () => void {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const persist = (): void => {
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return;
    const bounds = window.getNormalBounds();
    const display = screen.getDisplayMatching(bounds);
    saveState(fileName, {
      bounds,
      displayId: display.id,
      isMaximized: window.isMaximized(),
    });
  };

  const schedule = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      persist();
    }, 200);
  };

  window.on('move', schedule);
  window.on('resize', schedule);
  window.on('maximize', schedule);
  window.on('unmaximize', schedule);
  window.on('close', persist);

  return () => {
    if (saveTimer) clearTimeout(saveTimer);
    window.removeListener('move', schedule);
    window.removeListener('resize', schedule);
    window.removeListener('maximize', schedule);
    window.removeListener('unmaximize', schedule);
    window.removeListener('close', persist);
  };
}
