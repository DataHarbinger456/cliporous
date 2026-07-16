import { ChevronDown, ChevronRight, Copy, FileDown, Terminal, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import { useStore } from '@/store';
import type { ErrorLogEntry } from '@/store/types';

// ---------------------------------------------------------------------------
// Source label / colour mapping
// ---------------------------------------------------------------------------

const SOURCE_LABELS: Record<string, string> = {
  pipeline: 'PIPE',
  transcription: 'ASR',
  scoring: 'AI',
  ffmpeg: 'FF',
  youtube: 'YT',
  'face-detection': 'FACE',
  render: 'REN',
};

const SOURCE_COLORS: Record<string, string> = {
  pipeline: 'indicator-pipeline',
  transcription: 'indicator-transcription',
  scoring: 'indicator-ai',
  ffmpeg: 'indicator-success',
  youtube: 'indicator-error',
  'face-detection': 'indicator-face',
  render: 'indicator-render',
};

function getSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.slice(0, 4).toUpperCase();
}

function getSourceColor(source: string): string {
  return SOURCE_COLORS[source] ?? 'bg-muted text-muted-foreground border-border';
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

function formatEntry(entry: ErrorLogEntry): string {
  return `[${formatTime(entry.timestamp)}] [${entry.source}] ${entry.message}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ErrorLog(): React.JSX.Element | null {
  const errorLog = useStore((s) => s.errorLog);
  const clearErrors = useStore((s) => s.clearErrors);
  const [expanded, setExpanded] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  const toggleDetails = (id: string): void => {
    setExpandedDetails((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Auto-expand when first error arrives
  useEffect(() => {
    if (errorLog.length > 0) {
      setExpanded(true);
    }
  }, [errorLog.length]);

  // Auto-scroll to newest error
  useEffect(() => {
    if (errorLog.length > 0 && expanded && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [errorLog.length, expanded]);

  if (errorLog.length === 0) return null;

  const copyAll = (): void => {
    const text = errorLog.map(formatEntry).join('\n');
    void navigator.clipboard.writeText(text);
  };

  const copyOne = (entry: ErrorLogEntry): void => {
    void navigator.clipboard.writeText(formatEntry(entry));
  };

  const exportFullLog = async (): Promise<void> => {
    const errors = errorLog.map((e) => ({
      timestamp: e.timestamp,
      source: e.source,
      message: e.message,
      ...(e.details ? { details: e.details } : {}),
    }));
    try {
      const result = await window.api.exportLogs(errors);
      if (result) {
        await window.api.showItemInFolder(result.exportPath);
      }
    } catch {
      // Ignore export errors
    }
  };

  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      className="border-border bg-card shrink-0 border-t"
    >
      <div className="hover:bg-muted/50 flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors">
        <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-left">
          {expanded ? (
            <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
          )}
          <span className="text-destructive font-medium">Errors</span>
          <Badge variant="destructive" className="h-4 px-1.5 py-0 text-[10px]">
            {errorLog.length}
          </Badge>
        </CollapsibleTrigger>
        {expanded && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="Export full debug log"
              onClick={exportFullLog}
            >
              <FileDown className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="Copy all errors"
              onClick={copyAll}
            >
              <Copy className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="Clear errors"
              onClick={() => setShowClearConfirm(true)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      <CollapsibleContent>
        <ScrollArea className="max-h-48">
          <div className="space-y-1 px-4 pb-3">
            {errorLog.map((entry) => (
              <div key={entry.id} className="space-y-1">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    className="hover:bg-muted/50 group flex min-w-0 flex-1 items-start gap-2 rounded px-2 py-1 text-left text-xs transition-colors"
                    onClick={() => copyOne(entry)}
                    title="Click to copy"
                  >
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {formatTime(entry.timestamp)}
                    </span>
                    <Badge
                      variant="outline"
                      className={`h-4 shrink-0 px-1 py-0 font-mono text-[10px] ${getSourceColor(entry.source)}`}
                    >
                      {getSourceLabel(entry.source)}
                    </Badge>
                    <span className="text-destructive/90 flex-1 break-all">{entry.message}</span>
                  </button>
                  {entry.details && (
                    <button
                      type="button"
                      className="hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5 transition-colors"
                      title={expandedDetails.has(entry.id) ? 'Hide details' : 'Show details'}
                      onClick={() => toggleDetails(entry.id)}
                    >
                      <Terminal className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {entry.details && expandedDetails.has(entry.id) && (
                  <div className="bg-muted border-border/50 mx-2 rounded border">
                    <div className="border-border/50 flex items-center justify-between border-b px-2 py-1">
                      <span className="text-muted-foreground font-mono text-[10px]">Details</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4"
                        title="Copy details"
                        onClick={(e) => {
                          e.stopPropagation();
                          void navigator.clipboard.writeText(entry.details ?? '');
                        }}
                      >
                        <Copy className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                    <pre className="text-muted-foreground max-h-32 overflow-auto p-2 font-mono text-[10px] leading-relaxed break-all whitespace-pre-wrap">
                      {entry.details}
                    </pre>
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </CollapsibleContent>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Error Log</AlertDialogTitle>
            <AlertDialogDescription>
              Clear all {errorLog.length} {errorLog.length !== 1 ? 'error entries' : 'error entry'}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearErrors();
                setShowClearConfirm(false);
              }}
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}
