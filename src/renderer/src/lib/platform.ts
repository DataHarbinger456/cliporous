export type DesktopPlatform = 'macos' | 'windows' | 'linux';

function detectPlatform(): DesktopPlatform {
  const bridgePlatform = window.api?.platform;
  if (bridgePlatform === 'darwin') return 'macos';
  if (bridgePlatform === 'win32') return 'windows';
  if (bridgePlatform === 'linux') return 'linux';

  const platform = navigator.platform.toLowerCase();
  if (platform.includes('mac')) return 'macos';
  if (platform.includes('win')) return 'windows';
  return 'linux';
}

export const desktopPlatform = detectPlatform();
export const isMac = desktopPlatform === 'macos';
export const modifierKeyLabel = isMac ? '⌘' : 'Ctrl';
export const altKeyLabel = isMac ? '⌥' : 'Alt';

export function shortcutLabelForPlatform(platform: DesktopPlatform, ...keys: string[]): string {
  if (platform !== 'macos') return keys.join('+');
  const macKeyLabels: Record<string, string> = {
    Alt: '⌥',
    Command: '⌘',
    Control: '⌃',
    Ctrl: '⌃',
    Meta: '⌘',
    Option: '⌥',
    Shift: '⇧',
  };
  return keys.map((key) => macKeyLabels[key] ?? key).join('');
}

export function shortcutLabel(...keys: string[]): string {
  return shortcutLabelForPlatform(desktopPlatform, ...keys);
}

export function revealItemLabel(platform: DesktopPlatform = detectPlatform()): string {
  if (platform === 'macos') return 'Reveal in Finder';
  if (platform === 'windows') return 'Show in Explorer';
  return 'Show in File Manager';
}

export function openLogsLabel(platform: DesktopPlatform = detectPlatform()): string {
  if (platform === 'macos') return 'Open Logs in Finder';
  if (platform === 'windows') return 'Open Logs in Explorer';
  return 'Open Logs in File Manager';
}
