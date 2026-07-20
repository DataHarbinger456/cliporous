import { FastForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isMac, shortcutLabel } from '@/lib/platform';
import { cn } from '@/lib/utils';

const SHORTCUTS = [
  ['← / → · J / K', 'Move'],
  ['Space', 'Play'],
  ['A', 'Approve'],
  ['X', 'Reject'],
  ['U', 'Unreviewed'],
  ['E', 'Edit'],
  ['R', 'Render'],
  [shortcutLabel(isMac ? 'Meta' : 'Ctrl', 'Z'), 'Undo'],
] as const;

export interface ReviewKeyboardGuideProps {
  autoAdvance: boolean;
  onAutoAdvanceChange: (enabled: boolean) => void;
  className?: string;
}

export function ReviewKeyboardGuide({
  autoAdvance,
  onAutoAdvanceChange,
  className,
}: ReviewKeyboardGuideProps): React.JSX.Element {
  return (
    <section
      className={cn(
        'flex min-h-10 items-center justify-between gap-3 border-b border-border/70 bg-muted/25 px-4 py-1.5 sm:px-6',
        className,
      )}
      aria-label="Review keyboard controls"
    >
      <div className="hidden min-w-0 items-center gap-3 min-[1100px]:flex">
        <span className="text-[11px] font-medium text-muted-foreground">Review keys</span>
        {SHORTCUTS.map(([keys, label]) => (
          <span
            key={keys}
            className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground"
          >
            <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground shadow-sm">
              {keys}
            </kbd>
            {label}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground min-[1100px]:hidden">
        J/K move · A/X decide · U reset · E edit · R render
      </p>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 shrink-0"
        aria-pressed={autoAdvance}
        onClick={() => onAutoAdvanceChange(!autoAdvance)}
      >
        <FastForward aria-hidden="true" />
        Auto-advance {autoAdvance ? 'on' : 'off'}
      </Button>
    </section>
  );
}
