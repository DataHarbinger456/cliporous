/**
 * selectors.test.ts
 *
 * Screen-routing unit tests: a restored long-form-only project (persisted
 * Gemini edit plan, no short-form clips) must route to explicit Cut Plan review
 * instead of bypassing approval or stranding the user on an empty clip grid.
 */

import { describe, expect, it } from 'vitest';
import type { LongformPlanRecord } from './longform-slice';
import { selectActiveScreen, selectIsLongformOnly, selectScreen } from './selectors';
import type { AppState, ClipCandidate, PipelineStage, StitchedClipCandidate } from './types';

/** A clip stand-in — the longform-only selectors only read array length. */
const clipStub = (id: string): ClipCandidate => ({ id }) as unknown as ClipCandidate;
const stitchedStub = (id: string): StitchedClipCandidate =>
  ({ id }) as unknown as StitchedClipCandidate;

const PLAN: LongformPlanRecord = {
  plan: { phrases: [], blocks: [], reasoning: 'test', generatedAt: 1 },
  skin: 'editorial',
  paletteId: 'brand',
};

/** Minimal AppState slice the longform-only selectors actually read. */
function makeState(over: Partial<AppState>): AppState {
  return {
    activeSourceId: null,
    longformPlans: {},
    clips: {},
    stitchedClips: {},
    pipeline: { stage: 'ready', message: '', percent: 100 },
    ...over,
  } as unknown as AppState;
}

describe('selectScreen — base routing', () => {
  const cases: Array<[PipelineStage, boolean, ReturnType<typeof selectScreen>]> = [
    ['idle', false, 'drop'],
    ['transcribing', true, 'processing'],
    ['ready', false, 'drop'],
    ['ready', true, 'clips'],
    ['rendering', true, 'render'],
    ['done', true, 'render'],
    ['error', true, 'processing'],
    ['error', false, 'drop'],
  ];
  it.each(cases)('stage=%s hasSource=%s → %s', (stage, hasSource, expected) => {
    expect(selectScreen(stage, hasSource)).toBe(expected);
  });
});

describe('selectScreen — long-form Cut Plan routing', () => {
  it('routes a ready long-form-only project to Cut Plan review', () => {
    expect(selectScreen('ready', true, true)).toBe('cut-plan');
  });

  it('still routes a clips project to clips when not long-form-only', () => {
    expect(selectScreen('ready', true, false)).toBe('clips');
  });

  it('long-form-only flag is irrelevant without an active source', () => {
    expect(selectScreen('ready', false, true)).toBe('drop');
  });
});

describe('selectIsLongformOnly', () => {
  it('is false with no active source', () => {
    expect(selectIsLongformOnly(makeState({ activeSourceId: null }))).toBe(false);
  });

  it('is false when the active source has no saved plan', () => {
    expect(selectIsLongformOnly(makeState({ activeSourceId: 'src-a', longformPlans: {} }))).toBe(
      false,
    );
  });

  it('is true when a saved plan exists and there are no short-form clips', () => {
    expect(
      selectIsLongformOnly(
        makeState({ activeSourceId: 'src-a', longformPlans: { 'src-a': PLAN } }),
      ),
    ).toBe(true);
  });

  it('is false when short-form clips exist alongside the plan', () => {
    expect(
      selectIsLongformOnly(
        makeState({
          activeSourceId: 'src-a',
          longformPlans: { 'src-a': PLAN },
          clips: { 'src-a': [clipStub('c1')] },
        }),
      ),
    ).toBe(false);
  });

  it('is false when stitched clips exist alongside the plan', () => {
    expect(
      selectIsLongformOnly(
        makeState({
          activeSourceId: 'src-a',
          longformPlans: { 'src-a': PLAN },
          stitchedClips: { 'src-a': [stitchedStub('s1')] },
        }),
      ),
    ).toBe(false);
  });
});

describe('selectActiveScreen — composed routing', () => {
  it('a restored long-form-only project lands on Cut Plan review', () => {
    const state = makeState({
      activeSourceId: 'src-a',
      longformPlans: { 'src-a': PLAN },
      pipeline: { stage: 'ready', message: '', percent: 100 },
    });
    expect(selectActiveScreen(state)).toBe('cut-plan');
  });

  it('a normal clips project still lands on clips', () => {
    const state = makeState({
      activeSourceId: 'src-a',
      longformPlans: {},
      clips: { 'src-a': [clipStub('c1')] },
      pipeline: { stage: 'ready', message: '', percent: 100 },
    });
    expect(selectActiveScreen(state)).toBe('clips');
  });
});
