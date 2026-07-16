import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { initializeTheme, setTheme, THEME_STORAGE_KEY, useTheme } from './useTheme';

type ThemeMessage = { key: string; theme: 'light' | 'dark' };
type MessageListener = (event: MessageEvent<ThemeMessage>) => void;

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  readonly name: string;
  private readonly listeners = new Set<MessageListener>();

  constructor(name: string) {
    this.name = name;
    FakeBroadcastChannel.instances.push(this);
  }

  addEventListener(type: string, listener: MessageListener): void {
    if (type === 'message') this.listeners.add(listener);
  }

  postMessage(data: ThemeMessage): void {
    FakeBroadcastChannel.instances.forEach((channel) => {
      if (channel === this || channel.name !== this.name) return;
      channel.dispatch(data);
    });
  }

  private dispatch(data: ThemeMessage): void {
    const event = new MessageEvent<ThemeMessage>('message', { data });
    this.listeners.forEach((listener) => {
      listener(event);
    });
  }
}

Object.defineProperty(globalThis, 'BroadcastChannel', {
  configurable: true,
  value: FakeBroadcastChannel,
  writable: true,
});

describe('theme controller', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
    initializeTheme();
  });

  it('defaults to light and applies the document theme before rendering', () => {
    expect(initializeTheme()).toBe('light');
    expect(document.documentElement).toHaveClass('light');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('persists and applies an explicit dark choice', () => {
    setTheme('dark');

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement).not.toHaveClass('light');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(initializeTheme()).toBe('dark');
  });

  it('updates hook state when toggled', () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggleTheme());

    expect(result.current.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('converges when another renderer broadcasts a theme change', () => {
    const { result } = renderHook(() => useTheme());
    const otherWindow = new FakeBroadcastChannel('batchclip-theme');

    act(() => {
      otherWindow.postMessage({ key: THEME_STORAGE_KEY, theme: 'dark' });
    });

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
  });
});
