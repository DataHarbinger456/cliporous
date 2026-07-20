import {
  createStructuredError,
  formatErrorDiagnostics,
  isStructuredError,
  type StructuredError,
  type StructuredErrorInput,
} from '@shared/errors';
import { v4 as uuidv4 } from 'uuid';
import type { StateCreator } from 'zustand';
import type { AppState, ErrorLogEntry } from './types';

// ---------------------------------------------------------------------------
// Errors Slice
// ---------------------------------------------------------------------------

export interface ErrorsSlice {
  errorLog: ErrorLogEntry[];
  addError: (entry: StructuredErrorInput | StructuredError) => ErrorLogEntry;
  clearErrors: () => void;
}

export const createErrorsSlice: StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  ErrorsSlice
> = (set) => ({
  errorLog: [],

  addError: (input) => {
    const error = isStructuredError(input) ? input : createStructuredError(input);
    const entry: ErrorLogEntry = { ...error, id: uuidv4(), timestamp: Date.now() };

    // Correlation ID + redacted diagnostics are mirrored to the main log. The
    // creator-facing UI never receives an unclassified provider or engine dump.
    try {
      window.api?.logToMain?.(
        'error',
        error.source,
        `${error.headline}\n${formatErrorDiagnostics(error)}`,
      );
    } catch {
      // Error reporting must never break the action that is already failing.
    }

    set((state) => ({ errorLog: [...state.errorLog, entry] }));
    return entry;
  },

  clearErrors: () => set({ errorLog: [] }),
});
