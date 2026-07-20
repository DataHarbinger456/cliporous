import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installApiStub, resetStore } from '@/components/__tests__/test-utils';
import { useStore } from '@/store';
import type { SourceVideo } from '@/store/types';
import { useNativeJobIntegration } from './useNativeJobIntegration';

const SOURCE: SourceVideo = {
  id: 'source-1',
  path: '/videos/interview.mp4',
  name: 'interview.mp4',
  duration: 600,
  width: 1920,
  height: 1080,
  origin: 'file',
};

beforeEach(() => {
  resetStore();
});

afterEach(cleanup);

describe('native job integration', () => {
  it('mirrors progress and notifies when clips become ready', async () => {
    const api = installApiStub();
    renderHook(() => useNativeJobIntegration());

    act(() => {
      const state = useStore.getState();
      state.addSource(SOURCE);
      state.setActiveSource(SOURCE.id);
      state.startProcessingJob(SOURCE);
      state.setPipeline({ stage: 'transcribing', message: 'Building transcript', percent: 50 });
    });

    await waitFor(() => {
      expect(api.setNativeProgress).toHaveBeenCalledWith({
        progress: expect.any(Number),
        state: 'normal',
      });
    });

    act(() => {
      useStore.getState().setPipeline({
        stage: 'ready',
        message: 'Found 8 clip candidates',
        percent: 100,
      });
    });

    await waitFor(() => {
      expect(api.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Your selects are ready',
          body: 'Found 8 clip candidates',
          projectId: expect.any(String),
          kind: 'processing',
        }),
      );
    });
  });

  it('prevents sleep during rendering, restores it, and notifies with finished media', async () => {
    const api = installApiStub();
    renderHook(() => useNativeJobIntegration());

    act(() => {
      const state = useStore.getState();
      state.addSource(SOURCE);
      state.setActiveSource(SOURCE.id);
      state.setRenderProgress([
        {
          clipId: 'clip-1',
          kind: 'clip',
          label: 'Founder workflow',
          sourceId: SOURCE.id,
          percent: 0,
          status: 'queued',
          queuedAt: Date.now(),
        },
      ]);
      state.setIsRendering(true);
    });

    await waitFor(() => {
      expect(api.setPowerSaveActive).toHaveBeenCalledWith(true);
    });

    act(() => {
      const state = useStore.getState();
      const row = state.renderProgress[0];
      if (!row) throw new Error('Expected a queued render row');
      state.setRenderProgress([
        {
          ...row,
          percent: 100,
          status: 'done',
          outputPath: '/exports/founder-workflow.mp4',
          completedAt: Date.now(),
        },
      ]);
      state.setIsRendering(false);
    });

    await waitFor(() => {
      expect(api.setPowerSaveActive).toHaveBeenLastCalledWith(false);
      expect(api.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Export pack ready',
          body: '1 clip is ready to reveal.',
          kind: 'render',
        }),
      );
    });
  });
});
