import { toast } from 'sonner';
import { type HistoryScope, performHistoryCommand } from '@/hooks/useHistoryControls';

export interface UndoFeedbackOptions {
  id: string;
  message: string;
  scope: HistoryScope;
  onUndo?: () => void;
}

/** One accessible, replace-in-place feedback path for cheap reversible review work. */
export function showUndoFeedback({ id, message, scope, onUndo }: UndoFeedbackOptions): void {
  toast(message, {
    id,
    duration: 4_000,
    action: {
      label: 'Undo',
      onClick: () => {
        const result = performHistoryCommand('undo', scope);
        if (result) onUndo?.();
      },
    },
  });
}
