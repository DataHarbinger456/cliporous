import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '@/store';
import type { ClipCandidate, StitchedClipCandidate } from './types';

const clip: ClipCandidate = {
  id: 'clip-1',
  sourceId: 'source-1',
  startTime: 10,
  endTime: 25,
  duration: 15,
  text: 'A useful clip',
  score: 90,
  hookText: 'Original hook',
  reasoning: 'Strong payoff',
  status: 'pending',
};

const stitchedClip: StitchedClipCandidate = {
  id: 'stitched-1',
  sourceId: 'source-1',
  sourceRanges: [
    { startTime: 30, endTime: 35, role: 'hook' },
    { startTime: 50, endTime: 60, role: 'main-payoff' },
  ],
  duration: 15,
  text: 'A stitched clip',
  score: 85,
  hookText: 'Stitched hook',
  reasoning: 'Complete arc',
  status: 'rejected',
};

beforeEach(() => {
  useStore.getState().reset();
  useStore.setState({
    clips: { 'source-1': [structuredClone(clip)] },
    stitchedClips: { 'source-1': [structuredClone(stitchedClip)] },
    activeSourceId: 'source-1',
    isDirty: false,
  });
});

describe('history slice', () => {
  it('undoes and redoes review decisions with specific feedback', () => {
    useStore.getState().updateClipStatus('source-1', 'clip-1', 'approved');

    expect(useStore.getState().clips['source-1']?.[0]?.status).toBe('approved');
    expect(useStore.getState()._undoStack.at(-1)?.action.label).toBe('approval');

    expect(useStore.getState().undo()).toEqual({ message: 'Approval undone' });
    expect(useStore.getState().clips['source-1']?.[0]?.status).toBe('pending');

    expect(useStore.getState().redo()).toEqual({ message: 'Approval restored' });
    expect(useStore.getState().clips['source-1']?.[0]?.status).toBe('approved');
  });

  it('routes inspector edits through per-clip history', () => {
    useStore.getState().updateClipHookText('source-1', 'clip-1', 'Sharper hook');

    expect(useStore.getState()._undoStack).toHaveLength(0);
    expect(useStore.getState().canUndoClip('clip-1')).toBe(true);
    expect(useStore.getState().undoClip('source-1', 'clip-1')).toEqual({
      message: 'Hook change undone',
    });
    expect(useStore.getState().clips['source-1']?.[0]?.hookText).toBe('Original hook');

    expect(useStore.getState().redoClip('source-1', 'clip-1')).toEqual({
      message: 'Hook change restored',
    });
    expect(useStore.getState().clips['source-1']?.[0]?.hookText).toBe('Sharper hook');
  });

  it('restores stitched review decisions through global history', () => {
    useStore.getState().updateStitchedClipStatus('source-1', 'stitched-1', 'approved');

    expect(useStore.getState().undo()).toEqual({ message: 'Rejection restored' });
    expect(useStore.getState().stitchedClips['source-1']?.[0]?.status).toBe('rejected');
  });

  it('restores undoable review settings with action-specific feedback', () => {
    useStore.setState((state) => ({
      settings: { ...state.settings, minScore: 50 },
      _undoStack: [],
      _redoStack: [],
      canUndo: false,
      canRedo: false,
    }));

    useStore.getState().setMinScore(82);

    expect(useStore.getState().settings.minScore).toBe(82);
    expect(useStore.getState()._undoStack.at(-1)?.action.label).toBe('minimum score');
    expect(useStore.getState().undo()).toEqual({ message: 'Minimum score restored' });
    expect(useStore.getState().settings.minScore).toBe(50);
  });
});
