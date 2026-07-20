import { useEffect } from 'react';
import { toast } from 'sonner';
import { useStore } from '@/store';
import type { HistoryAction, HistoryResult } from '@/store/history-slice';

export type HistoryDirection = 'undo' | 'redo';
export type HistoryScope = 'global' | { sourceId: string; clipId: string };

function isEditableElement(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLElement && element.isContentEditable;
}

function inspectorScope(): HistoryScope {
  const inspector = document.querySelector<HTMLElement>(
    '[data-history-scope="clip"][data-state="open"]',
  );
  const sourceId = inspector?.dataset.sourceId;
  const clipId = inspector?.dataset.clipId;
  return sourceId && clipId ? { sourceId, clipId } : 'global';
}

export function historyCommandLabel(direction: HistoryDirection, action?: HistoryAction): string {
  const verb = direction === 'undo' ? 'Undo' : 'Redo';
  return action ? `${verb} ${action.label}` : verb;
}

/**
 * One command path for toolbar buttons, keyboard shortcuts, and native menu items.
 * Native menu clicks preserve the browser's own text-field history while an editor is active.
 */
export function performHistoryCommand(
  direction: HistoryDirection,
  scope?: HistoryScope,
): HistoryResult | null {
  if (scope === undefined && isEditableElement(document.activeElement)) {
    document.execCommand(direction);
    return null;
  }

  const resolvedScope = scope ?? inspectorScope();
  const state = useStore.getState();
  const result =
    resolvedScope === 'global'
      ? state[direction]()
      : direction === 'undo'
        ? state.undoClip(resolvedScope.sourceId, resolvedScope.clipId)
        : state.redoClip(resolvedScope.sourceId, resolvedScope.clipId);

  if (result) toast(result.message, { duration: 1800 });
  return result;
}

/** Keep native Edit-menu labels and disabled states aligned with the active history scope. */
export function useHistoryMenuSync(): void {
  const sourceId = useStore((state) => state.activeSourceId);
  const stage = useStore((state) => state.pipeline.stage);
  const selectedClipId = useStore((state) => state.workspace.selectedClipId);
  const globalUndoAction = useStore(
    (state) => state._undoStack[state._undoStack.length - 1]?.action,
  );
  const globalRedoAction = useStore(
    (state) => state._redoStack[state._redoStack.length - 1]?.action,
  );
  const clipUndoAction = useStore((state) =>
    selectedClipId
      ? state._clipUndoStacks[selectedClipId]?.[state._clipUndoStacks[selectedClipId].length - 1]
          ?.action
      : undefined,
  );
  const clipRedoAction = useStore((state) =>
    selectedClipId
      ? state._clipRedoStacks[selectedClipId]?.[state._clipRedoStacks[selectedClipId].length - 1]
          ?.action
      : undefined,
  );

  const inspectorOwnsHistory = stage === 'ready' && sourceId !== null && selectedClipId !== null;
  const undoAction = inspectorOwnsHistory ? clipUndoAction : globalUndoAction;
  const redoAction = inspectorOwnsHistory ? clipRedoAction : globalRedoAction;

  useEffect(() => {
    void window.api
      .setHistoryMenuState({
        undoLabel: historyCommandLabel('undo', undoAction),
        redoLabel: historyCommandLabel('redo', redoAction),
        canUndo: undoAction !== undefined,
        canRedo: redoAction !== undefined,
      })
      .catch(() => {
        // Menu sync is QoL only; keyboard and contextual controls remain available.
      });
  }, [redoAction, undoAction]);
}
