import type { AppState, ClipCandidate, PipelineStage, StitchedClipCandidate } from './types';

// ---------------------------------------------------------------------------
// Memoized selector: selectActiveClips
// ---------------------------------------------------------------------------
// Hand-rolled memoization that caches the sorted result and only re-computes
// when the underlying source clips array reference changes.
// Usage:  useStore(selectActiveClips)  — returns a stable array ref.
// ---------------------------------------------------------------------------

let _cachedInput: ClipCandidate[] | null = null;
let _cachedResult: ClipCandidate[] = [];

export function selectActiveClips(state: AppState): ClipCandidate[] {
  const { clips, activeSourceId } = state;
  if (!activeSourceId) {
    if (_cachedResult.length > 0) _cachedResult = [];
    return _cachedResult;
  }
  const sourceClips = clips[activeSourceId];
  if (!sourceClips || sourceClips.length === 0) {
    if (_cachedResult.length > 0) _cachedResult = [];
    return _cachedResult;
  }

  if (sourceClips === _cachedInput) return _cachedResult;

  _cachedInput = sourceClips;
  _cachedResult = [...sourceClips].sort((a, b) => b.score - a.score);
  return _cachedResult;
}

// ---------------------------------------------------------------------------
// Memoized selector: selectActiveStitchedClips
// ---------------------------------------------------------------------------

let _stitchedCachedInput: StitchedClipCandidate[] | null = null;
let _stitchedCachedResult: StitchedClipCandidate[] = [];

export function selectActiveStitchedClips(state: AppState): StitchedClipCandidate[] {
  const { stitchedClips, activeSourceId } = state;
  if (!activeSourceId) {
    if (_stitchedCachedResult.length > 0) _stitchedCachedResult = [];
    return _stitchedCachedResult;
  }
  const sourceClips = stitchedClips[activeSourceId];
  if (!sourceClips || sourceClips.length === 0) {
    if (_stitchedCachedResult.length > 0) _stitchedCachedResult = [];
    return _stitchedCachedResult;
  }

  if (sourceClips === _stitchedCachedInput) return _stitchedCachedResult;

  _stitchedCachedInput = sourceClips;
  _stitchedCachedResult = [...sourceClips].sort((a, b) => b.score - a.score);
  return _stitchedCachedResult;
}

// ---------------------------------------------------------------------------
// Screen routing — pipeline.stage → top-level screen identifier.
// Single source of truth. Mirrors `.ezcoder/plans/ux.md §6`.
// ---------------------------------------------------------------------------

export type ScreenName = 'drop' | 'processing' | 'clips' | 'cut-plan' | 'render';

/** Stages that map to ProcessingScreen — the long-running pipeline phases. */
export const PROCESSING_STAGES: ReadonlySet<PipelineStage> = new Set<PipelineStage>([
  'downloading',
  'transcribing',
  'scoring',
  'stitching',
  'optimizing-loops',
  'detecting-faces',
  'ai-editing',
  'segmenting',
]);

/**
 * Map a pipeline stage to the top-level screen the app should render.
 *
 * Rules (from ux.md §6):
 *   - idle                                    → drop
 *   - downloading…segmenting (PROCESSING)     → processing
 *   - ready                                   → clips or long-form Cut Plan
 *   - rendering | done                        → render
 *   - error                                   → stays on the screen that owns
 *     the failed stage. With an active source this is processing;
 *     without one it falls back to drop.
 */
export function selectScreen(
  stage: PipelineStage,
  hasActiveSource: boolean,
  isLongformOnly = false,
): ScreenName {
  if (PROCESSING_STAGES.has(stage)) return 'processing';
  if (stage === 'ready') {
    if (!hasActiveSource) return 'drop';
    return isLongformOnly ? 'cut-plan' : 'clips';
  }
  if (stage === 'rendering' || stage === 'done') return 'render';
  if (stage === 'error' && hasActiveSource) return 'processing';
  return 'drop';
}

/**
 * True when the active source owns a long-form plan and no short-form clips.
 * This routes the ready stage through explicit Cut Plan review before render.
 */
export function selectIsLongformOnly(state: AppState): boolean {
  const { activeSourceId, longformPlans, clips, stitchedClips } = state;
  if (!activeSourceId) return false;
  if (!longformPlans[activeSourceId]) return false;
  const hasClips = (clips[activeSourceId]?.length ?? 0) > 0;
  const hasStitched = (stitchedClips[activeSourceId]?.length ?? 0) > 0;
  return !hasClips && !hasStitched;
}

/** Convenience selector — derives the active screen from full app state. */
export function selectActiveScreen(state: AppState): ScreenName {
  return selectScreen(
    state.pipeline.stage,
    state.activeSourceId !== null,
    selectIsLongformOnly(state),
  );
}
