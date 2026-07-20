import type { CreatorJob } from '@shared/jobs';
import { describe, expect, it } from 'vitest';
import { estimateJobEtaSeconds, getPipelineOverallPercent } from './job-service';

function jobWithSamples(samples: CreatorJob['progressSamples']): CreatorJob {
  return {
    id: 'job-1',
    kind: 'processing',
    projectId: 'project-1',
    projectName: 'Interview cut',
    projectFilePath: null,
    sourceId: 'source-1',
    sourceName: 'interview.mp4',
    outputMode: 'short',
    status: 'running',
    stage: 'transcribing',
    progress: 20,
    message: '',
    startedAt: 0,
    stageStartedAt: 0,
    updatedAt: 0,
    completedAt: null,
    completedStages: [],
    failedStage: null,
    cachedSourcePath: null,
    activities: [],
    results: [],
    outputPaths: [],
    failedItemIds: [],
    progressSamples: samples,
  };
}

describe('honest job progress', () => {
  it('withholds ETA until samples span enough time and progress', () => {
    expect(
      estimateJobEtaSeconds(
        jobWithSamples([
          { at: 0, percent: 10 },
          { at: 2_000, percent: 12 },
          { at: 4_000, percent: 14 },
        ]),
        4_000,
      ),
    ).toBeNull();
  });

  it('estimates remaining time from a stable monotonic sample window', () => {
    expect(
      estimateJobEtaSeconds(
        jobWithSamples([
          { at: 0, percent: 10 },
          { at: 5_000, percent: 20 },
          { at: 10_000, percent: 30 },
        ]),
        10_000,
      ),
    ).toBe(35);
  });

  it('maps stage progress into non-regressing overall short-form progress', () => {
    const transcribing = getPipelineOverallPercent('transcribing', 90, 'short', false);
    const scoring = getPipelineOverallPercent('scoring', 10, 'short', false);
    expect(scoring).toBeGreaterThan(transcribing);
  });
});
