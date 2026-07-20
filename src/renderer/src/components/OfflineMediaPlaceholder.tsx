import { FileQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OfflineMediaPlaceholder({
  fileName,
  compact = false,
  status = 'offline',
  className,
}: {
  fileName: string;
  compact?: boolean;
  status?: 'checking' | 'offline';
  className?: string;
}): React.JSX.Element {
  const checking = status === 'checking';
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center bg-muted/90 text-center text-muted-foreground',
        compact ? 'gap-1 p-2' : 'gap-2 p-5',
        className,
      )}
      role="img"
      aria-label={checking ? `Checking ${fileName}` : `${fileName} is offline`}
    >
      <FileQuestion className={compact ? 'h-5 w-5' : 'h-8 w-8'} strokeWidth={1.5} aria-hidden />
      <p className={cn('font-medium text-foreground', compact ? 'text-[10px]' : 'text-sm')}>
        {checking ? 'Checking source' : 'Source offline'}
      </p>
      {!compact && (
        <p className="max-w-56 break-words text-xs">
          {checking ? `Verifying ${fileName}…` : `Relink ${fileName} to restore previews.`}
        </p>
      )}
    </div>
  );
}
