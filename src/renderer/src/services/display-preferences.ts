import { useSyncExternalStore } from 'react';

export type GridDensity = 'comfortable' | 'compact';
export type InspectorWidth = 'narrow' | 'standard' | 'wide';

export interface DisplayPreferences {
  gridDensity: GridDensity;
  inspectorWidth: InspectorWidth;
  activityFeedExpanded: boolean;
  soundEnabled: boolean;
  autoCleanupTemp: boolean;
  reviewAutoAdvance: boolean;
  uiZoom: number;
}

export const DISPLAY_PREFERENCES_STORAGE_KEY = 'batchclip.display-preferences.v1';
const DISPLAY_PREFERENCES_CHANNEL = 'batchclip-display-preferences';
export const UI_ZOOM_STEP = 0.05;
export const UI_ZOOM_MIN = 0.5;
export const UI_ZOOM_MAX = 2;

export const DEFAULT_DISPLAY_PREFERENCES: Readonly<DisplayPreferences> = {
  gridDensity: 'comfortable',
  inspectorWidth: 'standard',
  activityFeedExpanded: false,
  soundEnabled: false,
  autoCleanupTemp: false,
  reviewAutoAdvance: true,
  uiZoom: 1,
};

const INSPECTOR_WIDTHS: Record<InspectorWidth, number> = {
  narrow: 400,
  standard: 480,
  wide: 640,
};

function isGridDensity(value: unknown): value is GridDensity {
  return value === 'comfortable' || value === 'compact';
}

function isInspectorWidth(value: unknown): value is InspectorWidth {
  return value === 'narrow' || value === 'standard' || value === 'wide';
}

export function clampUiZoom(value: number): number {
  const finiteValue = Number.isFinite(value) ? value : 1;
  const stepped = Math.round(finiteValue / UI_ZOOM_STEP) * UI_ZOOM_STEP;
  return Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, Number(stepped.toFixed(2))));
}

export function normalizeDisplayPreferences(
  value: Partial<DisplayPreferences> | null | undefined,
): DisplayPreferences {
  return {
    gridDensity: isGridDensity(value?.gridDensity)
      ? value.gridDensity
      : DEFAULT_DISPLAY_PREFERENCES.gridDensity,
    inspectorWidth: isInspectorWidth(value?.inspectorWidth)
      ? value.inspectorWidth
      : DEFAULT_DISPLAY_PREFERENCES.inspectorWidth,
    activityFeedExpanded:
      typeof value?.activityFeedExpanded === 'boolean'
        ? value.activityFeedExpanded
        : DEFAULT_DISPLAY_PREFERENCES.activityFeedExpanded,
    soundEnabled:
      typeof value?.soundEnabled === 'boolean'
        ? value.soundEnabled
        : DEFAULT_DISPLAY_PREFERENCES.soundEnabled,
    autoCleanupTemp:
      typeof value?.autoCleanupTemp === 'boolean'
        ? value.autoCleanupTemp
        : DEFAULT_DISPLAY_PREFERENCES.autoCleanupTemp,
    reviewAutoAdvance:
      typeof value?.reviewAutoAdvance === 'boolean'
        ? value.reviewAutoAdvance
        : DEFAULT_DISPLAY_PREFERENCES.reviewAutoAdvance,
    uiZoom: clampUiZoom(value?.uiZoom ?? DEFAULT_DISPLAY_PREFERENCES.uiZoom),
  };
}

function readDisplayPreferences(): DisplayPreferences {
  try {
    const raw = window.localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEY);
    if (raw) return normalizeDisplayPreferences(JSON.parse(raw) as Partial<DisplayPreferences>);
  } catch {
    // Storage can be unavailable or contain legacy/corrupt data. Defaults keep the UI usable.
  }
  return { ...DEFAULT_DISPLAY_PREFERENCES };
}

let snapshot = readDisplayPreferences();
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;
let crossWindowListenersReady = false;

function emit(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

function receive(next: DisplayPreferences): void {
  const normalized = normalizeDisplayPreferences(next);
  if (JSON.stringify(normalized) === JSON.stringify(snapshot)) return;
  snapshot = normalized;
  applyUiZoom(snapshot.uiZoom);
  emit();
}

function ensureCrossWindowListeners(): void {
  if (crossWindowListenersReady) return;
  crossWindowListenersReady = true;

  window.addEventListener('storage', (event) => {
    if (event.key !== DISPLAY_PREFERENCES_STORAGE_KEY || !event.newValue) return;
    try {
      receive(JSON.parse(event.newValue) as DisplayPreferences);
    } catch {
      // Ignore malformed values from older builds or manual storage edits.
    }
  });

  if (typeof BroadcastChannel === 'undefined') return;
  try {
    channel = new BroadcastChannel(DISPLAY_PREFERENCES_CHANNEL);
    channel.addEventListener('message', (event: MessageEvent<DisplayPreferences>) => {
      receive(event.data);
    });
  } catch {
    channel = null;
  }
}

export function applyUiZoom(zoom: number): void {
  const factor = clampUiZoom(zoom);
  if (typeof window.api?.setUiZoom === 'function') {
    window.api.setUiZoom(factor);
    document.documentElement.style.removeProperty('zoom');
    return;
  }

  // Browser-only fallback for tests or renderer previews without Electron preload.
  document.documentElement.style.setProperty('zoom', String(factor));
}

export function initializeDisplayPreferences(): void {
  ensureCrossWindowListeners();
  applyUiZoom(snapshot.uiZoom);
}

export function getDisplayPreferences(): DisplayPreferences {
  return snapshot;
}

export function setDisplayPreferences(patch: Partial<DisplayPreferences>): void {
  ensureCrossWindowListeners();
  const next = normalizeDisplayPreferences({ ...snapshot, ...patch });
  if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
  snapshot = next;
  applyUiZoom(snapshot.uiZoom);
  try {
    window.localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // The preference still applies in this renderer when persistence is unavailable.
  }
  channel?.postMessage(snapshot);
  emit();
}

export function adjustUiZoom(direction: 'in' | 'out' | 'reset'): number {
  const current = snapshot.uiZoom;
  const uiZoom =
    direction === 'reset'
      ? 1
      : clampUiZoom(current + (direction === 'in' ? UI_ZOOM_STEP : -UI_ZOOM_STEP));
  setDisplayPreferences({ uiZoom });
  return uiZoom;
}

export function inspectorWidthPixels(width: InspectorWidth): number {
  return INSPECTOR_WIDTHS[width];
}

function subscribe(listener: () => void): () => void {
  ensureCrossWindowListeners();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDisplayPreferences(): DisplayPreferences {
  return useSyncExternalStore(subscribe, getDisplayPreferences, getDisplayPreferences);
}
