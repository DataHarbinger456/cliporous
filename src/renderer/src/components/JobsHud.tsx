import type { CreatorJob } from '@shared/jobs';
import { BriefcaseBusiness, ExternalLink, FolderOpen, RotateCcw, Square, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { stopActiveProcessingAndKeepProgress, usePipeline } from '@/hooks/usePipeline';
import { cn } from '@/lib/utils';
import { formatJobDuration } from '@/services/job-service';
import { startApprovedRender } from '@/services/render-service';
import { useStore } from '@/store';
import type { PipelineStage } from '@/store/types';

interface JobsHudProps {
  onOpenJob: (job: CreatorJob) => void | Promise<void>;
  compact?: boolean;
}

function readableStage(stage: string): string {
  return stage.replace(/[-_]/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
}

function statusLabel(job: CreatorJob): string {
  if (job.status === 'paused') return 'Progress kept';
  if (job.status === 'failed') return 'Needs attention';
  if (job.status === 'completed') return 'Complete';
  if (job.status === 'cancelling') return 'Stopping';
  if (job.status === 'cancelled') return 'Stopped';
  if (job.status === 'queued') return 'Queued';
  return readableStage(job.stage);
}

function JobRow({
  job,
  now,
  onOpenJob,
}: {
  job: CreatorJob;
  now: number;
  onOpenJob: JobsHudProps['onOpenJob'];
}): React.JSX.Element {
  const currentProjectId = useStore((state) => state.currentProject.id);
  const source = useStore(
    (state) => state.sources.find((item) => item.id === job.sourceId) ?? null,
  );
  const dismissCreatorJob = useStore((state) => state.dismissCreatorJob);
  const resumeProcessingJob = useStore((state) => state.resumeProcessingJob);
  const { processVideo } = usePipeline();
  const active = job.status === 'running' || job.status === 'queued' || job.status === 'cancelling';
  const elapsedEnd = job.completedAt ?? now;
  const elapsed = formatJobDuration((elapsedEnd - job.startedAt) / 1000);
  const canResumeProcessing =
    job.kind === 'processing' &&
    (job.status === 'paused' || job.status === 'failed') &&
    job.projectId === currentProjectId &&
    source !== null &&
    job.failedStage !== null;

  const handleStop = async (): Promise<void> => {
    if (job.kind === 'processing') {
      await stopActiveProcessingAndKeepProgress();
      return;
    }
    await window.api.stopRenderAfterCurrent();
  };
  const handleRetry = async (): Promise<void> => {
    if (canResumeProcessing && source && job.failedStage) {
      resumeProcessingJob(job.id);
      await processVideo(source, job.failedStage as PipelineStage);
      return;
    }
    if (
      job.kind === 'render' &&
      job.failedItemIds.length > 0 &&
      job.projectId === currentProjectId
    ) {
      await startApprovedRender({ clipIds: job.failedItemIds });
    }
  };

  return (
    <div className="px-2 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground" title={job.projectName}>
            {job.projectName}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={job.sourceName}>
            {job.kind === 'processing' ? 'Clips' : 'Export'} · {job.sourceName}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 text-[10px] font-semibold',
            job.status === 'failed' && 'text-destructive',
            job.status === 'paused' && 'text-warning',
            job.status === 'completed' && 'text-success',
            active && job.status !== 'cancelling' && 'text-primary',
            (job.status === 'cancelled' || job.status === 'cancelling') && 'text-muted-foreground',
          )}
        >
          {statusLabel(job)}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Progress value={job.progress} className="h-1.5 flex-1" />
        <span className="w-9 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
          {Math.round(job.progress)}%
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
        <span className="truncate">{job.message || statusLabel(job)}</span>
        <span className="shrink-0 font-mono tabular-nums">{elapsed}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <DropdownMenuItem
          className="h-8 flex-1 justify-center"
          onSelect={() => void onOpenJob(job)}
        >
          <ExternalLink aria-hidden /> Open
        </DropdownMenuItem>
        {active && job.status !== 'cancelling' && (
          <DropdownMenuItem
            className="h-8 flex-1 justify-center"
            onSelect={() => void handleStop()}
          >
            <Square aria-hidden /> {job.kind === 'render' ? 'Stop after current' : 'Stop'}
          </DropdownMenuItem>
        )}
        {(canResumeProcessing ||
          (job.kind === 'render' &&
            job.status === 'failed' &&
            job.failedItemIds.length > 0 &&
            job.projectId === currentProjectId)) && (
          <DropdownMenuItem
            className="h-8 flex-1 justify-center"
            onSelect={() => void handleRetry()}
          >
            <RotateCcw aria-hidden /> Retry
          </DropdownMenuItem>
        )}
        {job.outputPaths[0] && (
          <DropdownMenuItem
            className="h-8 flex-1 justify-center"
            onSelect={() => void window.api.showItemInFolder(job.outputPaths[0] as string)}
          >
            <FolderOpen aria-hidden /> Reveal
          </DropdownMenuItem>
        )}
        {!active && (
          <DropdownMenuItem
            className="h-8 justify-center"
            onSelect={() => dismissCreatorJob(job.id)}
          >
            <X aria-hidden /> Dismiss
          </DropdownMenuItem>
        )}
      </div>
    </div>
  );
}

export function JobsHud({ onOpenJob, compact = false }: JobsHudProps): React.JSX.Element {
  const jobs = useStore((state) => state.creatorJobs);
  const [now, setNow] = useState(Date.now());
  const visibleJobs = useMemo(
    () =>
      [...jobs]
        .sort((left, right) => {
          const leftActive = ['running', 'queued', 'cancelling'].includes(left.status) ? 1 : 0;
          const rightActive = ['running', 'queued', 'cancelling'].includes(right.status) ? 1 : 0;
          return rightActive - leftActive || right.updatedAt - left.updatedAt;
        })
        .slice(0, 8),
    [jobs],
  );

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const running = jobs.filter(
    (job) => job.status === 'running' || job.status === 'cancelling',
  ).length;
  const queued = jobs.filter((job) => job.status === 'queued' || job.status === 'paused').length;
  const completed = jobs.filter((job) => job.status === 'completed').length;
  const failed = jobs.filter((job) => job.status === 'failed').length;
  const attentionCount = running + queued + failed;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Jobs. ${running} running, ${queued} queued, ${failed} failed`}
          title="Jobs"
          className="relative"
        >
          <BriefcaseBusiness aria-hidden />
          {!compact && <span className="hidden min-[760px]:inline">Jobs</span>}
          {attentionCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
              {attentionCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(23rem,calc(100vw-1rem))] p-1">
        <DropdownMenuLabel className="flex items-center justify-between gap-3 px-2 py-2">
          <span>Jobs</span>
          <span className="font-normal text-muted-foreground">
            {running} running · {queued} queued · {completed} done · {failed} failed
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {visibleJobs.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            Processing and export jobs will appear here.
          </div>
        ) : (
          visibleJobs.map((job, index) => (
            <div key={job.id}>
              {index > 0 && <DropdownMenuSeparator />}
              <JobRow job={job} now={now} onOpenJob={onOpenJob} />
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
