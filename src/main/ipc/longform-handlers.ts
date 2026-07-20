import { Ch } from '@shared/ipc-channels';
import type { LongformEditPlan, WordTimestamp } from '@shared/types';
import { ipcMain } from 'electron';
import { generateLongformEditPlan } from '../ai/longform-edit-plan';
import { wrapHandler } from '../ipc-error-handler';

/**
 * IPC handlers for the Hormozi long-form (16:9) pipeline.
 */
export function registerLongformHandlers(): void {
  // AI — generate a Hormozi-style long-form edit plan from a full transcript.
  ipcMain.handle(
    Ch.Invoke.AI_GENERATE_LONGFORM_EDIT_PLAN,
    wrapHandler(
      Ch.Invoke.AI_GENERATE_LONGFORM_EDIT_PLAN,
      async (
        event,
        apiKey: string,
        words: WordTimestamp[],
        videoDuration: number,
        feedback?: string[],
      ): Promise<LongformEditPlan> => {
        return generateLongformEditPlan({
          apiKey,
          words,
          videoDuration,
          ...(feedback?.length ? { feedback } : {}),
          onProgress: ({ window, total }) => {
            event.sender.send(Ch.Send.AI_LONGFORM_EDIT_PROGRESS, {
              stage: 'ai-editing',
              window,
              total,
            });
          },
        });
      },
    ),
  );
}
