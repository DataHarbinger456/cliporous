import { describe, expect, it } from 'vitest';
import { openLogsLabel, revealItemLabel, shortcutLabelForPlatform } from './platform';

describe('platform copy', () => {
  it('uses native file-manager terminology for every desktop target', () => {
    expect(revealItemLabel('macos')).toBe('Reveal in Finder');
    expect(revealItemLabel('windows')).toBe('Show in Explorer');
    expect(revealItemLabel('linux')).toBe('Show in File Manager');
    expect(openLogsLabel('macos')).toBe('Open Logs in Finder');
    expect(openLogsLabel('windows')).toBe('Open Logs in Explorer');
    expect(openLogsLabel('linux')).toBe('Open Logs in File Manager');
  });

  it('reads the live preload platform when no explicit override is provided', () => {
    const originalApi = window.api;
    window.api = { ...originalApi, platform: 'win32' };

    try {
      expect(revealItemLabel()).toBe('Show in Explorer');
      expect(openLogsLabel()).toBe('Open Logs in Explorer');
    } finally {
      window.api = originalApi;
    }
  });

  it('uses native shortcut glyphs on macOS and text labels elsewhere', () => {
    expect(shortcutLabelForPlatform('macos', '⌘', 'Shift', 'S')).toBe('⌘⇧S');
    expect(shortcutLabelForPlatform('windows', 'Ctrl', 'Shift', 'S')).toBe('Ctrl+Shift+S');
  });
});
