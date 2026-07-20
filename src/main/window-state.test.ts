import { describe, expect, it } from 'vitest';
import {
  type DisplayWorkArea,
  fitBoundsToWorkArea,
  parsePersistedWindowState,
  resolveWindowState,
} from './window-state';

const displays: DisplayWorkArea[] = [
  { id: 1, workArea: { x: 0, y: 0, width: 1440, height: 900 } },
  { id: 2, workArea: { x: 1440, y: 0, width: 1920, height: 1040 } },
];

const defaults = {
  bounds: { x: 120, y: 80, width: 1180, height: 760 },
  minWidth: 900,
  minHeight: 640,
};

describe('window state', () => {
  it('rejects malformed persisted data', () => {
    expect(parsePersistedWindowState(null)).toBeNull();
    expect(
      parsePersistedWindowState({
        bounds: { x: 0, y: 0, width: -1, height: 800 },
        displayId: 1,
        isMaximized: false,
      }),
    ).toBeNull();
  });

  it('restores the saved display, bounds, and maximized state', () => {
    expect(
      resolveWindowState(
        {
          bounds: { x: 1600, y: 100, width: 1100, height: 760 },
          displayId: 2,
          isMaximized: true,
        },
        defaults,
        displays,
      ),
    ).toEqual({
      bounds: { x: 1600, y: 100, width: 1100, height: 760 },
      isMaximized: true,
    });
  });

  it('moves an off-screen saved window fully onto the closest available display', () => {
    expect(
      resolveWindowState(
        {
          bounds: { x: 3100, y: 900, width: 1200, height: 800 },
          displayId: 99,
          isMaximized: false,
        },
        defaults,
        displays,
      ).bounds,
    ).toEqual({ x: 2160, y: 240, width: 1200, height: 800 });
  });

  it('fits defaults to a smaller laptop work area while preserving practical minimums', () => {
    expect(
      fitBoundsToWorkArea(
        { x: 100, y: 100, width: 1280, height: 800 },
        { x: 0, y: 0, width: 1366, height: 728 },
        900,
        640,
      ),
    ).toEqual({ x: 86, y: 0, width: 1280, height: 728 });
  });

  it('keeps the settings window resizable at and above its 400×480 minimum', () => {
    const workArea = { x: 0, y: 0, width: 1440, height: 900 };
    expect(
      fitBoundsToWorkArea({ x: 100, y: 80, width: 400, height: 480 }, workArea, 400, 480),
    ).toEqual({ x: 100, y: 80, width: 400, height: 480 });
    expect(
      fitBoundsToWorkArea({ x: 100, y: 80, width: 760, height: 620 }, workArea, 400, 480),
    ).toEqual({ x: 100, y: 80, width: 760, height: 620 });
  });

  it('uses the available work area when a display is smaller than the configured minimum', () => {
    expect(
      fitBoundsToWorkArea(
        { x: -200, y: -100, width: 900, height: 640 },
        { x: 0, y: 0, width: 800, height: 600 },
        900,
        640,
      ),
    ).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });
});
