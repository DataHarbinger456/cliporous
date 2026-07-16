import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'batchclip.theme';
const THEME_CHANNEL_NAME = 'batchclip-theme';

type ThemeListener = (theme: Theme) => void;
type ThemeMessage = {
  key: typeof THEME_STORAGE_KEY;
  theme: Theme;
};

const themeListeners = new Set<ThemeListener>();
let currentTheme: Theme = readStoredTheme() ?? 'light';
let crossWindowListenersReady = false;
let themeChannel: BroadcastChannel | null = null;

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  root.style.colorScheme = theme;
}

function notifyThemeListeners(theme: Theme): void {
  themeListeners.forEach((listener) => {
    listener(theme);
  });
}

function receiveTheme(theme: Theme): void {
  currentTheme = theme;
  applyTheme(theme);
  notifyThemeListeners(theme);
}

function ensureCrossWindowListeners(): void {
  if (crossWindowListenersReady) return;
  crossWindowListenersReady = true;

  window.addEventListener('storage', (event) => {
    if (event.key !== THEME_STORAGE_KEY || !isTheme(event.newValue)) return;
    receiveTheme(event.newValue);
  });

  if (typeof BroadcastChannel === 'undefined') return;
  try {
    themeChannel = new BroadcastChannel(THEME_CHANNEL_NAME);
    themeChannel.addEventListener('message', (event: MessageEvent<ThemeMessage>) => {
      if (event.data?.key !== THEME_STORAGE_KEY || !isTheme(event.data.theme)) return;
      receiveTheme(event.data.theme);
    });
  } catch {
    themeChannel = null;
  }
}

/** Apply the persisted theme before React mounts to prevent a wrong-theme flash. */
export function initializeTheme(): Theme {
  currentTheme = readStoredTheme() ?? 'light';
  applyTheme(currentTheme);
  ensureCrossWindowListeners();
  return currentTheme;
}

export function getTheme(): Theme {
  return currentTheme;
}

export function setTheme(theme: Theme): void {
  currentTheme = theme;
  applyTheme(theme);

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme still applies for this renderer when storage is unavailable.
  }

  ensureCrossWindowListeners();
  themeChannel?.postMessage({ key: THEME_STORAGE_KEY, theme } satisfies ThemeMessage);
  notifyThemeListeners(theme);
}

export function subscribeToTheme(listener: ThemeListener): () => void {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

export function useTheme(): {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
} {
  const [theme, setThemeState] = useState<Theme>(() => currentTheme);

  useEffect(() => {
    ensureCrossWindowListeners();
    setThemeState(currentTheme);
    return subscribeToTheme(setThemeState);
  }, []);

  return {
    theme,
    setTheme,
    toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
  };
}
