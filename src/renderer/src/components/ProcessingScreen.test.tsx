import { createStructuredError } from '@shared/errors';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '@/store';
import type { SourceVideo } from '@/store/types';
import { installApiStub, resetStore } from './__tests__/test-utils';

const pipelineMocks = vi.hoisted(() => ({
  cancelProcessing: vi.fn<() => Promise<boolean>>(),
  processVideo: vi.fn(),
}));

vi.mock('@/hooks', () => ({
  usePipeline: () => ({
    cancelProcessing: pipelineMocks.cancelProcessing,
    processVideo: pipelineMocks.processVideo,
    isProcessing: () => true,
  }),
}));

const SOURCE: SourceVideo = {
  id: 'source-1',
  name: 'interview.mp4',
  path: '/videos/interview.mp4',
  duration: 600,
  width: 1920,
  height: 1080,
  thumbnail: 'data:image/png;base64,poster',
  origin: 'file',
};

beforeEach(() => {
  resetStore();
  installApiStub({ getWaveform: vi.fn(() => new Promise<number[]>(() => {})) });
  pipelineMocks.cancelProcessing.mockReset();
  const state = useStore.getState();
  state.addSource(SOURCE);
  state.setActiveSource(SOURCE.id);
  state.startProcessingJob(SOURCE);
  state.setCachedSourcePath('/cache/interview.mp4');
  state.markStageCompleted('downloading');
  state.setPipeline({ stage: 'transcribing', message: 'Transcribing source', percent: 42 });
});

afterEach(cleanup);

describe('ProcessingScreen cancellation', () => {
  it('keeps work visible and says Cancelling until processing settles', async () => {
    let settle!: (value: boolean) => void;
    pipelineMocks.cancelProcessing.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          settle = resolve;
          useStore.getState().setProcessingCancellation({ status: 'cancelling', error: null });
        }),
    );

    const { ProcessingScreen } = await import('./ProcessingScreen');
    render(<ProcessingScreen />);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Stop and keep progress' })[0] as HTMLElement,
    );

    expect(screen.getAllByRole('button', { name: 'Stopping…' })[0]).toBeDisabled();
    expect(
      screen.getByRole('img', { name: 'Poster frame from interview.mp4' }),
    ).toBeInTheDocument();
    expect(useStore.getState().activeSourceId).toBe(SOURCE.id);

    await act(async () => {
      useStore.getState().setProcessingCancellation({ status: 'idle', error: null });
      settle(true);
    });

    expect(useStore.getState().activeSourceId).toBe(SOURCE.id);
    expect(useStore.getState().cachedSourcePath).toBe('/cache/interview.mp4');
    expect(useStore.getState().completedPipelineStages.has('downloading')).toBe(true);
  });

  it('states that work is still running and allows cancellation retry', async () => {
    const error = createStructuredError({
      source: 'pipeline',
      message: 'Processing did not confirm cancellation within 25 seconds.',
      headline: "BatchClip couldn't stop processing yet",
      whatHappened: 'The current content operation is still running.',
      whatIsSafe: 'Completed clips and cached transcription have been kept.',
      whatToDoNext: 'Try cancelling again. Keep BatchClip open until processing stops.',
      failedStage: 'transcribing',
    });
    pipelineMocks.cancelProcessing.mockImplementation(async () => {
      useStore.getState().setProcessingCancellation({ status: 'failed', error });
      return false;
    });

    const { ProcessingScreen } = await import('./ProcessingScreen');
    render(<ProcessingScreen />);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Stop and keep progress' })[0] as HTMLElement,
    );

    expect(await screen.findByText("BatchClip couldn't stop processing yet")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry stop' })).toBeEnabled();
    expect(useStore.getState().activeSourceId).toBe(SOURCE.id);
  });

  it('keeps source context, live progress, and Cancel together at the 900×640 window contract', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 640 });

    const { ProcessingScreen } = await import('./ProcessingScreen');
    render(<ProcessingScreen />);

    const orientationHeading = screen.getByRole('heading', { name: 'Building your selects' });
    const adaptiveCard = orientationHeading.closest('.grid');
    expect(adaptiveCard).toHaveClass(
      'min-[820px]:grid-cols-[minmax(240px,0.72fr)_minmax(0,1.45fr)]',
    );
    expect(screen.getByText('Overall progress')).toBeInTheDocument();
    expect(screen.getByText('Transcribing source')).toBeInTheDocument();
    expect(
      screen.getAllByText('Turning the source audio into a transcript').length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: 'Stop and keep progress' }).length,
    ).toBeGreaterThan(0);
  });
});
