import type { CreatorJob, CreatorJobStatus } from '@shared/jobs';
import { useEffect, useRef } from 'react';
import {
  claimFirstExportCelebration,
  showCompletionCelebration,
} from '@/services/completion-celebrations';
import { playStudioSound } from '@/services/ui-sounds';
import { useStore } from '@/store';

function nativeProgressJob(jobs: readonly CreatorJob[]): CreatorJob | null {
  return (
    jobs.find((job) => job.status === 'running' || job.status === 'cancelling') ??
    jobs.find((job) => job.status === 'paused' || job.status === 'failed') ??
    null
  );
}

function notificationFor(job: CreatorJob): { title: string; body: string } | null {
  if (job.status === 'completed') {
    return job.kind === 'render'
      ? {
          title: 'Export pack ready',
          body:
            job.outputPaths.length > 0
              ? `${job.outputPaths.length} ${job.outputPaths.length === 1 ? 'clip is' : 'clips are'} ready to reveal.`
              : job.message,
        }
      : { title: 'Your selects are ready', body: job.message };
  }
  if (job.status === 'failed') {
    return {
      title: job.kind === 'render' ? 'Export needs attention' : 'Processing needs attention',
      body: job.message || 'Open BatchClip to review the preserved work and recovery action.',
    };
  }
  return null;
}

export function useNativeJobIntegration(): void {
  const jobs = useStore((state) => state.creatorJobs);
  const clips = useStore((state) => state.clips);
  const stitchedClips = useStore((state) => state.stitchedClips);
  const enableNotifications = useStore((state) => state.settings.enableNotifications);
  const renderProgress = useStore((state) => state.renderProgress);
  const isRendering = useStore((state) => state.isRendering);
  const renderCancellationStatus = useStore((state) => state.renderCancellation.status);
  const renderCompletedAt = useStore((state) => state.renderCompletedAt);
  const syncRenderJob = useStore((state) => state.syncRenderJob);
  const previousStatuses = useRef<Map<string, CreatorJobStatus> | null>(null);
  const previousDecisions = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    void isRendering;
    void renderCancellationStatus;
    void renderCompletedAt;
    void renderProgress;
    syncRenderJob();
  }, [isRendering, renderCancellationStatus, renderCompletedAt, renderProgress, syncRenderJob]);

  useEffect(() => {
    const job = nativeProgressJob(jobs);
    if (!job) {
      void window.api.setNativeProgress({ progress: null }).catch(() => {});
      return;
    }
    const state = job.status === 'failed' ? 'error' : job.status === 'paused' ? 'paused' : 'normal';
    void window.api
      .setNativeProgress({ progress: Math.max(0, Math.min(1, job.progress / 100)), state })
      .catch(() => {});
  }, [jobs]);

  useEffect(() => {
    const active = jobs.some((job) => job.status === 'running' || job.status === 'cancelling');
    void window.api.setPowerSaveActive(active).catch(() => {});
    return () => {
      void window.api.setPowerSaveActive(false).catch(() => {});
    };
  }, [jobs]);

  useEffect(() => {
    const currentStatuses = new Map(jobs.map((job) => [job.id, job.status] as const));
    if (previousStatuses.current === null) {
      previousStatuses.current = currentStatuses;
      return;
    }
    for (const job of jobs) {
      const previous = previousStatuses.current.get(job.id);
      if (!previous || previous === job.status) continue;

      if (job.status === 'completed') {
        if (job.kind === 'processing') {
          playStudioSound('job-ready');
        } else if (job.failedItemIds.length > 0) {
          playStudioSound('warning');
        } else {
          playStudioSound('batch-success');
          showCompletionCelebration(claimFirstExportCelebration() ? 'first-export' : 'clean-batch');
        }
      } else if (job.status === 'failed') {
        playStudioSound('failure');
      }

      if (!enableNotifications) continue;
      const content = notificationFor(job);
      if (!content) continue;
      void window.api
        .sendNotification({
          ...content,
          jobId: job.id,
          projectId: job.projectId,
          projectFilePath: job.projectFilePath,
          kind: job.kind,
        })
        .catch(() => {});
    }
    previousStatuses.current = currentStatuses;
  }, [enableNotifications, jobs]);

  useEffect(() => {
    const decisions = [...Object.values(clips).flat(), ...Object.values(stitchedClips).flat()];
    const currentDecisions = new Map(decisions.map((clip) => [clip.id, clip.status] as const));
    if (previousDecisions.current === null) {
      previousDecisions.current = currentDecisions;
      return;
    }
    const priorDecisions = previousDecisions.current;
    currentDecisions.forEach((status, clipId) => {
      if (priorDecisions.get(clipId) === status) return;
      if (status === 'approved') playStudioSound('approve');
      if (status === 'rejected') playStudioSound('reject');
    });
    previousDecisions.current = currentDecisions;
  }, [clips, stitchedClips]);
}
