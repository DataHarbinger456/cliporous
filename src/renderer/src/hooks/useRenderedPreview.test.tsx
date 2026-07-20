import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installApiStub } from '@/components/__tests__/test-utils';
import {
  clearAllRenderedPreviewCaches,
  type RenderPreviewConfig,
  useRenderedPreview,
} from '@/hooks/useRenderedPreview';

const CONFIG: RenderPreviewConfig = {
  sourceVideoPath: '/videos/source.mp4',
  startTime: 10,
  endTime: 30,
  hookTitleText: 'A useful hook',
};

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  installApiStub();
});

afterEach(() => {
  clearAllRenderedPreviewCaches();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useRenderedPreview', () => {
  it('debounces generation and serves an exact cache hit immediately', async () => {
    const renderPreview = vi.fn(async () => ({ previewPath: '/tmp/preview-a.mp4' }));
    installApiStub({ renderPreview });

    const first = renderHook(() =>
      useRenderedPreview({ clipId: 'clip-a', config: CONFIG, enabled: true }),
    );
    expect(first.result.current.state).toMatchObject({ status: 'preparing', phase: 'queued' });
    expect(renderPreview).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(first.result.current.state).toMatchObject({
      status: 'ready',
      previewPath: '/tmp/preview-a.mp4',
      cached: false,
    });
    first.unmount();

    const cached = renderHook(() =>
      useRenderedPreview({ clipId: 'clip-a', config: CONFIG, enabled: true }),
    );
    expect(cached.result.current.state).toMatchObject({
      status: 'ready',
      previewPath: '/tmp/preview-a.mp4',
      cached: true,
    });
    expect(renderPreview).toHaveBeenCalledTimes(1);
  });

  it('discards and cleans a stale result when edits change during rendering', async () => {
    const firstRequest = deferred<{ previewPath: string }>();
    const secondRequest = deferred<{ previewPath: string }>();
    const renderPreview = vi
      .fn()
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    const cleanupPreview = vi.fn(async () => undefined);
    installApiStub({ renderPreview, cleanupPreview });

    const hook = renderHook(
      ({ config }) => useRenderedPreview({ clipId: 'clip-a', config, enabled: true }),
      { initialProps: { config: CONFIG } },
    );
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    const updatedConfig = { ...CONFIG, hookTitleText: 'A revised hook' };
    hook.rerender({ config: updatedConfig });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(renderPreview).toHaveBeenCalledTimes(2);

    await act(async () => {
      firstRequest.resolve({ previewPath: '/tmp/stale.mp4' });
      await firstRequest.promise;
    });
    expect(cleanupPreview).toHaveBeenCalledWith('/tmp/stale.mp4');
    expect(hook.result.current.state).toMatchObject({ status: 'preparing', phase: 'rendering' });

    await act(async () => {
      secondRequest.resolve({ previewPath: '/tmp/current.mp4' });
      await secondRequest.promise;
    });
    expect(hook.result.current.state).toMatchObject({
      status: 'ready',
      previewPath: '/tmp/current.mp4',
    });
  });

  it('keeps failure recoverable and retries without changing the edit', async () => {
    const renderPreview = vi
      .fn()
      .mockRejectedValueOnce(new Error('Decoder unavailable'))
      .mockResolvedValueOnce({ previewPath: '/tmp/retry.mp4' });
    installApiStub({ renderPreview });

    const hook = renderHook(() =>
      useRenderedPreview({ clipId: 'clip-a', config: CONFIG, enabled: true }),
    );
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hook.result.current.state).toMatchObject({
      status: 'failed',
      error: 'Decoder unavailable',
    });

    act(() => hook.result.current.retry());
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(renderPreview).toHaveBeenCalledTimes(2);
    expect(hook.result.current.state).toMatchObject({
      status: 'ready',
      previewPath: '/tmp/retry.mp4',
    });
  });
});
