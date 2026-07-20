import type { HistoryMenuState } from '@shared/history';
import { Ch } from '@shared/ipc-channels';
import { ipcMain } from 'electron';
import { updateHistoryMenuState } from '../app-menu';
import { wrapHandler } from '../ipc-error-handler';

function isHistoryMenuState(value: unknown): value is HistoryMenuState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<HistoryMenuState>;
  return (
    typeof state.undoLabel === 'string' &&
    typeof state.redoLabel === 'string' &&
    typeof state.canUndo === 'boolean' &&
    typeof state.canRedo === 'boolean'
  );
}

export function registerMenuHandlers(): void {
  ipcMain.handle(
    Ch.Invoke.MENU_SET_HISTORY_STATE,
    wrapHandler(Ch.Invoke.MENU_SET_HISTORY_STATE, (_event, state: unknown) => {
      if (!isHistoryMenuState(state)) throw new Error('Invalid history menu state');
      updateHistoryMenuState(state);
    }),
  );
}
