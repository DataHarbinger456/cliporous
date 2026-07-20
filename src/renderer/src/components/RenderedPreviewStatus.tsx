import { CheckCircle2, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RenderedPreviewState } from '@/hooks/useRenderedPreview';

interface RenderedPreviewStatusProps {
  state: RenderedPreviewState;
  onRetry: () => void;
}

export function RenderedPreviewStatus({
  state,
  onRetry,
}: RenderedPreviewStatusProps): React.JSX.Element | null {
  if (state.status === 'idle') return null;

  if (state.status === 'preparing') {
    return (
      <div
        className="flex min-h-9 items-center gap-2 border-t border-white/15 bg-black px-3 py-2 text-[11px] text-white/75"
        role="status"
        aria-live="polite"
      >
        <LoaderCircle
          className="h-3.5 w-3.5 shrink-0 animate-spin text-primary"
          aria-hidden="true"
        />
        <span>
          {state.phase === 'queued'
            ? 'Preview queued while you finish editing'
            : 'Rendering crop, captions, hook, and zoom'}
        </span>
        <span className="ml-auto text-white/45">Live layout guide shown</span>
      </div>
    );
  }

  if (state.status === 'failed') {
    return (
      <div
        className="flex min-h-9 flex-wrap items-center gap-2 border-t border-destructive/35 bg-black px-3 py-1.5 text-[11px] text-white/80"
        role="status"
        aria-live="polite"
      >
        <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
        <span>Rendered preview failed. Your edits are safe; the live layout guide remains.</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-7 text-white hover:bg-white/15 hover:text-white"
          onClick={onRetry}
        >
          <RefreshCw aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-9 items-center gap-2 border-t border-white/15 bg-black px-3 py-2 text-[11px] text-white/75"
      role="status"
      aria-live="polite"
    >
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
      <span>{state.cached ? 'Rendered preview ready from cache' : 'Rendered preview ready'}</span>
      <span className="ml-auto text-white/45">Preview quality</span>
    </div>
  );
}
