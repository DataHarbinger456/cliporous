import type { CreatorJob } from '@shared/jobs';
import type { OutputMode, PipelineStage } from '@/store/types';

const JOBS_STORAGE_KEY = 'batchclip-creator-jobs-v1';
const MAX_DURABLE_JOBS = 24;

const PROCESSING_STAGE_ORDER: readonly PipelineStage[] = [
  'downloading',
  'transcribing',
  'scoring',
  'stitching',
  'optimizing-loops',
  'detecting-faces',
  'ai-editing',
  'segmenting',
];

const ACTIVE_PROCESSING_STAGES = new Set<PipelineStage>(PROCESSING_STAGE_ORDER);

export function isActiveProcessingStage(stage: PipelineStage): boolean {
  return ACTIVE_PROCESSING_STAGES.has(stage);
}

export function getPipelineOverallPercent(
  stage: PipelineStage,
  stagePercent: number,
  outputMode: OutputMode,
  isYouTube: boolean,
): number {
  const stages: readonly PipelineStage[] =
    outputMode === 'longform'
      ? [...(isYouTube ? (['downloading'] as const) : []), 'transcribing', 'ai-editing']
      : [
          ...(isYouTube ? (['downloading'] as const) : []),
          'transcribing',
          'scoring',
          'stitching',
          'optimizing-loops',
          'detecting-faces',
          'segmenting',
        ];
  if (stage === 'ready' || stage === 'done') return 100;
  const index = stages.indexOf(stage);
  if (index < 0 || stages.length === 0) return Math.max(0, Math.min(100, stagePercent));
  const local = Math.max(0, Math.min(100, stagePercent)) / 100;
  return ((index + local) / stages.length) * 100;
}

export function formatJobDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0)
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

/** Returns null until at least three monotonic samples span eight seconds and five percent. */
export function estimateJobEtaSeconds(job: CreatorJob, now = Date.now()): number | null {
  const samples = job.progressSamples.filter(
    (sample) => sample.percent > 0 && sample.percent < 100,
  );
  if (samples.length < 3) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last) return null;
  const elapsedMs = last.at - first.at;
  const progressed = last.percent - first.percent;
  if (elapsedMs < 8_000 || progressed < 5 || last.percent >= 99) return null;
  if (now - last.at > 30_000) return null;
  const percentPerMs = progressed / elapsedMs;
  if (!Number.isFinite(percentPerMs) || percentPerMs <= 0) return null;
  return Math.max(1, Math.round((100 - last.percent) / percentPerMs / 1000));
}

function isCreatorJob(value: unknown): value is CreatorJob {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const job = value as Partial<CreatorJob>;
  return (
    typeof job.id === 'string' &&
    (job.kind === 'processing' || job.kind === 'render') &&
    typeof job.projectId === 'string' &&
    typeof job.projectName === 'string' &&
    typeof job.sourceName === 'string' &&
    typeof job.status === 'string' &&
    typeof job.stage === 'string' &&
    typeof job.progress === 'number' &&
    typeof job.startedAt === 'number' &&
    Array.isArray(job.activities) &&
    Array.isArray(job.results)
  );
}

export function loadCreatorJobs(): CreatorJob[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(JOBS_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCreatorJob).slice(0, MAX_DURABLE_JOBS);
  } catch {
    return [];
  }
}

export function persistCreatorJobs(jobs: readonly CreatorJob[]): void {
  try {
    localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs.slice(0, MAX_DURABLE_JOBS)));
  } catch {
    // A full or unavailable storage area must never interrupt active media work.
  }
}
