import { Redo2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  type HistoryScope,
  historyCommandLabel,
  performHistoryCommand,
} from '@/hooks/useHistoryControls';
import { isMac, modifierKeyLabel, shortcutLabel } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

interface HistoryControlsProps {
  scope: HistoryScope;
  className?: string;
  compact?: boolean;
}

export function HistoryControls({
  scope,
  className,
  compact = false,
}: HistoryControlsProps): React.JSX.Element {
  const clipId = scope === 'global' ? null : scope.clipId;
  const undoAction = useStore((state) => {
    const stack = clipId ? state._clipUndoStacks[clipId] : state._undoStack;
    return stack?.[stack.length - 1]?.action;
  });
  const redoAction = useStore((state) => {
    const stack = clipId ? state._clipRedoStacks[clipId] : state._redoStack;
    return stack?.[stack.length - 1]?.action;
  });

  const undoLabel = historyCommandLabel('undo', undoAction);
  const redoLabel = historyCommandLabel('redo', redoAction);
  const scopeLabel = scope === 'global' ? 'project' : 'this clip';

  return (
    <fieldset className={cn('flex items-center gap-1 border-0 p-0', className)}>
      <legend className="sr-only">Edit history</legend>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(compact && 'h-8 px-2')}
        disabled={!undoAction}
        aria-label={undoLabel}
        title={
          undoAction
            ? `${undoLabel} (${shortcutLabel(modifierKeyLabel, 'Z')})`
            : `Nothing to undo in ${scopeLabel}`
        }
        onClick={() => performHistoryCommand('undo', scope)}
      >
        <Undo2 aria-hidden />
        {!compact && <span>{undoLabel}</span>}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(compact && 'h-8 px-2')}
        disabled={!redoAction}
        aria-label={redoLabel}
        title={
          redoAction
            ? `${redoLabel} (${isMac ? shortcutLabel(modifierKeyLabel, 'Shift', 'Z') : shortcutLabel('Ctrl', 'Y')})`
            : `Nothing to redo in ${scopeLabel}`
        }
        onClick={() => performHistoryCommand('redo', scope)}
      >
        <Redo2 aria-hidden />
        {!compact && <span>{redoLabel}</span>}
      </Button>
    </fieldset>
  );
}
