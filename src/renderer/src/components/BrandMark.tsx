import { Clapperboard } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BrandMark({
  showName = false,
  className,
}: {
  showName?: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/35 bg-primary/15 text-primary"
        aria-hidden
      >
        <Clapperboard className="h-4 w-4" />
      </span>
      {showName && (
        <span className="min-w-0 leading-none">
          <span className="block text-sm font-semibold tracking-tight text-foreground">
            BatchClip
          </span>
          <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Clip studio
          </span>
        </span>
      )}
    </span>
  );
}
