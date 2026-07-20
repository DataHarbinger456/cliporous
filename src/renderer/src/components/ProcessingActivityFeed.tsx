import type { CreatorJob } from '@shared/jobs';
import { AlertCircle, Check, ChevronDown, ChevronUp, Circle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDisplayPreferences } from '@/services/display-preferences';

const DEFAULT_VISIBLE_ROWS = 3;

export function ProcessingActivityFeed({ job }: { job: CreatorJob | null }): React.JSX.Element {
  const displayPreferences = useDisplayPreferences();
  const [expanded, setExpanded] = useState(displayPreferences.activityFeedExpanded);
  const entries = job?.activities ?? [];
  const visibleEntries = expanded ? entries : entries.slice(-DEFAULT_VISIBLE_ROWS);

  return (
    <section
      className="rounded-lg border border-border/70 bg-background/35"
      aria-labelledby="activity-feed-title"
    >
      <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
        <div className="min-w-0">
          <h2 id="activity-feed-title" className="text-sm font-semibold text-foreground">
            Activity
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Recent transcript, moment, face, and styling work
          </p>
        </div>
        {entries.length > DEFAULT_VISIBLE_ROWS && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            aria-expanded={expanded}
            aria-controls="processing-activity-list"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
            {expanded ? 'Collapse' : 'Details'}
          </Button>
        )}
      </div>
      <ol
        id="processing-activity-list"
        className="border-t border-border/70 px-3 py-1"
        aria-label="Processing activity"
      >
        {visibleEntries.length === 0 ? (
          <li className="py-3 text-xs text-muted-foreground">
            Preparing the first activity update…
          </li>
        ) : (
          visibleEntries.map((entry) => {
            const StatusIcon =
              entry.status === 'done' ? Check : entry.status === 'error' ? AlertCircle : Circle;
            return (
              <li
                key={entry.id}
                className="flex min-h-9 items-start gap-2 border-b border-border/50 py-2 last:border-b-0"
              >
                <StatusIcon
                  className={cn(
                    'mt-0.5 h-3.5 w-3.5 shrink-0',
                    entry.status === 'done' && 'text-success',
                    entry.status === 'error' && 'text-destructive',
                    entry.status === 'running' && 'fill-primary/25 text-primary',
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium leading-5 text-foreground">{entry.text}</p>
                  {entry.detail && (
                    <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                      {entry.detail}
                    </p>
                  )}
                </div>
              </li>
            );
          })
        )}
      </ol>
      <p className="sr-only" role="status" aria-live="polite">
        {entries.at(-1)?.text ?? 'Processing activity is starting'}
      </p>
    </section>
  );
}
