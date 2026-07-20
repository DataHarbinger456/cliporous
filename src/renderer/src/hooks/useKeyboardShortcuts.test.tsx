import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type KeyboardShortcutCallbacks, useKeyboardShortcuts } from './useKeyboardShortcuts';

function ShortcutHarness({ callbacks }: { callbacks: KeyboardShortcutCallbacks }): null {
  useKeyboardShortcuts(callbacks);
  return null;
}

function createCallbacks(): KeyboardShortcutCallbacks {
  return {
    onNew: vi.fn(),
    onSave: vi.fn(),
    onSaveAs: vi.fn(),
    onLoad: vi.fn(),
    onOpenSettings: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onOpenCommands: vi.fn(),
    onShowHelp: vi.fn(),
  };
}

afterEach(cleanup);

describe('useKeyboardShortcuts', () => {
  it('routes Cmd/Ctrl+N to New Project', () => {
    const callbacks = createCallbacks();
    render(<ShortcutHarness callbacks={callbacks} />);

    fireEvent.keyDown(window, { key: 'n', ctrlKey: true });

    expect(callbacks.onNew).toHaveBeenCalledOnce();
  });

  it('routes Cmd/Ctrl+K to creator commands even from an input', () => {
    const callbacks = createCallbacks();
    render(
      <>
        <ShortcutHarness callbacks={callbacks} />
        <input aria-label="Hook" />
      </>,
    );
    const input = document.querySelector('input');
    input?.focus();

    fireEvent.keyDown(input as HTMLInputElement, { key: 'k', metaKey: true });

    expect(callbacks.onOpenCommands).toHaveBeenCalledOnce();
  });

  it('routes Cmd/Ctrl+S to Save', () => {
    const callbacks = createCallbacks();
    render(<ShortcutHarness callbacks={callbacks} />);

    fireEvent.keyDown(window, { key: 's', metaKey: true });

    expect(callbacks.onSave).toHaveBeenCalledOnce();
    expect(callbacks.onSaveAs).not.toHaveBeenCalled();
  });

  it('routes Cmd/Ctrl+Shift+S to Save As when the key value is uppercase', () => {
    const callbacks = createCallbacks();
    render(<ShortcutHarness callbacks={callbacks} />);

    fireEvent.keyDown(window, { key: 'S', ctrlKey: true, shiftKey: true });

    expect(callbacks.onSaveAs).toHaveBeenCalledOnce();
    expect(callbacks.onSave).not.toHaveBeenCalled();
  });

  it('routes Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z to history', () => {
    const callbacks = createCallbacks();
    render(<ShortcutHarness callbacks={callbacks} />);

    fireEvent.keyDown(window, { key: String.fromCodePoint(122), metaKey: true });
    fireEvent.keyDown(window, {
      key: String.fromCodePoint(122),
      ctrlKey: true,
      shiftKey: true,
    });

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });

    expect(callbacks.onUndo).toHaveBeenCalledOnce();
    expect(callbacks.onRedo).toHaveBeenCalledTimes(2);
  });

  it('leaves text-input undo to the native editor', () => {
    const callbacks = createCallbacks();
    render(
      <>
        <ShortcutHarness callbacks={callbacks} />
        <input aria-label="Hook" defaultValue="Draft" />
      </>,
    );
    const input = document.querySelector('input');
    input?.focus();

    fireEvent.keyDown(input as HTMLInputElement, {
      key: String.fromCodePoint(122),
      metaKey: true,
    });

    expect(callbacks.onUndo).not.toHaveBeenCalled();
  });
});
