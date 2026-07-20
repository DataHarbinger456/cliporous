import type {
  LifecyclePrepareRequest,
  LifecyclePrepareResult,
  LifecycleSnapshot,
} from '@shared/app-lifecycle';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesktopLifecycle } from './useDesktopLifecycle';

const cleanSnapshot: LifecycleSnapshot = {
  windowKind: 'main',
  projectName: 'Launch Cut',
  projectDirty: false,
  settingsDirty: false,
  processingStage: null,
  rendering: false,
};

let prepareListener: ((request: LifecyclePrepareRequest) => void) | null = null;
const reportLifecycleState = vi.fn<(snapshot: LifecycleSnapshot) => Promise<void>>();
const completeLifecyclePreparation = vi.fn<(result: LifecyclePrepareResult) => Promise<void>>();
const unsubscribe = vi.fn();

beforeEach(() => {
  prepareListener = null;
  reportLifecycleState.mockReset().mockResolvedValue();
  completeLifecyclePreparation.mockReset().mockResolvedValue();
  unsubscribe.mockReset();

  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      reportLifecycleState,
      completeLifecyclePreparation,
      onLifecyclePrepare: (listener: (request: LifecyclePrepareRequest) => void) => {
        prepareListener = listener;
        return unsubscribe;
      },
      logToMain: vi.fn(),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDesktopLifecycle', () => {
  it('reports current risk and answers a live inspection', async () => {
    const getSnapshot = vi.fn(() => cleanSnapshot);
    const { unmount } = renderHook(() => useDesktopLifecycle({ getSnapshot }));

    await waitFor(() => expect(reportLifecycleState).toHaveBeenCalledWith(cleanSnapshot));
    expect(prepareListener).not.toBeNull();

    act(() => {
      prepareListener?.({ requestId: 'inspect-1', action: 'inspect' });
    });

    await waitFor(() =>
      expect(completeLifecyclePreparation).toHaveBeenCalledWith({
        requestId: 'inspect-1',
        ok: true,
        snapshot: cleanSnapshot,
      }),
    );

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('waits for a confirmed save before reporting completion', async () => {
    let resolveSave!: (saved: boolean) => void;
    const onSave = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve;
        }),
    );
    let snapshot = { ...cleanSnapshot, projectDirty: true };
    const getSnapshot = (): LifecycleSnapshot => snapshot;
    renderHook(() => useDesktopLifecycle({ getSnapshot, onSave }));

    act(() => {
      prepareListener?.({ requestId: 'save-1', action: 'save' });
    });
    expect(onSave).toHaveBeenCalledOnce();
    expect(completeLifecyclePreparation).not.toHaveBeenCalled();

    snapshot = cleanSnapshot;
    resolveSave(true);

    await waitFor(() =>
      expect(completeLifecyclePreparation).toHaveBeenCalledWith({
        requestId: 'save-1',
        ok: true,
        snapshot: cleanSnapshot,
      }),
    );
  });

  it('reports cancellation failures without claiming work settled', async () => {
    const activeSnapshot = { ...cleanSnapshot, processingStage: 'transcribing' };
    const onCancelWork = vi.fn().mockRejectedValue(new Error('Python process is still running'));
    renderHook(() => useDesktopLifecycle({ getSnapshot: () => activeSnapshot, onCancelWork }));

    act(() => {
      prepareListener?.({ requestId: 'cancel-1', action: 'cancel-work' });
    });

    await waitFor(() =>
      expect(completeLifecyclePreparation).toHaveBeenCalledWith({
        requestId: 'cancel-1',
        ok: false,
        snapshot: activeSnapshot,
        error: 'Python process is still running',
      }),
    );
  });
});
