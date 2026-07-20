import { MAX_CLIP_UNDO, MAX_UNDO } from '@shared/constants';
import type { StateCreator } from 'zustand';
import type { AppState, ClipCandidate, StitchedClipCandidate } from './types';

export interface HistoryAction {
  /** Short noun phrase used by buttons and native menu items. */
  label: string;
  /** Brief status announced after undo. */
  undoMessage: string;
  /** Brief status announced after redo. */
  redoMessage: string;
}

const DEFAULT_ACTION: HistoryAction = {
  label: 'clip change',
  undoMessage: 'Clip change undone',
  redoMessage: 'Clip change restored',
};

/** Subset of project state tracked by global undo/redo. */
export interface UndoableSnapshot {
  clips: Record<string, ClipCandidate[]>;
  stitchedClips: Record<string, StitchedClipCandidate[]>;
  minScore: number;
  action: HistoryAction;
}

export { MAX_CLIP_UNDO, MAX_UNDO };

export function _captureSnapshot(
  state: {
    clips: Record<string, ClipCandidate[]>;
    stitchedClips: Record<string, StitchedClipCandidate[]>;
    settings: { minScore: number };
  },
  action: HistoryAction = DEFAULT_ACTION,
): UndoableSnapshot {
  return {
    clips: structuredClone(state.clips),
    stitchedClips: structuredClone(state.stitchedClips),
    minScore: state.settings.minScore,
    action,
  };
}

/** A per-clip snapshot before one inspector edit. */
export interface ClipUndoEntry {
  clip: ClipCandidate | StitchedClipCandidate;
  action: HistoryAction;
}

export interface HistoryResult {
  message: string;
}

export interface HistorySlice {
  _undoStack: UndoableSnapshot[];
  _redoStack: UndoableSnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  undo: () => HistoryResult | null;
  redo: () => HistoryResult | null;

  _clipUndoStacks: Record<string, ClipUndoEntry[]>;
  _clipRedoStacks: Record<string, ClipUndoEntry[]>;
  _lastEditedClipId: string | null;
  _lastEditedSourceId: string | null;

  canUndoClip: (clipId: string) => boolean;
  canRedoClip: (clipId: string) => boolean;
  undoClip: (sourceId: string, clipId: string) => HistoryResult | null;
  redoClip: (sourceId: string, clipId: string) => HistoryResult | null;
  clearClipUndoHistory: (clipId: string) => void;
}

interface ClipReplacement {
  current: ClipCandidate | StitchedClipCandidate;
  clips: AppState['clips'];
  stitchedClips: AppState['stitchedClips'];
}

function buildClipReplacement(
  state: AppState,
  sourceId: string,
  clipId: string,
  snapshot: ClipCandidate | StitchedClipCandidate,
): ClipReplacement | null {
  if ('sourceRanges' in snapshot) {
    const sourceClips = state.stitchedClips[sourceId];
    const current = sourceClips?.find((clip) => clip.id === clipId);
    if (!sourceClips || !current) return null;
    return {
      current,
      clips: state.clips,
      stitchedClips: {
        ...state.stitchedClips,
        [sourceId]: sourceClips.map((clip) => (clip.id === clipId ? snapshot : clip)),
      },
    };
  }

  const sourceClips = state.clips[sourceId];
  const current = sourceClips?.find((clip) => clip.id === clipId);
  if (!sourceClips || !current) return null;
  return {
    current,
    clips: {
      ...state.clips,
      [sourceId]: sourceClips.map((clip) => (clip.id === clipId ? snapshot : clip)),
    },
    stitchedClips: state.stitchedClips,
  };
}

export const createHistorySlice: StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  HistorySlice
> = (set, get) => ({
  _undoStack: [],
  _redoStack: [],
  canUndo: false,
  canRedo: false,

  undo: () => {
    const state = get();
    const stack = [...state._undoStack];
    const snapshot = stack.pop();
    if (!snapshot) return null;
    const redoStack = [...state._redoStack, _captureSnapshot(state, snapshot.action)];
    set({
      _undoStack: stack,
      _redoStack: redoStack,
      clips: snapshot.clips,
      stitchedClips: snapshot.stitchedClips,
      settings: { ...state.settings, minScore: snapshot.minScore },
      canUndo: stack.length > 0,
      canRedo: true,
    });
    return { message: snapshot.action.undoMessage };
  },

  redo: () => {
    const state = get();
    const stack = [...state._redoStack];
    const snapshot = stack.pop();
    if (!snapshot) return null;
    const undoStack = [...state._undoStack, _captureSnapshot(state, snapshot.action)];
    set({
      _undoStack: undoStack,
      _redoStack: stack,
      clips: snapshot.clips,
      stitchedClips: snapshot.stitchedClips,
      settings: { ...state.settings, minScore: snapshot.minScore },
      canUndo: true,
      canRedo: stack.length > 0,
    });
    return { message: snapshot.action.redoMessage };
  },

  _clipUndoStacks: {},
  _clipRedoStacks: {},
  _lastEditedClipId: null,
  _lastEditedSourceId: null,

  canUndoClip: (clipId) => (get()._clipUndoStacks[clipId]?.length ?? 0) > 0,
  canRedoClip: (clipId) => (get()._clipRedoStacks[clipId]?.length ?? 0) > 0,

  undoClip: (sourceId, clipId) => {
    const state = get();
    const stack = [...(state._clipUndoStacks[clipId] ?? [])];
    const entry = stack.pop();
    if (!entry) return null;

    const replacement = buildClipReplacement(state, sourceId, clipId, entry.clip);
    if (!replacement) return null;
    const redoStack = [
      ...(state._clipRedoStacks[clipId] ?? []),
      { clip: structuredClone(replacement.current), action: entry.action },
    ];

    set({
      _clipUndoStacks: { ...state._clipUndoStacks, [clipId]: stack },
      _clipRedoStacks: { ...state._clipRedoStacks, [clipId]: redoStack },
      clips: replacement.clips,
      stitchedClips: replacement.stitchedClips,
    });
    return { message: entry.action.undoMessage };
  },

  redoClip: (sourceId, clipId) => {
    const state = get();
    const stack = [...(state._clipRedoStacks[clipId] ?? [])];
    const entry = stack.pop();
    if (!entry) return null;

    const replacement = buildClipReplacement(state, sourceId, clipId, entry.clip);
    if (!replacement) return null;
    const undoStack = [
      ...(state._clipUndoStacks[clipId] ?? []),
      { clip: structuredClone(replacement.current), action: entry.action },
    ];

    set({
      _clipUndoStacks: { ...state._clipUndoStacks, [clipId]: undoStack },
      _clipRedoStacks: { ...state._clipRedoStacks, [clipId]: stack },
      clips: replacement.clips,
      stitchedClips: replacement.stitchedClips,
    });
    return { message: entry.action.redoMessage };
  },

  clearClipUndoHistory: (clipId) => {
    const state = get();
    const undoStacks = { ...state._clipUndoStacks };
    const redoStacks = { ...state._clipRedoStacks };
    delete undoStacks[clipId];
    delete redoStacks[clipId];
    set({ _clipUndoStacks: undoStacks, _clipRedoStacks: redoStacks });
  },
});

type SetFn = (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void;

export function _pushUndo(
  state: AppState,
  set: SetFn,
  action: HistoryAction = DEFAULT_ACTION,
): void {
  const snapshot = _captureSnapshot(state, action);
  const undoStack = [...state._undoStack, snapshot];
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  set({
    _undoStack: undoStack,
    _redoStack: [],
    canUndo: true,
    canRedo: false,
  });
}

export function _pushClipUndo(
  sourceId: string,
  clipId: string,
  state: AppState,
  set: SetFn,
  action: HistoryAction = DEFAULT_ACTION,
): void {
  const clip =
    state.clips[sourceId]?.find((candidate) => candidate.id === clipId) ??
    state.stitchedClips[sourceId]?.find((candidate) => candidate.id === clipId);
  if (!clip) return;

  const stack = [...(state._clipUndoStacks[clipId] ?? []), { clip: structuredClone(clip), action }];
  if (stack.length > MAX_CLIP_UNDO) stack.shift();

  set({
    _clipUndoStacks: { ...state._clipUndoStacks, [clipId]: stack },
    _clipRedoStacks: { ...state._clipRedoStacks, [clipId]: [] },
    _lastEditedClipId: clipId,
    _lastEditedSourceId: sourceId,
  });
}

export function reviewDecisionAction(
  previous: ClipCandidate['status'],
  next: ClipCandidate['status'],
): HistoryAction {
  if (next === 'approved') {
    return {
      label: 'approval',
      undoMessage: previous === 'rejected' ? 'Rejection restored' : 'Approval undone',
      redoMessage: 'Approval restored',
    };
  }
  if (next === 'rejected') {
    return {
      label: 'rejection',
      undoMessage: previous === 'approved' ? 'Approval restored' : 'Rejection undone',
      redoMessage: 'Rejection restored',
    };
  }
  return {
    label: 'review decision',
    undoMessage: previous === 'approved' ? 'Approval restored' : 'Rejection restored',
    redoMessage: 'Returned to unreviewed',
  };
}
