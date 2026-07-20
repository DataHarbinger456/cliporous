import { createStructuredError } from '@shared/errors';
import type { CreatorJob, CreatorStageResult } from '@shared/jobs';
import {
  AlertCircle,
  Check,
  Clapperboard,
  Combine,
  Download,
  FileText,
  Loader2,
  type LucideIcon,
  Repeat,
  RotateCcw,
  ScanFace,
  Settings as SettingsIcon,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ErrorPresentation } from '@/components/ErrorPresentation';
import { ProcessingActivityFeed } from '@/components/ProcessingActivityFeed';
import { SourceMediaSummary } from '@/components/SourceMediaSummary';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { usePipeline } from '@/hooks';
import { isMissingGeminiKeyError } from '@/lib/gemini-key';
import { cn } from '@/lib/utils';
import {
  estimateJobEtaSeconds,
  formatJobDuration,
  getPipelineOverallPercent,
} from '@/services/job-service';
import { locateMissingSource } from '@/services/media-relink-service';
import { useStore } from '@/store';
import type { OutputMode, PipelineStage } from '@/store/types';

type StageStatus = 'pending' | 'active' | 'done' | 'error';

interface StageRow {
  key: PipelineStage;
  label: string;
  icon: LucideIcon;
  modes: readonly OutputMode[];
  pauseExplanation: string;
}

const ALL_STAGES: readonly StageRow[] = [
  {
    key: 'downloading',
    label: 'Prepare source',
    icon: Download,
    modes: ['short', 'longform'],
    pauseExplanation: 'Large remote videos can pause while the source is verified and cached.',
  },
  {
    key: 'transcribing',
    label: 'Build transcript',
    icon: FileText,
    modes: ['short', 'longform'],
    pauseExplanation: 'Long sections can be quiet while the local speech model finishes a chunk.',
  },
  {
    key: 'scoring',
    label: 'Find moments',
    icon: Sparkles,
    modes: ['short'],
    pauseExplanation: 'The transcript is read as a whole before candidate moments settle.',
  },
  {
    key: 'stitching',
    label: 'Compose stories',
    icon: Combine,
    modes: ['short'],
    pauseExplanation: 'Related moments are checked together before a stitched story is kept.',
  },
  {
    key: 'optimizing-loops',
    label: 'Tighten timing',
    icon: Repeat,
    modes: ['short'],
    pauseExplanation: 'Each candidate is checked for a clean opening, ending, and loop.',
  },
  {
    key: 'detecting-faces',
    label: 'Frame speakers',
    icon: ScanFace,
    modes: ['short'],
    pauseExplanation: 'Scene changes are checked before speaker-aware framing can settle.',
  },
  {
    key: 'ai-editing',
    label: 'Design edit',
    icon: Clapperboard,
    modes: ['longform'],
    pauseExplanation: 'Long-form plans settle one transcript window at a time.',
  },
  {
    key: 'segmenting',
    label: 'Style clips',
    icon: Wand2,
    modes: ['short'],
    pauseExplanation: 'Pacing, captions, and visual treatment are chosen clip by clip.',
  },
];

const STAGE_ORDER: readonly PipelineStage[] = ALL_STAGES.map((stage) => stage.key);

function deriveStatus(
  rowKey: PipelineStage,
  currentStage: PipelineStage,
  failedStage: PipelineStage | null,
  completed: ReadonlySet<PipelineStage>,
): StageStatus {
  if (failedStage === rowKey && currentStage === 'error') return 'error';
  if (completed.has(rowKey)) return 'done';
  if (currentStage === rowKey) return 'active';
  const rowIndex = STAGE_ORDER.indexOf(rowKey);
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  if (rowIndex >= 0 && currentIndex > rowIndex) return 'done';
  return 'pending';
}

function useClock(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [active]);
  return now;
}

function StatusIcon({ status }: { status: StageStatus }): React.JSX.Element | null {
  if (status === 'active') {
    return <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="In progress" />;
  }
  if (status === 'done') return <Check className="h-4 w-4 text-success" aria-label="Done" />;
  if (status === 'error') {
    return <AlertCircle className="h-4 w-4 text-destructive" aria-label="Needs attention" />;
  }
  return null;
}

function StageTimelineRow({
  row,
  status,
  percent,
  message,
  result,
  job,
  now,
}: {
  row: StageRow;
  status: StageStatus;
  percent: number;
  message: string;
  result: CreatorStageResult | undefined;
  job: CreatorJob | null;
  now: number;
}): React.JSX.Element {
  const Icon = row.icon;
  const isActive = status === 'active';
  const isDone = status === 'done';
  const isError = status === 'error';
  const barValue = isActive ? Math.max(0, Math.min(100, percent)) : isDone ? 100 : 0;
  const stageStartedAt = job?.stage === row.key ? job.stageStartedAt : now;
  const elapsedSeconds = Math.max(0, (now - stageStartedAt) / 1000);
  const etaSeconds = isActive && job?.stage === row.key ? estimateJobEtaSeconds(job, now) : null;
  const etaLabel =
    etaSeconds === null ? 'Estimating…' : `About ${formatJobDuration(etaSeconds)} left`;

  return (
    <div
      className={cn(
        'grid grid-cols-[1.25rem_minmax(0,1fr)_auto] gap-x-3 rounded-lg border px-3 py-3 transition-[background-color,border-color,opacity] duration-150',
        isActive && 'border-primary/40 bg-primary/[0.07]',
        isDone && 'border-border/60 bg-background/20',
        isError && 'border-destructive/50 bg-destructive/[0.07]',
        status === 'pending' && 'border-transparent opacity-65',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 h-5 w-5',
          isActive && 'text-foreground',
          isDone && 'text-muted-foreground',
          isError && 'text-destructive',
          status === 'pending' && 'text-muted-foreground/60',
        )}
        aria-hidden
      />
      <div className="min-w-0">
        <p
          className={cn(
            'text-sm font-medium',
            status === 'pending' ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {row.label}
        </p>
        <Progress
          value={barValue}
          className={cn(
            'mt-2 h-1.5',
            status === 'pending' && 'opacity-40',
            isError && '[&>div]:bg-destructive',
          )}
        />
        {isActive && (
          <p className="mt-1.5 truncate text-xs text-muted-foreground" title={message}>
            {message || 'Working through this stage…'}
          </p>
        )}
        {isDone && result && (
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{result.summary}</p>
        )}
        {isActive && elapsedSeconds >= 12 && (
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground/90">
            {row.pauseExplanation}
          </p>
        )}
      </div>
      <div className="flex min-w-[6.5rem] flex-col items-end gap-1 text-right">
        <StatusIcon status={status} />
        {isActive && (
          <div className="min-h-8 text-[10px] leading-4 text-muted-foreground">
            <div className="font-mono tabular-nums">
              {formatJobDuration(elapsedSeconds)} elapsed
            </div>
            <div>{etaLabel}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ProcessingScreen({
  onBackground = () => {},
}: {
  onBackground?: () => void;
}): React.JSX.Element {
  const stage = useStore((state) => state.pipeline.stage);
  const percent = useStore((state) => state.pipeline.percent);
  const message = useStore((state) => state.pipeline.message);
  const failedStage = useStore((state) => state.failedPipelineStage);
  const completed = useStore((state) => state.completedPipelineStages);
  const activeSource = useStore((state) => state.getActiveSource());
  const outputMode = useStore((state) => state.settings.outputMode);
  const errorLog = useStore((state) => state.errorLog);
  const processingCancellation = useStore((state) => state.processingCancellation);
  const currentJobId = useStore((state) => state.currentProcessingJobId);
  const job = useStore(
    (state) =>
      state.creatorJobs.find((candidate) => candidate.id === state.currentProcessingJobId) ?? null,
  );
  const cachedSourcePath = useStore((state) => state.cachedSourcePath);
  const discardProcessingWork = useStore((state) => state.discardProcessingWork);
  const now = useClock(stage !== 'error');
  const { processVideo, cancelProcessing } = usePipeline();

  const isError = stage === 'error';
  const isCancelling = processingCancellation.status === 'cancelling';
  const missingKey = isError && isMissingGeminiKeyError(message);
  const canResume =
    isError &&
    !missingKey &&
    failedStage !== null &&
    activeSource !== null &&
    activeSource.mediaStatus !== 'checking' &&
    activeSource.mediaStatus !== 'offline';

  const activeError = useMemo(() => {
    if (processingCancellation.error) return processingCancellation.error;
    if (!isError || job?.status === 'paused') return null;
    for (let index = errorLog.length - 1; index >= 0; index -= 1) {
      const entry = errorLog[index];
      if (entry?.source === 'pipeline') return entry;
    }
    return createStructuredError({ source: 'pipeline', message, failedStage });
  }, [errorLog, failedStage, isError, job?.status, message, processingCancellation.error]);

  const visibleStages = useMemo<readonly StageRow[]>(() => {
    const isYouTube = activeSource?.origin === 'youtube';
    return ALL_STAGES.filter((candidate) => {
      if (!candidate.modes.includes(outputMode)) return false;
      if (candidate.key === 'downloading' && !isYouTube) return false;
      return true;
    });
  }, [activeSource?.origin, outputMode]);

  const resultByStage = useMemo(
    () => new Map(job?.results.map((result) => [result.stage, result]) ?? []),
    [job?.results],
  );
  const overallPercent =
    job?.progress ??
    getPipelineOverallPercent(stage, percent, outputMode, activeSource?.origin === 'youtube');

  const handleResume = (): void => {
    if (!canResume || !activeSource || !failedStage) return;
    void processVideo(activeSource, failedStage);
  };

  if (!activeSource) {
    return (
      <div
        className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground"
        role="status"
      >
        Source media is unavailable. Return to projects and relink the source.
      </div>
    );
  }

  return (
    <div className="studio-shell h-full w-full overflow-y-auto px-4 py-4 sm:px-6 min-[1100px]:px-8 min-[1100px]:py-6">
      <Card className="surface-glow mx-auto grid w-full max-w-6xl overflow-hidden bg-card/90 min-[820px]:grid-cols-[minmax(240px,0.72fr)_minmax(0,1.45fr)]">
        <aside className="space-y-5 border-b border-border/80 bg-background/35 p-5 min-[820px]:border-b-0 min-[820px]:border-r min-[1100px]:p-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Processing source
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Building your selects
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Follow the real source, completed evidence, and the latest creative decisions.
            </p>
          </div>
          <SourceMediaSummary
            source={activeSource}
            outputMode={outputMode}
            cachedSourcePath={cachedSourcePath}
          />
          <section className="space-y-2" aria-label="Overall job progress">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {isCancelling
                  ? 'Stopping safely'
                  : job?.status === 'paused'
                    ? 'Progress kept'
                    : 'Overall progress'}
              </span>
              <span className="font-mono tabular-nums">{Math.round(overallPercent)}%</span>
            </div>
            <Progress value={overallPercent} className="h-2" />
          </section>
          <div className="flex flex-wrap gap-2 min-[820px]:hidden">
            <Button type="button" variant="ghost" size="sm" onClick={onBackground}>
              Work in background
            </Button>
            {!isError && processingCancellation.status !== 'failed' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void cancelProcessing()}
                disabled={isCancelling}
                aria-live="polite"
              >
                {isCancelling && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                {isCancelling ? 'Stopping…' : 'Stop and keep progress'}
              </Button>
            )}
          </div>
          <ProcessingActivityFeed job={job} />
        </aside>

        <section className="min-w-0 p-5 min-[1100px]:p-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Creative stages
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Completed stages settle into real, reusable results.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden min-[820px]:inline-flex"
              onClick={onBackground}
            >
              Keep working in background
            </Button>
          </div>

          <Separator className="my-4" />

          {job?.status === 'paused' && (
            <div
              className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3"
              role="status"
            >
              <p className="text-sm font-semibold text-foreground">Progress is safely paused</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Transcript, candidates, cached source media, and completed stage results are still
                available.
              </p>
              <Button className="mt-3" size="sm" onClick={handleResume} disabled={!canResume}>
                <RotateCcw aria-hidden /> Resume from{' '}
                {failedStage?.replace(/[-_]/g, ' ') ?? 'checkpoint'}
              </Button>
            </div>
          )}

          {activeError && (isError || processingCancellation.status === 'failed') && (
            <ErrorPresentation
              error={activeError}
              className="mb-4"
              actions={
                processingCancellation.status === 'failed'
                  ? [
                      {
                        label: 'Retry stop',
                        onClick: async () => {
                          await cancelProcessing();
                        },
                        icon: RotateCcw,
                      },
                    ]
                  : missingKey || activeError.recoveryAction === 'open-settings'
                    ? [
                        {
                          label: 'Open Settings',
                          onClick: () => void window.api.openSettingsWindow(),
                          icon: SettingsIcon,
                        },
                      ]
                    : activeError.recoveryAction === 'free-space'
                      ? [
                          {
                            label: 'Free Space',
                            onClick: () => void window.api.openSettingsWindow(),
                            icon: SettingsIcon,
                          },
                        ]
                      : activeError.recoveryAction === 'relink'
                        ? [
                            {
                              label: 'Relink Source',
                              onClick: async () => {
                                await locateMissingSource(activeSource.id);
                              },
                            },
                          ]
                        : canResume
                          ? [
                              {
                                label: `Resume from ${failedStage}`,
                                onClick: handleResume,
                                icon: RotateCcw,
                              },
                            ]
                          : []
              }
            />
          )}

          <div className="flex flex-col gap-1.5">
            {visibleStages.map((row) => (
              <StageTimelineRow
                key={row.key}
                row={row}
                status={deriveStatus(row.key, stage, failedStage, completed)}
                percent={percent}
                message={message}
                result={resultByStage.get(row.key)}
                job={job}
                now={now}
              />
            ))}
          </div>

          <Separator className="my-4" />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={isCancelling || !currentJobId}>
                  Start over…
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Discard cached processing work?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the transcript, candidate clips, stitched stories, and completed
                    stage results for {activeSource.name}. The source video stays on disk.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep progress</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => currentJobId && discardProcessingWork(currentJobId)}
                  >
                    Start over and discard cache
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="flex items-center gap-2">
              {isError && (
                <Button variant="ghost" size="sm" onClick={onBackground}>
                  Back to projects
                </Button>
              )}
              {!isError && processingCancellation.status !== 'failed' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden min-[820px]:inline-flex"
                  onClick={() => void cancelProcessing()}
                  disabled={isCancelling}
                  aria-live="polite"
                >
                  {isCancelling && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                  {isCancelling ? 'Stopping…' : 'Stop and keep progress'}
                </Button>
              )}
            </div>
          </div>
        </section>
      </Card>
    </div>
  );
}
