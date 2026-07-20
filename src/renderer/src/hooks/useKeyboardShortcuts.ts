import { useEffect } from 'react';

/**
 * Returns true if the active element is a text input, textarea, or contenteditable.
 * Keyboard shortcuts should not fire when the user is typing.
 */
function isTyping(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

/**
 * Returns true if a modal dialog is currently open (settings, help, etc.).
 * Global shortcuts should defer to the dialog's own shortcut handler.
 */
function isDialogOpen(): boolean {
  return document.querySelectorAll('[role="dialog"][data-state="open"]').length > 0;
}

export interface KeyboardShortcutCallbacks {
  onNew: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onLoad: () => void;
  onOpenSettings: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenCommands: () => void;
  onShowHelp: () => void;
}

/**
 * Global app shortcuts:
 *
 * - Cmd/Ctrl+N → new project
 * - Cmd/Ctrl+S → save project
 * - Cmd/Ctrl+Shift+S → save project as
 * - Cmd/Ctrl+O → open project
 * - Cmd/Ctrl+, → settings
 * - Cmd/Ctrl+K → creator command palette
 * - Cmd/Ctrl+Z → undo active history
 * - Cmd+Shift+Z or Ctrl+Y → redo active history
 * - Cmd/Ctrl+/ or ? → help
 */
export function useKeyboardShortcuts(callbacks: KeyboardShortcutCallbacks): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey;

      // --- Modifier shortcuts (work even when typing) ---

      // Cmd/Ctrl+N — start a new project.
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        callbacks.onNew();
        return;
      }

      // Cmd/Ctrl+S — save; add Shift for Save As.
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) callbacks.onSaveAs();
        else callbacks.onSave();
        return;
      }

      // Cmd/Ctrl+O — load project
      if (mod && e.key === 'o') {
        e.preventDefault();
        callbacks.onLoad();
        return;
      }

      // Cmd/Ctrl+, — open settings
      if (mod && Object.is(e.key, ',')) {
        e.preventDefault();
        callbacks.onOpenSettings();
        return;
      }

      // Cmd/Ctrl+K — open the creator command palette from any context.
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        callbacks.onOpenCommands();
        return;
      }

      // Preserve native text-field undo. Elsewhere, history is global unless
      // the clip inspector is open and owns the interaction.
      if (
        mod &&
        !e.altKey &&
        (e.key.toLowerCase() === 'z' || (!e.metaKey && e.key.toLowerCase() === 'y'))
      ) {
        if (isTyping()) return;
        const clipInspectorOpen =
          document.querySelector('[data-history-scope="clip"][data-state="open"]') !== null;
        if (isDialogOpen() && !clipInspectorOpen) return;
        e.preventDefault();
        if (e.shiftKey || e.key.toLowerCase() === 'y') callbacks.onRedo();
        else callbacks.onUndo();
        return;
      }

      // --- Non-modifier shortcuts: skip if user is typing or dialog is open ---
      if (isTyping()) return;
      if (isDialogOpen()) return;

      // Cmd/Ctrl+/ or ? — help dialog
      if ((mod && e.key === '/') || e.key === '?') {
        e.preventDefault();
        callbacks.onShowHelp();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [callbacks]);
}
