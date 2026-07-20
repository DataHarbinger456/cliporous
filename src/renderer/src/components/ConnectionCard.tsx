import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleOff,
  CircleX,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  type LucideIcon,
  WifiOff,
} from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type ConnectionState =
  | 'loading'
  | 'not-configured'
  | 'configured'
  | 'testing'
  | 'connected'
  | 'degraded'
  | 'invalid'
  | 'failed'
  | 'unavailable';

const STATE_PRESENTATION: Record<
  ConnectionState,
  { label: string; icon: LucideIcon; className: string }
> = {
  loading: {
    label: 'Checking configuration',
    icon: Loader2,
    className: 'text-muted-foreground border-border bg-muted/50',
  },
  'not-configured': {
    label: 'Not configured',
    icon: CircleDashed,
    className: 'text-muted-foreground border-border bg-muted/50',
  },
  configured: {
    label: 'Configured, not tested',
    icon: KeyRound,
    className: 'indicator-info border-info/30 bg-info/10',
  },
  testing: {
    label: 'Testing',
    icon: Loader2,
    className: 'indicator-info border-info/30 bg-info/10',
  },
  connected: {
    label: 'Connected',
    icon: CheckCircle2,
    className: 'status-success border-success/30 bg-success/10',
  },
  degraded: {
    label: 'Connected, degraded',
    icon: AlertTriangle,
    className: 'indicator-warning border-warning/30 bg-warning/10',
  },
  invalid: {
    label: 'Invalid',
    icon: CircleX,
    className: 'status-danger border-destructive/30 bg-destructive/10',
  },
  failed: {
    label: 'Test failed',
    icon: WifiOff,
    className: 'status-danger border-destructive/30 bg-destructive/10',
  },
  unavailable: {
    label: 'Optional and unavailable',
    icon: CircleOff,
    className: 'text-muted-foreground border-border bg-muted/50',
  },
};

export interface ConnectionCardProps {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  required?: boolean;
  value: string;
  placeholder: string;
  state: ConnectionState;
  feedback: string;
  impact: string;
  keyUrl?: string;
  onChange: (value: string) => void;
  onTest?: () => void;
}

export function ConnectionCard({
  id,
  name,
  description,
  icon: ProviderIcon,
  required = false,
  value,
  placeholder,
  state,
  feedback,
  impact,
  keyUrl,
  onChange,
  onTest,
}: ConnectionCardProps): React.JSX.Element {
  const [visible, setVisible] = React.useState(false);
  const presentation = STATE_PRESENTATION[state];
  const StatusIcon = presentation.icon;
  const feedbackId = `${id}-feedback`;
  const impactId = `${id}-impact`;
  const isTesting = state === 'testing';
  const canTest =
    Boolean(onTest) && value.trim().length > 0 && !isTesting && state !== 'unavailable';

  return (
    <section
      className="border-border bg-card rounded-lg border p-4"
      aria-labelledby={`${id}-title`}
    >
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <ProviderIcon className="text-primary mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={`${id}-title`} className="text-sm font-semibold">
                {name}
              </h3>
              <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
                {required ? 'Required for AI editing' : 'Optional'}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">{description}</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn('shrink-0 gap-1 border px-2 py-1 text-[10px]', presentation.className)}
          role="status"
          aria-live="polite"
        >
          <StatusIcon
            className={cn('h-3 w-3', (state === 'loading' || isTesting) && 'animate-spin')}
            aria-hidden="true"
          />
          {presentation.label}
        </Badge>
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor={id}>{name} API key</Label>
        <div className="flex gap-2 max-sm:flex-col">
          <div className="relative min-w-0 flex-1">
            <Input
              id={id}
              type={visible ? 'text' : 'password'}
              value={value}
              placeholder={placeholder}
              autoComplete="off"
              spellCheck={false}
              disabled={state === 'loading'}
              aria-describedby={`${feedbackId} ${impactId}`}
              aria-invalid={state === 'invalid' ? true : undefined}
              onChange={(event) => onChange(event.target.value)}
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setVisible((current) => !current)}
              aria-label={visible ? `Hide ${name} API key` : `Show ${name} API key`}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {visible ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {onTest && (
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={!canTest}
              onClick={onTest}
            >
              {isTesting ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 aria-hidden="true" />
              )}
              {isTesting ? 'Testing…' : 'Test connection'}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-[1fr_auto] sm:items-start">
        <p
          id={feedbackId}
          className={cn(
            state === 'invalid' || state === 'failed'
              ? 'text-destructive'
              : state === 'connected'
                ? 'status-success'
                : state === 'degraded'
                  ? 'status-warning'
                  : 'text-muted-foreground',
          )}
          role={state === 'invalid' || state === 'failed' ? 'alert' : undefined}
        >
          {feedback}
        </p>
        {keyUrl && (
          <a
            href={keyUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex min-h-6 items-center gap-1 rounded underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Get a key
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
      </div>

      <div
        id={impactId}
        className="border-border/70 bg-muted/35 mt-3 rounded-md border px-3 py-2 text-xs"
      >
        <span className="text-foreground font-medium">Feature impact: </span>
        <span className="text-muted-foreground">{impact}</span>
      </div>
    </section>
  );
}
