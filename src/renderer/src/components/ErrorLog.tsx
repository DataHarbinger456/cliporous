import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ErrorPresentation } from '@/components/ErrorPresentation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { setDisplayPreferences, useDisplayPreferences } from '@/services/display-preferences';
import { useStore } from '@/store';

export function ErrorLog(): React.JSX.Element | null {
  const errorLog = useStore((state) => state.errorLog);
  const clearErrors = useStore((state) => state.clearErrors);
  const { activityFeedExpanded: expanded } = useDisplayPreferences();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  if (errorLog.length === 0) return null;

  return (
    <Collapsible
      open={expanded}
      onOpenChange={(activityFeedExpanded) => setDisplayPreferences({ activityFeedExpanded })}
      className="shrink-0 border-t border-border bg-card"
    >
      <div className="flex min-h-11 w-full items-center gap-2 px-4 text-sm transition-colors duration-150 hover:bg-muted/50">
        <CollapsibleTrigger className="flex min-h-11 flex-1 items-center gap-2 text-left">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="font-medium text-destructive">Error history</span>
          <Badge variant="destructive" className="h-5 px-1.5 py-0 text-[10px]">
            {errorLog.length}
          </Badge>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Creator guidance first. Diagnostics stay in Details.
          </span>
        </CollapsibleTrigger>
        {expanded && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowClearConfirm(true)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </Button>
        )}
      </div>

      <CollapsibleContent>
        <ScrollArea className="max-h-[28rem] border-t border-border/70">
          <div className="space-y-3 p-4">
            {errorLog.map((entry) => (
              <ErrorPresentation key={entry.id} error={entry} timestamp={entry.timestamp} compact />
            ))}
          </div>
        </ScrollArea>
      </CollapsibleContent>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear error history?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {errorLog.length} saved {errorLog.length === 1 ? 'issue' : 'issues'} from
              this session. Export any diagnostics you still need first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep history</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearErrors();
                setShowClearConfirm(false);
              }}
            >
              Clear history
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}
