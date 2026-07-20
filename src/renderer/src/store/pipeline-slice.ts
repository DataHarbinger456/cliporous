import type { CreatorActivityEntry, CreatorJob, CreatorStageResult } from '@shared/jobs';
import type { PythonSetupProgress, PythonSetupStatus } from '@shared/python-setup';
import type { StateCreator } from 'zustand';
import { getPipelineOverallPercent, loadCreatorJobs } from '@/services/job-service';
import type {
  AppState,
  CancellationState,
  PipelineProgress,
  PipelineStage,
  PythonSetupState,
  SourceVideo,
} from './types';

export interface PipelineSlice {
  pipeline: PipelineProgress;
  creatorJobs: CreatorJob[];
  currentProcessingJobId: string | null;
  processingCancellation: CancellationState;
  failedPipelineStage: PipelineStage | null;
  completedPipelineStages: Set<PipelineStage>;
  cachedSourcePath: string | null;
  pythonStatus: PythonSetupState;
  pythonSetupDetails: PythonSetupStatus | null;
  pythonSetupError: string | null;
  pythonSetupProgress: PythonSetupProgress | null;

  setPipeline: (progress: PipelineProgress) => void;
  startProcessingJob: (source: SourceVideo) => string;
  resumeProcessingJob: (jobId: string) => void;
  pauseProcessingJob: (failedStage: PipelineStage, message: string) => void;
  syncRenderJob: () => void;
  dismissCreatorJob: (jobId: string) => void;
  discardProcessingWork: (jobId: string) => void;
  setProcessingCancellation: (state: CancellationState) => void;
  setFailedPipelineStage: (stage: PipelineStage) => void;
  setCachedSourcePath: (path: string) => void;
  markStageCompleted: (stage: PipelineStage) => void;
  clearPipelineCache: () => void;
  setPythonStatus: (status: PythonSetupState) => void;
  setPythonSetupDetails: (details: PythonSetupStatus | null) => void;
  setPythonSetupError: (error: string | null) => void;
  setPythonSetupProgress: (progress: PythonSetupProgress | null) => void;
}

const DEFAULT_PIPELINE: PipelineProgress = { stage: 'idle', message: '', percent: 0 };
const MAX_ACTIVITY_ENTRIES = 30;
const MAX_RESULT_ENTRIES = 16;
const ACTIVE_STAGES = new Set<PipelineStage>([
  'downloading',
  'transcribing',
  'scoring',
  'stitching',
  'optimizing-loops',
  'detecting-faces',
  'ai-editing',
  'segmenting',
]);

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function creatorActivityText(stage: PipelineStage, message: string, percent: number): string {
  switch (stage) {
    case 'downloading':
      return `Downloading source${percent > 0 ? `, ${Math.round(percent)}%` : ''}`;
    case 'transcribing': {
      const chunk = message.match(/chunk\s+(\d+)\s*\/\s*(\d+)/i);
      if (chunk) return `Transcribing audio, chunk ${chunk[1]} of ${chunk[2]}`;
      if (/extract/i.test(message)) return 'Preparing source audio for transcription';
      return 'Turning the source audio into a transcript';
    }
    case 'scoring':
      return 'Reviewing the transcript for strong moments';
    case 'stitching':
      return 'Building connected stories from related moments';
    case 'optimizing-loops':
      return 'Tightening clip starts and endings';
    case 'detecting-faces':
      return 'Finding speakers and framing each scene';
    case 'ai-editing':
      return 'Designing the long-form edit';
    case 'segmenting':
      return 'Choosing pacing, captions, and visual style';
    default:
      return message || 'Preparing the source';
  }
}

function upsertActivity(
  job: CreatorJob,
  stage: string,
  text: string,
  status: CreatorActivityEntry['status'],
  detail?: string,
): void {
  const existing = [...job.activities]
    .reverse()
    .find((entry) => entry.stage === stage && entry.status === 'running');
  if (existing && status === 'running') {
    existing.text = text;
    if (detail === undefined) delete existing.detail;
    else existing.detail = detail;
    existing.timestamp = Date.now();
    return;
  }
  if (existing && status !== 'running') existing.status = status;
  job.activities.push({
    id: makeId('activity'),
    stage,
    text,
    ...(detail === undefined ? {} : { detail }),
    status,
    timestamp: Date.now(),
  });
  if (job.activities.length > MAX_ACTIVITY_ENTRIES) {
    job.activities = job.activities.slice(-MAX_ACTIVITY_ENTRIES);
  }
}

function upsertResult(job: CreatorJob, result: CreatorStageResult): void {
  job.results = [...job.results.filter((entry) => entry.stage !== result.stage), result].slice(
    -MAX_RESULT_ENTRIES,
  );
}

function summarizeStage(
  state: AppState,
  stage: PipelineStage,
  sourceId: string | null,
): CreatorStageResult | null {
  if (!sourceId) return null;
  const now = Date.now();
  const clips = state.clips[sourceId] ?? [];
  const stitched = state.stitchedClips[sourceId] ?? [];
  switch (stage) {
    case 'downloading':
      return state.cachedSourcePath
        ? {
            stage,
            label: 'Source',
            summary: 'Source cached for restart-safe reuse',
            timestamp: now,
          }
        : null;
    case 'transcribing': {
      const words = state.transcriptions[sourceId]?.words.length ?? 0;
      return words > 0
        ? {
            stage,
            label: 'Transcript',
            summary: `${words.toLocaleString()} words transcribed`,
            timestamp: now,
          }
        : null;
    }
    case 'scoring': {
      if (clips.length === 0) {
        return {
          stage,
          label: 'Moments',
          summary: 'No candidates passed the current score threshold',
          timestamp: now,
        };
      }
      const scores = clips.map((clip) => clip.score);
      return {
        stage,
        label: 'Moments',
        summary: `${clips.length} candidates scored ${Math.min(...scores)}–${Math.max(...scores)}`,
        timestamp: now,
      };
    }
    case 'stitching':
      return {
        stage,
        label: 'Stories',
        summary: `${stitched.length} stitched ${stitched.length === 1 ? 'story' : 'stories'} built`,
        timestamp: now,
      };
    case 'optimizing-loops': {
      const secondsSaved = clips.reduce((total, clip) => {
        const originalDuration =
          typeof clip.aiStartTime === 'number' && typeof clip.aiEndTime === 'number'
            ? Math.max(0, clip.aiEndTime - clip.aiStartTime)
            : clip.duration;
        return total + Math.max(0, originalDuration - clip.duration) + (clip.fillerTimeSaved ?? 0);
      }, 0);
      return {
        stage,
        label: 'Timing',
        summary:
          secondsSaved > 0
            ? `${secondsSaved.toFixed(secondsSaved >= 10 ? 0 : 1)}s removed across ${clips.length} clips`
            : `Checked ${clips.length} clips; no timing cuts applied`,
        timestamp: now,
      };
    }
    case 'detecting-faces': {
      const coveredRegular = clips.filter((clip) =>
        Boolean(clip.cropRegion || clip.cropTimeline?.length || clip.faceTimeline?.length),
      ).length;
      const coveredStitched = stitched.filter((clip) =>
        Boolean(clip.cropRegion || clip.rangeCropRects?.length),
      ).length;
      return {
        stage,
        label: 'Faces',
        summary: `${coveredRegular + coveredStitched} of ${clips.length + stitched.length} clips have speaker-aware framing`,
        timestamp: now,
      };
    }
    case 'ai-editing': {
      const plan = state.longformPlans[sourceId]?.plan;
      if (!plan) return null;
      return {
        stage,
        label: 'Edit plan',
        summary: `${plan.phrases.length} phrase moments and ${plan.blocks.length} visual blocks planned`,
        timestamp: now,
      };
    }
    case 'segmenting': {
      const decisions = [...clips, ...stitched].reduce(
        (total, clip) => total + (clip.segments?.length ?? 0),
        0,
      );
      return {
        stage,
        label: 'Styling',
        summary: `${decisions} style decisions across ${clips.length + stitched.length} clips`,
        timestamp: now,
      };
    }
    default:
      return null;
  }
}

export const createPipelineSlice: StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  PipelineSlice
> = (set) => ({
  pipeline: { ...DEFAULT_PIPELINE },
  creatorJobs: loadCreatorJobs(),
  currentProcessingJobId: null,
  processingCancellation: { status: 'idle', error: null },
  failedPipelineStage: null,
  completedPipelineStages: new Set<PipelineStage>(),
  cachedSourcePath: null,
  pythonStatus: 'checking',
  pythonSetupDetails: null,
  pythonSetupError: null,
  pythonSetupProgress: null,

  setPipeline: (progress) =>
    set((state) => {
      const previousStage = state.pipeline.stage;
      state.pipeline = progress;
      state.workspace.stage = progress.stage;
      const job = state.creatorJobs.find((entry) => entry.id === state.currentProcessingJobId);
      if (!job) return;
      const now = Date.now();
      job.updatedAt = now;
      job.message = progress.message;

      if (ACTIVE_STAGES.has(progress.stage)) {
        if (job.stage !== progress.stage) {
          for (const activity of job.activities) {
            if (activity.status === 'running' && activity.stage !== progress.stage) {
              activity.status = 'done';
            }
          }
          job.stage = progress.stage;
          job.stageStartedAt = now;
          job.progressSamples = [];
        }
        job.status = 'running';
        const source = state.sources.find((entry) => entry.id === job.sourceId);
        job.progress = getPipelineOverallPercent(
          progress.stage,
          progress.percent,
          job.outputMode,
          source?.origin === 'youtube',
        );
        const stagePercent = Math.max(0, Math.min(100, progress.percent));
        const lastSample = job.progressSamples[job.progressSamples.length - 1];
        if (
          !lastSample ||
          (stagePercent >= lastSample.percent && stagePercent !== lastSample.percent)
        ) {
          job.progressSamples.push({ at: now, percent: stagePercent });
          job.progressSamples = job.progressSamples.slice(-8);
        }
        upsertActivity(
          job,
          progress.stage,
          creatorActivityText(progress.stage, progress.message, progress.percent),
          'running',
        );
        return;
      }

      if (progress.stage === 'ready') {
        job.status = 'completed';
        job.stage = 'ready';
        job.progress = 100;
        job.completedAt = now;
        upsertActivity(job, 'ready', progress.message || 'Clips are ready to review', 'done');
      } else if (progress.stage === 'error' && job.status !== 'paused') {
        job.status = 'failed';
        job.failedStage =
          state.failedPipelineStage ?? (ACTIVE_STAGES.has(previousStage) ? previousStage : null);
        upsertActivity(
          job,
          job.failedStage ?? 'error',
          'Processing needs attention',
          'error',
          progress.message,
        );
      } else if (
        progress.stage === 'rendering' &&
        job.kind === 'processing' &&
        job.status === 'running'
      ) {
        job.status = 'completed';
        job.stage = 'ready';
        job.progress = 100;
        job.completedAt = now;
        upsertActivity(job, 'ready', 'Edit plan complete; render started', 'done');
      }
    }),

  startProcessingJob: (source) => {
    const id = makeId('process');
    set((state) => {
      const now = Date.now();
      const job: CreatorJob = {
        id,
        kind: 'processing',
        projectId: state.currentProject.id,
        projectName: state.currentProject.displayName,
        projectFilePath: state.currentProject.filePath,
        sourceId: source.id,
        sourceName: source.name,
        outputMode: state.settings.outputMode,
        status: 'queued',
        stage: 'idle',
        progress: 0,
        message: 'Preparing source',
        startedAt: now,
        stageStartedAt: now,
        updatedAt: now,
        completedAt: null,
        completedStages: [],
        failedStage: null,
        cachedSourcePath: null,
        activities: [
          {
            id: makeId('activity'),
            stage: 'idle',
            text: 'Preparing the selected source',
            status: 'running',
            timestamp: now,
          },
        ],
        results: [],
        outputPaths: [],
        failedItemIds: [],
        progressSamples: [],
      };
      state.creatorJobs = [job, ...state.creatorJobs.filter((entry) => entry.id !== id)].slice(
        0,
        24,
      );
      state.currentProcessingJobId = id;
    });
    return id;
  },

  resumeProcessingJob: (jobId) =>
    set((state) => {
      const job = state.creatorJobs.find((entry) => entry.id === jobId);
      if (!job || job.kind !== 'processing') return;
      const now = Date.now();
      job.status = 'running';
      job.completedAt = null;
      job.updatedAt = now;
      job.stageStartedAt = now;
      job.progressSamples = [];
      state.currentProcessingJobId = job.id;
      upsertActivity(
        job,
        job.failedStage ?? job.stage,
        'Resuming from the last safe checkpoint',
        'running',
      );
    }),

  pauseProcessingJob: (failedStage, message) =>
    set((state) => {
      const job = state.creatorJobs.find((entry) => entry.id === state.currentProcessingJobId);
      if (!job) return;
      job.status = 'paused';
      job.failedStage = failedStage;
      job.stage = failedStage;
      job.message = message;
      job.updatedAt = Date.now();
      job.completedStages = Array.from(state.completedPipelineStages);
      job.cachedSourcePath = state.cachedSourcePath;
      upsertActivity(job, failedStage, 'Stopped safely; completed work is kept', 'done', message);
    }),

  syncRenderJob: () =>
    set((state) => {
      if (!state.renderStartedAt || state.renderProgress.length === 0) return;
      const id = `render-${state.currentProject.id}-${state.renderStartedAt}`;
      const now = Date.now();
      let job = state.creatorJobs.find((entry) => entry.id === id);
      const source = state.sources.find((entry) => entry.id === state.activeSourceId) ?? null;
      if (!job) {
        job = {
          id,
          kind: 'render',
          projectId: state.currentProject.id,
          projectName: state.currentProject.displayName,
          projectFilePath: state.currentProject.filePath,
          sourceId: source?.id ?? null,
          sourceName: source?.name ?? 'Current project',
          outputMode: state.settings.outputMode,
          status: state.isRendering ? 'running' : 'queued',
          stage: 'rendering',
          progress: 0,
          message: 'Preparing exports',
          startedAt: state.renderStartedAt,
          stageStartedAt: state.renderStartedAt,
          updatedAt: now,
          completedAt: null,
          completedStages: [],
          failedStage: null,
          cachedSourcePath: null,
          activities: [],
          results: [],
          outputPaths: [],
          failedItemIds: [],
          progressSamples: [],
        };
        state.creatorJobs.unshift(job);
        state.creatorJobs = state.creatorJobs.slice(0, 24);
      }
      const rows = state.renderProgress;
      job.progress = rows.reduce((total, row) => total + row.percent, 0) / Math.max(1, rows.length);
      job.outputPaths = rows.flatMap((row) => (row.outputPath ? [row.outputPath] : []));
      job.failedItemIds = rows.filter((row) => row.status === 'error').map((row) => row.clipId);
      job.updatedAt = now;
      const doneCount = rows.filter((row) => row.status === 'done').length;
      const queuedCount = rows.filter((row) => row.status === 'queued').length;
      const cancelledCount = rows.filter((row) => row.status === 'cancelled').length;
      const failedCount = job.failedItemIds.length;
      if (state.isRendering) {
        job.status = state.renderCancellation.status === 'cancelling' ? 'cancelling' : 'running';
        job.message = `${doneCount} of ${rows.length} exports complete`;
        upsertActivity(
          job,
          'rendering',
          `Rendering ${Math.min(rows.length, doneCount + 1)} of ${rows.length} exports`,
          'running',
        );
      } else if (failedCount > 0) {
        job.status = 'failed';
        job.failedStage = 'rendering';
        job.completedAt = state.renderCompletedAt ?? now;
        job.message = `${doneCount} completed, ${failedCount} failed`;
        upsertActivity(
          job,
          'rendering',
          `${doneCount} exports completed; ${failedCount} need attention`,
          'error',
        );
      } else if (queuedCount > 0 && doneCount > 0) {
        job.status = 'paused';
        job.completedAt = null;
        job.message = `${doneCount} complete, ${queuedCount} kept in queue`;
        upsertActivity(
          job,
          'rendering',
          'Queue stopped safely; remaining exports are kept',
          'done',
        );
      } else if (rows.every((row) => row.status === 'done' || row.status === 'cancelled')) {
        job.status = doneCount > 0 ? 'completed' : 'cancelled';
        job.progress = 100;
        job.completedAt = state.renderCompletedAt ?? now;
        job.message =
          cancelledCount > 0
            ? `${doneCount} ready, ${cancelledCount} cancelled`
            : `${doneCount} exports complete`;
        upsertActivity(job, 'rendering', `${doneCount} exports are ready`, 'done');
      }
    }),

  dismissCreatorJob: (jobId) =>
    set((state) => {
      const job = state.creatorJobs.find((entry) => entry.id === jobId);
      if (!job || job.status === 'running' || job.status === 'cancelling') return;
      state.creatorJobs = state.creatorJobs.filter((entry) => entry.id !== jobId);
      if (state.currentProcessingJobId === jobId) state.currentProcessingJobId = null;
    }),

  discardProcessingWork: (jobId) =>
    set((state) => {
      const job = state.creatorJobs.find((entry) => entry.id === jobId);
      if (!job || job.kind !== 'processing' || !job.sourceId) return;
      const sourceId = job.sourceId;
      delete state.transcriptions[sourceId];
      delete state.clips[sourceId];
      delete state.stitchedClips[sourceId];
      delete state.longformPlans[sourceId];
      job.status = 'cancelled';
      job.completedAt = Date.now();
      job.updatedAt = Date.now();
      job.message = 'Cached processing work discarded';
      upsertActivity(job, job.stage, 'Started over and discarded cached processing work', 'done');
      state.currentProcessingJobId = null;
      state.failedPipelineStage = null;
      state.completedPipelineStages = new Set<PipelineStage>();
      state.cachedSourcePath = null;
      state.pipeline = { ...DEFAULT_PIPELINE };
      state.workspace.stage = 'idle';
    }),

  setProcessingCancellation: (processingCancellation) => set({ processingCancellation }),

  setFailedPipelineStage: (stage) =>
    set((state) => {
      const completed = new Set(state.completedPipelineStages);
      const stageOrder: PipelineStage[] = [
        'downloading',
        'transcribing',
        'scoring',
        'stitching',
        'optimizing-loops',
        'detecting-faces',
        'ai-editing',
        'segmenting',
      ];
      const failedIdx = stageOrder.indexOf(stage);
      for (const candidate of stageOrder) {
        if (stageOrder.indexOf(candidate) < failedIdx) completed.add(candidate);
      }
      state.failedPipelineStage = stage;
      state.completedPipelineStages = completed;
      const job = state.creatorJobs.find((entry) => entry.id === state.currentProcessingJobId);
      if (job) {
        job.failedStage = stage;
        job.completedStages = Array.from(completed);
      }
    }),

  setCachedSourcePath: (path) =>
    set((state) => {
      state.cachedSourcePath = path;
      const job = state.creatorJobs.find((entry) => entry.id === state.currentProcessingJobId);
      if (job) job.cachedSourcePath = path;
    }),

  markStageCompleted: (stage) =>
    set((state) => {
      state.completedPipelineStages.add(stage);
      const job = state.creatorJobs.find((entry) => entry.id === state.currentProcessingJobId);
      if (!job) return;
      if (!job.completedStages.includes(stage)) job.completedStages.push(stage);
      const result = summarizeStage(state as AppState, stage, job.sourceId);
      if (result) {
        upsertResult(job, result);
        upsertActivity(job, stage, result.summary, 'done');
      } else {
        upsertActivity(job, stage, `${creatorActivityText(stage, '', 100)} complete`, 'done');
      }
      job.updatedAt = Date.now();
    }),

  clearPipelineCache: () =>
    set((state) => {
      state.failedPipelineStage = null;
      state.completedPipelineStages = new Set<PipelineStage>();
      state.cachedSourcePath = null;
      state.currentProcessingJobId = null;
    }),

  setPythonStatus: (status) => set({ pythonStatus: status }),
  setPythonSetupDetails: (details) => set({ pythonSetupDetails: details }),
  setPythonSetupError: (error) => set({ pythonSetupError: error }),
  setPythonSetupProgress: (progress) => set({ pythonSetupProgress: progress }),
});
