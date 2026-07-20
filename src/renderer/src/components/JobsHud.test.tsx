import type { CreatorJob } from '@shared/jobs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '@/store';
import { installApiStub, resetStore } from './__tests__/test-utils';

vi.mock('@/hooks/usePipeline', () => ({
  stopActiveProcessingAndKeepProgress: vi.fn(async () => true),
  usePipeline: () => ({ processVideo: vi.fn(), cancelProcessing: vi.fn(), isProcessing: vi.fn() }),
}));

const JOB: CreatorJob = {
  id: 'job-1',
  kind: 'processing',
  projectId: 'project-1',
  projectName: 'Founder interview',
  projectFilePath: '/projects/founder.batchclip',
  sourceId: 'source-1',
  sourceName: 'founder.mp4',
  outputMode: 'short',
  status: 'running',
  stage: 'transcribing',
  progress: 27,
  message: 'Turning the source audio into a transcript',
  startedAt: Date.now() - 42_000,
  stageStartedAt: Date.now() - 12_000,
  updatedAt: Date.now(),
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

beforeEach(() => {
  resetStore();
  installApiStub();
  useStore.setState({ creatorJobs: [JOB] });
});

afterEach(cleanup);

describe('JobsHud', () => {
  it('keeps live counts, progress, open, and stop available from the global header control', async () => {
    const onOpenJob = vi.fn();
    const { JobsHud } = await import('./JobsHud');
    render(<JobsHud onOpenJob={onOpenJob} />);

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Jobs. 1 running, 0 queued, 0 failed' }),
      { button: 0, ctrlKey: false },
    );

    expect(await screen.findByText('27%')).toBeInTheDocument();
    expect(screen.getByText('Turning the source audio into a transcript')).toBeInTheDocument();
    expect(screen.getByText('1 running · 0 queued · 0 done · 0 failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open' }));
    expect(onOpenJob).toHaveBeenCalledWith(expect.objectContaining({ id: JOB.id }));
  });
});
