// ---------------------------------------------------------------------------
// Delos pop-up card layer tests.
//
//   1. filterCardsToSpeakerRanges rejects any card that intersects a full-frame
//      block (i.e. is not fully contained by a speaker range) and keeps cards
//      that sit entirely within speaker time.
//   2. planDelosCards spaces cards ~one per 15–20s and biases toward
//      text-forward kinds with no immediate same-kind repeats.
// ---------------------------------------------------------------------------

import type { DelosCardPlacement, WordTimestamp } from '@shared/types';
import { describe, expect, it } from 'vitest';
import {
  CARD_DISPLAY_SECONDS,
  planDelosCards,
  SECONDS_PER_CARD,
  selectCardKind,
} from '../../ai/longform-edit-plan';
import { filterCardsToSpeakerRanges, type SpeakerRange } from './delos-card.feature';

// WordTimestamp from point-coverage and the shared type are structurally equal;
// the import path here is only for the helper builders below.
type Word = WordTimestamp;

function card(
  kind: DelosCardPlacement['kind'],
  startTime: number,
  endTime: number,
): DelosCardPlacement {
  return { kind, startTime, endTime };
}

/** Synthesize one word per second across [0, count) with the given text. */
function words(count: number, text = 'value'): Word[] {
  return Array.from({ length: count }, (_, i) => ({ text, start: i, end: i + 0.9 }));
}

describe('filterCardsToSpeakerRanges', () => {
  // A timeline with a full-frame block over [20, 25]: speaker fills the rest.
  const speakerRanges: SpeakerRange[] = [
    { start: 0, end: 20 },
    { start: 25, end: 60 },
  ];

  it('keeps a card fully inside a single speaker range', () => {
    const kept = filterCardsToSpeakerRanges([card('delos-console', 5, 10)], speakerRanges);
    expect(kept).toHaveLength(1);
  });

  it('rejects a card that starts inside a full-frame block', () => {
    // [22, 27] starts in the [20,25] block gap — not contained by any range.
    const kept = filterCardsToSpeakerRanges([card('delos-alert', 22, 27)], speakerRanges);
    expect(kept).toHaveLength(0);
  });

  it('rejects a card that straddles a block boundary', () => {
    // [18, 23] crosses from speaker into the block — not fully contained.
    const kept = filterCardsToSpeakerRanges([card('delos-scan-result', 18, 23)], speakerRanges);
    expect(kept).toHaveLength(0);
  });

  it('rejects a card spanning across a block between two speaker ranges', () => {
    // [10, 30] covers the block entirely — no single range contains it.
    const kept = filterCardsToSpeakerRanges([card('delos-console', 10, 30)], speakerRanges);
    expect(kept).toHaveLength(0);
  });

  it('rejects zero/negative-length cards', () => {
    const kept = filterCardsToSpeakerRanges([card('delos-console', 5, 5)], speakerRanges);
    expect(kept).toHaveLength(0);
  });

  it('partitions a mixed batch into only the contained cards', () => {
    const batch = [
      card('delos-console', 2, 7), // inside [0,20] ✓
      card('delos-alert', 21, 24), // inside block ✗
      card('delos-scan-result', 30, 35), // inside [25,60] ✓
      card('delos-system-diagnostics', 58, 62), // overruns end ✗
    ];
    const kept = filterCardsToSpeakerRanges(batch, speakerRanges);
    expect(kept.map((c) => c.kind)).toEqual(['delos-console', 'delos-scan-result']);
  });
});

describe('planDelosCards density', () => {
  it('emits roughly one card candidate per 12s of speech', () => {
    // 120s of continuous speech → ~120/12 = 10 candidates before plan conflicts.
    const cards = planDelosCards(words(120), 120);
    expect(cards.length).toBeGreaterThanOrEqual(9);
    expect(cards.length).toBeLessThanOrEqual(11);
  });

  it('spaces consecutive card starts by the configured cadence', () => {
    const cards = planDelosCards(words(180), 180);
    for (let i = 1; i < cards.length; i++) {
      const gap = cards[i].startTime - cards[i - 1].startTime;
      expect(gap).toBeGreaterThanOrEqual(SECONDS_PER_CARD - CARD_DISPLAY_SECONDS);
    }
  });

  it('never overlaps consecutive cards', () => {
    const cards = planDelosCards(words(180), 180);
    for (let i = 1; i < cards.length; i++) {
      expect(cards[i].startTime).toBeGreaterThanOrEqual(cards[i - 1].endTime);
    }
  });

  it('returns no cards for an empty transcript', () => {
    expect(planDelosCards([], 60)).toEqual([]);
  });

  it('skips strides without enough spoken words', () => {
    // Only 2 words near t=0, silence after → no card meets the word floor.
    const sparse: Word[] = [
      { text: 'hi', start: 0, end: 0.5 },
      { text: 'there', start: 0.8, end: 1.2 },
    ];
    expect(planDelosCards(sparse, 60)).toEqual([]);
  });
});

describe('selectCardKind', () => {
  it('routes alert-signal windows to delos-alert', () => {
    expect(selectCardKind('this is a critical failure warning', 0)).toBe('delos-alert');
  });

  it('routes numbers-heavy windows to delos-console', () => {
    expect(selectCardKind('our conversion rate grew by 40 percent revenue', 0)).toBe(
      'delos-console',
    );
  });

  it('only ever returns text-forward kinds for neutral windows', () => {
    const textForward = new Set([
      'delos-scan-result',
      'delos-console',
      'delos-system-diagnostics',
      'delos-alert',
    ]);
    for (let i = 0; i < 8; i++) {
      expect(textForward.has(selectCardKind('a plain neutral sentence here', i))).toBe(true);
    }
  });

  it('avoids repeating the previous kind back-to-back in rotation', () => {
    const k = selectCardKind('a plain neutral sentence here', 0, 'delos-scan-result');
    expect(k).not.toBe('delos-scan-result');
  });
});
