import type { LongformEditPlan, WordTimestamp } from '@shared/types';
import { describe, expect, it } from 'vitest';
import {
  buildLongformPlanItems,
  buildLongformSections,
  compareLongformPlans,
  mergePreservedLongformItems,
  removeLongformPlanItem,
  updateLongformPlanItem,
} from './longform-plan';

const words: WordTimestamp[] = [
  { text: 'Build', start: 4, end: 4.4 },
  { text: 'trust', start: 4.5, end: 5 },
  { text: 'with', start: 5.1, end: 5.4 },
  { text: 'evidence', start: 5.5, end: 6.2 },
  { text: 'Then', start: 100, end: 100.4 },
  { text: 'show', start: 100.5, end: 100.9 },
  { text: 'the', start: 101, end: 101.2 },
  { text: 'result', start: 101.3, end: 102 },
];

function makePlan(): LongformEditPlan {
  return {
    phrases: [{ text: 'BUILD TRUST', startTime: 4, endTime: 5 }],
    blocks: [
      {
        kind: 'callout',
        startTime: 100,
        endTime: 105,
        kicker: 'THE RESULT',
        heading: 'Evidence wins',
        body: 'Show the result',
      },
    ],
    cards: [
      {
        kind: 'delos-scan-result',
        startTime: 12,
        endTime: 16,
        sourceText: 'Evidence from the source',
      },
    ],
    reasoning: 'Fixture plan',
    generatedAt: 1,
  };
}

describe('long-form Cut Plan helpers', () => {
  it('builds chronological evidence beats with transcript sources and editorial sections', () => {
    const plan = makePlan();
    const items = buildLongformPlanItems(plan, words);
    const sections = buildLongformSections(plan, words, 120);

    expect(items.map((item) => item.type)).toEqual(['phrase', 'card', 'block']);
    expect(items[0]?.sourceText).toContain('Build trust');
    expect(sections).toHaveLength(2);
    expect(sections[0]?.title).toBe('Opening');
    expect(sections[1]?.title).toBe('Evidence wins');
  });

  it('creates edited and removed plan snapshots without mutating the source version', () => {
    const plan = makePlan();
    const edited = updateLongformPlanItem(
      plan,
      { type: 'phrase', index: 0 },
      { title: 'PROVE IT', startTime: 6, endTime: 7 },
    );
    const removed = removeLongformPlanItem(edited, { type: 'card', index: 0 });

    expect(plan.phrases[0]?.text).toBe('BUILD TRUST');
    expect(edited.phrases[0]).toMatchObject({ text: 'PROVE IT', startTime: 6, endTime: 7 });
    expect(removed.cards).toEqual([]);
  });

  it('preserves creator-locked beats across regeneration and reports version differences', () => {
    const plan = makePlan();
    const regenerated: LongformEditPlan = {
      ...makePlan(),
      phrases: [{ text: 'NEW WORDING', startTime: 5, endTime: 6 }],
      cards: [],
      generatedAt: 2,
    };
    const merged = mergePreservedLongformItems(regenerated, [
      {
        key: 'phrase-lock',
        type: 'phrase',
        item: plan.phrases[0] as NonNullable<(typeof plan.phrases)[0]>,
      },
    ]);
    const diff = compareLongformPlans(plan, merged);

    expect(merged.phrases).toEqual(plan.phrases);
    expect(diff.removed).toBe(1);
    expect(diff.unchanged).toBeGreaterThanOrEqual(2);
  });
});
