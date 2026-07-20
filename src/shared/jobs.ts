export type CreatorJobKind = 'processing' | 'render';

export type CreatorJobStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelling'
  | 'cancelled';

export interface JobProgressSample {
  at: number;
  percent: number;
}

export interface CreatorActivityEntry {
  id: string;
  stage: string;
  text: string;
  detail?: string;
  status: 'running' | 'done' | 'error';
  timestamp: number;
}

export interface CreatorStageResult {
  stage: string;
  label: string;
  summary: string;
  timestamp: number;
}

/** Durable creator-facing work record. It deliberately contains no engine or tool names. */
export interface CreatorJob {
  id: string;
  kind: CreatorJobKind;
  projectId: string;
  projectName: string;
  projectFilePath: string | null;
  sourceId: string | null;
  sourceName: string;
  outputMode: 'short' | 'longform';
  status: CreatorJobStatus;
  stage: string;
  progress: number;
  message: string;
  startedAt: number;
  stageStartedAt: number;
  updatedAt: number;
  completedAt: number | null;
  completedStages: string[];
  failedStage: string | null;
  cachedSourcePath: string | null;
  activities: CreatorActivityEntry[];
  results: CreatorStageResult[];
  outputPaths: string[];
  failedItemIds: string[];
  progressSamples: JobProgressSample[];
}

export interface NativeJobProgress {
  progress: number | null;
  state?: 'normal' | 'paused' | 'error';
}

export interface NativeNotificationOptions {
  title: string;
  body: string;
  silent?: boolean;
  jobId?: string;
  projectId?: string;
  projectFilePath?: string | null;
  kind?: CreatorJobKind;
}

export interface NativeNotificationClick {
  jobId?: string;
  projectId?: string;
  projectFilePath?: string | null;
  kind?: CreatorJobKind;
}
