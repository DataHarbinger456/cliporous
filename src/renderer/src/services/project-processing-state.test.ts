import type { CreatorJob } from '@shared/jobs';
import { PROJECT_SCHEMA_VERSION } from '@shared/project';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '@/store';
import { DEFAULT_PROJECT_WORKSPACE } from '@/store/workspace-slice';
import { restoreProject } from './project-service';

const JOB: CreatorJob = {
  id: 'process-job-1',
  kind: 'processing',
  projectId: 'project-1',
  projectName: 'Founder interview',
  projectFilePath: '/projects/founder.batchclip',
  sourceId: 'source-1',
  sourceName: 'founder.mp4',
  outputMode: 'short',
  status: 'running',
  stage: 'detecting-faces',
  progress: 68,
  message: 'Finding speakers and framing each scene',
  startedAt: 1_700_000_000_000,
  stageStartedAt: 1_700_000_010_000,
  updatedAt: 1_700_000_020_000,
  completedAt: null,
  completedStages: ['transcribing', 'scoring'],
  failedStage: 'detecting-faces',
  cachedSourcePath: '/cache/founder.mp4',
  activities: [
    {
      id: 'activity-1',
      stage: 'transcribing',
      text: '12,450 words transcribed',
      status: 'done',
      timestamp: 1_700_000_005_000,
    },
  ],
  results: [
    {
      stage: 'transcribing',
      label: 'Transcript',
      summary: '12,450 words transcribed',
      timestamp: 1_700_000_005_000,
    },
  ],
  outputPaths: [],
  failedItemIds: [],
  progressSamples: [{ at: 1_700_000_020_000, percent: 68 }],
};

beforeEach(() => {
  useStore.getState().reset();
  useStore.setState({ creatorJobs: [], currentProcessingJobId: null });
});

describe('durable processing checkpoint', () => {
  it('reopens interrupted work paused with artifacts and the last safe stage intact', () => {
    restoreProject(
      JSON.stringify({
        version: PROJECT_SCHEMA_VERSION,
        identity: {
          id: 'project-1',
          displayName: 'Founder interview',
          filePath: '/projects/founder.batchclip',
          createdAt: 1_700_000_000_000,
          modifiedAt: 1_700_000_020_000,
          schemaVersion: PROJECT_SCHEMA_VERSION,
        },
        sources: [
          {
            id: 'source-1',
            name: 'founder.mp4',
            path: '/videos/founder.mp4',
            duration: 2_400,
            width: 1920,
            height: 1080,
            origin: 'file',
          },
        ],
        transcriptions: {},
        clips: {},
        stitchedClips: {},
        longformPlans: {},
        settings: {},
        processingConfig: {},
        workspace: {
          ...DEFAULT_PROJECT_WORKSPACE,
          stage: 'detecting-faces',
          activeSourceId: 'source-1',
        },
        creativeBrief: {},
        processingState: {
          job: JOB,
          completedStages: ['transcribing', 'scoring'],
          cachedSourcePath: '/cache/founder.mp4',
        },
        renderState: { progress: [], startedAt: null, completedAt: null },
      }),
      '/projects/founder.batchclip',
    );

    const state = useStore.getState();
    expect(state.pipeline).toMatchObject({
      stage: 'error',
      message: 'Paused when BatchClip closed. Resume from the last safe checkpoint.',
      percent: 68,
    });
    expect(state.currentProcessingJobId).toBe(JOB.id);
    expect(state.creatorJobs[0]).toMatchObject({ id: JOB.id, status: 'paused' });
    expect(state.completedPipelineStages).toEqual(new Set(['transcribing', 'scoring']));
    expect(state.failedPipelineStage).toBe('detecting-faces');
    expect(state.cachedSourcePath).toBe('/cache/founder.mp4');
  });
});
