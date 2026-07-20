import type { StructuredError } from '@shared/errors';
import { formatErrorDiagnostics } from '@shared/errors';
import {
  AlertTriangle,
  ChevronDown,
  Copy,
  FileDown,
  FolderOpen,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export interface ErrorPresentationAction {
  label: string;
  onClick: () => void | Promise<void>;
  icon?: LucideIcon;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
}

interface ErrorPresentationProps {
  error: StructuredError;
  actions?: readonly ErrorPresentationAction[];
  compact?: boolean;
  className?: string;
  timestamp?: number;
}

function formatExportEntry(
  error: StructuredError,
  timestamp: number,
): {
  timestamp: number;
  source: string;
  message: string;
  details: string;
} {
  return {
    timestamp,
    source: error.source,
    message: error.headline,
    details: formatErrorDiagnostics(error),
  };
}

/**
 * Creator-facing error anatomy shared by processing, review, render, and the
 * durable error history. Diagnostics never render until Details is opened.
 */
export function ErrorPresentation({
  error,
  actions = [],
  compact = false,
  className,
  timestamp = Date.now(),
}: ErrorPresentationProps): React.JSX.Element {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const headingId = useId();
  const diagnostics = formatErrorDiagnostics(error);

  const copyDiagnostics = (): void => {
    void navigator.clipboard.writeText(diagnostics);
  };

  const exportDiagnostics = async (): Promise<void> => {
    const result = await window.api.exportLogs([formatExportEntry(error, timestamp)]);
    if (result) await window.api.showItemInFolder(result.exportPath);
  };

  return (
    <section
      role="alert"
      aria-labelledby={headingId}
      className={cn(
        'rounded-lg border border-destructive/35 bg-destructive/[0.06] text-foreground',
        compact ? 'p-3' : 'p-4',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="text-sm font-semibold text-destructive">
            {error.headline}
          </h3>

          <dl className={cn('grid gap-2', compact ? 'mt-2' : 'mt-3 sm:grid-cols-3')}>
            <div className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                What happened
              </dt>
              <dd className="mt-0.5 break-words text-xs leading-5">{error.whatHappened}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                What is safe
              </dt>
              <dd className="mt-0.5 break-words text-xs leading-5">{error.whatIsSafe}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                What to do next
              </dt>
              <dd className="mt-0.5 break-words text-xs leading-5">{error.whatToDoNext}</dd>
            </div>
          </dl>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.label}
                  type="button"
                  size="sm"
                  variant={action.variant ?? 'default'}
                  disabled={action.disabled}
                  onClick={() => void action.onClick()}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
                  {action.label}
                </Button>
              );
            })}

            <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="w-full">
              <CollapsibleTrigger asChild>
                <Button type="button" size="sm" variant="ghost" aria-expanded={detailsOpen}>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform duration-150',
                      detailsOpen && 'rotate-180',
                    )}
                    aria-hidden="true"
                  />
                  Details
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 w-full">
                <div className="rounded-md border border-border/80 bg-muted/50">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
                    <div>
                      <p className="text-xs font-medium">Technical Error Log</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Reference {error.correlationId}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <Button type="button" size="sm" variant="ghost" onClick={copyDiagnostics}>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        Copy Diagnostics
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void exportDiagnostics()}
                      >
                        <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                        Export Logs
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void window.api.openLogFolder()}
                      >
                        <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                        Open Log Folder
                      </Button>
                    </div>
                  </div>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-[11px] leading-5 text-muted-foreground">
                    {diagnostics}
                  </pre>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </div>
    </section>
  );
}
