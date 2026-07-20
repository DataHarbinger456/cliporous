/**
 * IPC Error Handling Contract
 * ───────────────────────────
 * All IPC handlers follow this pattern:
 *
 * 1. Main process: Handlers are wrapped with `wrapHandler()` which logs errors
 *    to the main process console/log, then re-throws so `ipcMain.handle`
 *    serialises them as rejected promises to the renderer.
 *
 * 2. Renderer: Callers catch the rejected promise and report via
 *    `addError({ source, message })` in the Zustand store, which surfaces
 *    the error in the ErrorLog panel.
 *
 * 3. Silent swallowing is avoided — every error is logged on at least one side.
 *
 * This ensures consistent observability: the main process always logs IPC
 * failures, and the renderer always shows them to the user.
 */

import { redactCredentialText } from '@shared/credential-safety';
import { createErrorCorrelationId } from '@shared/errors';
import { log } from './logger';

/**
 * Wrap an IPC handler so that any thrown error is logged on the main process
 * side before being re-thrown (and thus serialised back to the renderer).
 */
export function wrapHandler<T, Args extends unknown[]>(
  channel: string,
  handler: (...args: Args) => Promise<T> | T,
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    try {
      return await handler(...args);
    } catch (err) {
      const correlationId = createErrorCorrelationId();
      const message = redactCredentialText(err instanceof Error ? err.message : String(err));
      log('error', 'IPC', `[${correlationId}] [${channel}] ${message}`);
      // Electron only guarantees an Error message across invoke/reject. Prefixing
      // the redacted message lets the renderer keep diagnostics correlated with
      // the main log without exposing the raw failure in primary UI.
      throw new Error(`[${correlationId}] ${message}`);
    }
  };
}
