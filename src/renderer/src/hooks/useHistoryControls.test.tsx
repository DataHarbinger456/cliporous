import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installApiStub, resetStore } from '@/components/__tests__/test-utils';
import { useStore } from '@/store';
import type { ClipCandidate } from '@/store/types';
import { useHistoryMenuSync } from './useHistoryControls';

function MenuSyncHarness(): null {
  useHistoryMenuSync();
  return null;
}

const clip: ClipCandidate = {
  id: 'clip-1',
  sourceId: 'source-1',
  startTime: 0,
  endTime: 12,
  duration: 12,
  text: 'Test clip',
  score: 88,
  hookText: 'Test hook',
  reasoning: 'Test reasoning',
  status: 'pending',
};

beforeEach(() => {
  resetStore();
});

afterEach(cleanup);

describe('useHistoryMenuSync', () => {
  it('keeps the native Edit menu aligned with global history', async () => {
    const api = installApiStub();
    render(<MenuSyncHarness />);

    await waitFor(() => {
      expect(api.setHistoryMenuState).toHaveBeenLastCalledWith({
        undoLabel: 'Undo',
        redoLabel: 'Redo',
        canUndo: false,
        canRedo: false,
      });
    });

    act(() => {
      useStore.setState({ clips: { 'source-1': [clip] } });
      useStore.getState().updateClipStatus('source-1', 'clip-1', 'approved');
    });

    await waitFor(() => {
      expect(api.setHistoryMenuState).toHaveBeenLastCalledWith({
        undoLabel: 'Undo approval',
        redoLabel: 'Redo',
        canUndo: true,
        canRedo: false,
      });
    });
  });
});
