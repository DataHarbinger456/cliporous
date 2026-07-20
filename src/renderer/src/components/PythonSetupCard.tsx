import { createStructuredError } from '@shared/errors';
import { PYTHON_SETUP_REQUIRED_FREE_BYTES, type PythonSetupProgress } from '@shared/python-setup';
import {
  CheckCircle2,
  Clock3,
  Download,
  Film,
  HardDrive,
  Loader2,
  MapPin,
  RefreshCw,
  RotateCcw,
  Wifi,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorPresentation } from '@/components/ErrorPresentation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { usePythonSetup } from '@/hooks';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

interface PythonSetupCardProps {
  context?: 'first-run' | 'settings';
  queuedSourceName?: string | null;
}

const STAGE_LABELS: Record<PythonSetupProgress['stage'], string> = {
  'downloading-python': 'Preparing the local runtime',
  extracting: 'Unpacking the local runtime',
  'creating-venv': 'Creating a private workspace',
  'installing-packages': 'Installing transcription and face tools',
  'downloading-model': 'Downloading the speech model',
  verifying: 'Checking the installation',
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unavailable';
  const gibibytes = bytes / 1024 ** 3;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(gibibytes)} GB`;
}

interface SetupFactProps {
  icon: typeof Download;
  label: string;
  children: ReactNode;
  tone?: 'default' | 'warning' | 'success';
}

function SetupFact({ icon: Icon, label, children, tone = 'default' }: SetupFactProps) {
  return (
    <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-3 py-2 sm:py-2.5">
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4',
          tone === 'warning'
            ? 'text-warning'
            : tone === 'success'
              ? 'text-success'
              : 'text-muted-foreground',
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 space-y-0.5">
        <p className="text-foreground text-sm font-medium">{label}</p>
        <div className="text-muted-foreground text-xs leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export function PythonSetupCard({
  context = 'first-run',
  queuedSourceName = null,
}: PythonSetupCardProps): React.JSX.Element {
  const status = useStore((s) => s.pythonStatus);
  const details = useStore((s) => s.pythonSetupDetails);
  const progress = useStore((s) => s.pythonSetupProgress);
  const error = useStore((s) => s.pythonSetupError);
  const errorLog = useStore((s) => s.errorLog);
  const setPythonStatus = useStore((s) => s.setPythonStatus);
  const setPythonSetupError = useStore((s) => s.setPythonSetupError);
  const { start, retry, cancel, refresh } = usePythonSetup(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const handleConnectivityChange = (): void => {
      void refresh();
    };
    window.addEventListener('online', handleConnectivityChange);
    window.addEventListener('offline', handleConnectivityChange);
    return () => {
      window.removeEventListener('online', handleConnectivityChange);
      window.removeEventListener('offline', handleConnectivityChange);
    };
  }, [refresh]);

  const beginSetup = useCallback(
    async (isRetry = false): Promise<void> => {
      setActionError(null);
      try {
        await (isRetry ? retry() : start());
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        setActionError(message);
        if (!/Connect to the internet|Free at least 6 GB/.test(message)) {
          setPythonStatus('error');
          setPythonSetupError(message);
        }
      }
    },
    [retry, setPythonSetupError, setPythonStatus, start],
  );

  const structuredError = useMemo(() => {
    for (let index = errorLog.length - 1; index >= 0; index -= 1) {
      const entry = errorLog[index];
      if (entry?.source === 'python-setup') return entry;
    }
    return createStructuredError({
      source: 'python-setup',
      message: error ?? 'Local content-tool setup failed',
      headline: 'Content tools could not be installed',
      whatHappened: 'BatchClip could not finish installing its local transcription tools.',
      whatIsSafe: 'Your projects and source media have not been changed.',
      whatToDoNext: 'Check your connection and free disk space, then retry setup.',
      failedStage: 'python-setup',
      recoveryAction: 'retry',
    });
  }, [error, errorLog]);

  const isChecking = status === 'checking' || details === null;
  const isInstalling = status === 'installing' || status === 'cancelling';
  const isRepair =
    status === 'repair-needed' || (context === 'settings' && details?.stage !== 'not-setup');
  const isOffline = details ? !details.networkOnline : !navigator.onLine;
  const hasEnoughDisk = (details?.freeDiskBytes ?? 0) >= PYTHON_SETUP_REQUIRED_FREE_BYTES;
  const canStart = !isChecking && !isOffline && hasEnoughDisk && !isInstalling;
  const percent = progress?.percent ?? 0;
  const stageLabel = progress ? STAGE_LABELS[progress.stage] : 'Preparing setup';

  if (isChecking) {
    return (
      <Card
        className={cn(
          'flex items-center justify-center gap-3 p-8',
          context === 'first-run' && 'min-h-[42vh] border-2 border-dashed bg-card/55 shadow-none',
        )}
        role="status"
      >
        <Loader2 className="text-primary h-5 w-5 animate-spin" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">Checking local content tools</p>
          <p className="text-muted-foreground text-xs">No download starts during this check.</p>
        </div>
      </Card>
    );
  }

  const heading = isRepair ? 'Repair local content tools' : 'Set up local content tools';
  const description = isRepair
    ? 'Reinstall the private transcription, face-tracking, and speech-model files BatchClip uses to prepare footage.'
    : 'BatchClip needs private local tools to transcribe speech and follow faces before it can shape your footage.';

  return (
    <Card
      className={cn(
        'overflow-hidden',
        context === 'first-run' && 'border-2 border-dashed bg-card/70 shadow-none',
      )}
    >
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]">
        <div className="space-y-4 p-4 sm:space-y-5 sm:p-7">
          <div className="flex items-start gap-3">
            <div className="min-w-0 space-y-1">
              <h2 className="text-foreground text-xl font-semibold tracking-tight">{heading}</h2>
              <p className="text-muted-foreground max-w-xl text-sm leading-relaxed">
                {description}
              </p>
            </div>
          </div>

          {queuedSourceName && (
            <div className="border-info/35 bg-info/10 flex items-start gap-3 rounded-lg border p-3">
              <Film className="text-info mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Your video is queued</p>
                <p className="text-muted-foreground break-words text-xs">
                  {queuedSourceName} will continue automatically when setup finishes.
                </p>
              </div>
            </div>
          )}

          <div className="divide-border divide-y">
            <SetupFact icon={Download} label="2–3 GB download">
              One-time speech model and content-tool download. Usually 10–30 minutes.
            </SetupFact>
            <SetupFact
              icon={isOffline ? WifiOff : Wifi}
              label={isOffline ? 'Internet connection needed' : 'Internet connection ready'}
              tone={isOffline ? 'warning' : 'success'}
            >
              Required for setup. If it drops, retry reuses files that already finished.
            </SetupFact>
            <SetupFact
              icon={HardDrive}
              label="6 GB free space required"
              tone={hasEnoughDisk ? 'success' : 'warning'}
            >
              {formatBytes(details?.freeDiskBytes ?? 0)} is currently available on this drive.
            </SetupFact>
            <SetupFact icon={MapPin} label="Stored on this computer">
              <code className="text-foreground break-all font-mono text-[11px]">
                {details?.storagePath}
              </code>
            </SetupFact>
            <SetupFact icon={Clock3} label="Works locally after setup">
              Transcription and face tracking work offline after setup without another download.
              Gemini scoring and YouTube imports still need internet.
            </SetupFact>
          </div>
        </div>

        <div className="border-border bg-muted/25 flex min-w-0 flex-col justify-center border-t p-4 sm:p-7 lg:border-t-0 lg:border-l">
          {isInstalling ? (
            <div className="space-y-5" aria-live="polite">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {status === 'cancelling' ? (
                    <Loader2
                      className="text-muted-foreground h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Download className="text-primary h-4 w-4" aria-hidden="true" />
                  )}
                  <h3 className="text-sm font-semibold">
                    {status === 'cancelling' ? 'Stopping setup…' : stageLabel}
                  </h3>
                </div>
                <p className="text-muted-foreground min-h-10 text-xs leading-relaxed">
                  {status === 'cancelling'
                    ? 'Finishing the current file operation and keeping completed downloads for retry.'
                    : (progress?.message ?? 'Preparing local content tools…')}
                </p>
              </div>
              <div className="space-y-2">
                <Progress value={percent} className="h-2" aria-label="Setup progress" />
                <div className="text-muted-foreground flex justify-between gap-3 text-xs">
                  <span>Keep BatchClip open</span>
                  <span className="shrink-0 tabular-nums">Overall {percent}%</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={status === 'cancelling'}
                onClick={() => void cancel()}
              >
                <X aria-hidden="true" />
                {status === 'cancelling' ? 'Stopping…' : 'Cancel setup'}
              </Button>
            </div>
          ) : status === 'error' ? (
            <ErrorPresentation
              error={structuredError}
              actions={[
                {
                  label: 'Retry setup',
                  onClick: () => void beginSetup(true),
                  icon: RotateCcw,
                  disabled: !canStart,
                },
                {
                  label: 'Check connection and space',
                  onClick: () => void refresh(),
                  icon: RefreshCw,
                  variant: 'outline',
                },
              ]}
            />
          ) : status === 'ready' && context === 'settings' ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="text-success mt-0.5 h-5 w-5" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold">Local tools are ready</h3>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    Repair only if transcription or face tracking stops loading. Projects and source
                    media stay untouched.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={!canStart}
                onClick={() => void beginSetup()}
              >
                <Wrench aria-hidden="true" />
                Repair content tools
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Ready when you are</h3>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  Nothing downloads until you choose the setup action below.
                </p>
              </div>
              {(actionError || isOffline || !hasEnoughDisk) && (
                <p className="text-warning text-xs" role="alert">
                  {actionError ??
                    (isOffline
                      ? 'Reconnect to start the download.'
                      : `Free at least 6 GB. ${formatBytes(details?.freeDiskBytes ?? 0)} is available.`)}
                </p>
              )}
              <Button
                type="button"
                className="w-full"
                disabled={!canStart}
                onClick={() => void beginSetup()}
              >
                {isRepair ? <Wrench aria-hidden="true" /> : <Download aria-hidden="true" />}
                {isRepair ? 'Repair content tools' : 'Download local tools'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => void refresh()}
              >
                <RefreshCw aria-hidden="true" />
                Check connection and space again
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
