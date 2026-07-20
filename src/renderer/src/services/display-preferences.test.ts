import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyUiZoom,
  clampUiZoom,
  DEFAULT_DISPLAY_PREFERENCES,
  DISPLAY_PREFERENCES_STORAGE_KEY,
  getDisplayPreferences,
  normalizeDisplayPreferences,
  setDisplayPreferences,
} from './display-preferences';

beforeEach(() => {
  localStorage.clear();
  setDisplayPreferences({ ...DEFAULT_DISPLAY_PREFERENCES });
});

describe('display preferences', () => {
  it('keeps studio sound cues opt-in by default', () => {
    expect(DEFAULT_DISPLAY_PREFERENCES.soundEnabled).toBe(false);
    expect(normalizeDisplayPreferences(undefined).soundEnabled).toBe(false);
  });

  it('normalizes corrupt values and clamps zoom to the supported range', () => {
    expect(
      normalizeDisplayPreferences({
        gridDensity: 'dense' as never,
        inspectorWidth: 'huge' as never,
        uiZoom: 9,
      }),
    ).toMatchObject({
      gridDensity: 'comfortable',
      inspectorWidth: 'standard',
      uiZoom: 2,
    });
    expect(clampUiZoom(0.1)).toBe(0.5);
    expect(clampUiZoom(1.12)).toBe(1.1);
  });

  it('persists app-scoped display choices together', () => {
    setDisplayPreferences({
      gridDensity: 'compact',
      inspectorWidth: 'wide',
      activityFeedExpanded: true,
      soundEnabled: true,
      autoCleanupTemp: true,
      reviewAutoAdvance: false,
      uiZoom: 1.25,
    });

    expect(getDisplayPreferences()).toMatchObject({
      gridDensity: 'compact',
      inspectorWidth: 'wide',
      activityFeedExpanded: true,
      soundEnabled: true,
      autoCleanupTemp: true,
      reviewAutoAdvance: false,
      uiZoom: 1.25,
    });
    expect(JSON.parse(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEY) ?? '{}')).toMatchObject(
      {
        gridDensity: 'compact',
        inspectorWidth: 'wide',
        activityFeedExpanded: true,
        soundEnabled: true,
        autoCleanupTemp: true,
        reviewAutoAdvance: false,
        uiZoom: 1.25,
      },
    );
  });

  it('uses native Chromium zoom and clears the legacy CSS zoom fallback', () => {
    const originalApi = window.api;
    const setUiZoom = vi.fn();
    window.api = { ...originalApi, setUiZoom };
    document.documentElement.style.setProperty('zoom', '1.25');

    try {
      applyUiZoom(2);

      expect(setUiZoom).toHaveBeenCalledWith(2);
      expect(document.documentElement.style.zoom).toBe('');
    } finally {
      window.api = originalApi;
    }
  });
});
