import { describe, expect, it } from 'vitest';
import type { OverlayRequest } from '../../hyperframes/types';
import type { WordTimestamp } from '../point-coverage';
import {
  extendOverlayTimingForPoints,
  extractOverlayItemTexts,
} from './hyperframes-overlay.feature';

// Build word timestamps for a sentence, one word per 0.5s slot starting at `t0`.
function wordsFrom(sentence: string, t0 = 0, step = 0.5): WordTimestamp[] {
  return sentence.split(' ').map((text, i) => ({
    text,
    start: t0 + i * step,
    end: t0 + i * step + step,
  }));
}

describe('extractOverlayItemTexts', () => {
  it('reads string item lists (checklist)', () => {
    const request: OverlayRequest = {
      block: 'checklist',
      props: { items: ['First point', 'Second point'] } as OverlayRequest['props'],
      timing: { start: 0, duration: 4 },
    };
    expect(extractOverlayItemTexts(request)).toEqual(['First point', 'Second point']);
  });

  it('reads object item lists via label/name (icon-grid, delos services)', () => {
    const grid: OverlayRequest = {
      block: 'icon-grid',
      props: {
        items: [
          { icon: '📞', label: 'Sales' },
          { icon: '📧', label: 'Marketing' },
        ],
      } as unknown as OverlayRequest['props'],
      timing: { start: 0, duration: 3 },
    };
    expect(extractOverlayItemTexts(grid)).toEqual(['Sales', 'Marketing']);
  });
});

describe('extendOverlayTimingForPoints', () => {
  it('extends a 4-item card to cover its 4th point spoken at t=5.0s', () => {
    // Items spoken sequentially and non-overlapping; the 4th point
    // ("Appointment booking") finishes at exactly 5.0s.
    const words: WordTimestamp[] = [
      ...wordsFrom('handle sales calls', 0), // 0.0 – 1.5
      ...wordsFrom('qualify the leads', 1.5), // 1.5 – 3.0
      ...wordsFrom('follow up emails', 3.0), // 3.0 – 4.5
      // Final point: last word ends exactly at 5.0s.
      { text: 'appointment', start: 4.5, end: 4.75 },
      { text: 'booking', start: 4.75, end: 5.0 },
    ];

    const request: OverlayRequest = {
      block: 'checklist',
      props: {
        items: ['Sales calls', 'Lead qualification', 'Follow-up emails', 'Appointment booking'],
      } as OverlayRequest['props'],
      // Graphic was planned to close at 3.0s — well before the 4th point.
      timing: { start: 0, duration: 3 },
    };

    const timing = extendOverlayTimingForPoints(request, words, 10);
    const endTime = timing.start + timing.duration;
    expect(endTime).toBeGreaterThanOrEqual(5.6);
  });

  it('never extends past the clip end', () => {
    const words: WordTimestamp[] = [
      ...wordsFrom('first point here', 0),
      { text: 'final', start: 4.5, end: 4.8 },
      { text: 'point', start: 4.8, end: 5.0 },
    ];
    const request: OverlayRequest = {
      block: 'checklist',
      props: { items: ['First point here', 'Final point'] } as OverlayRequest['props'],
      timing: { start: 0, duration: 2 },
    };
    // clipEnd 5.2 < 5.0 + 0.6 hold, so the end must clamp to the clip.
    const timing = extendOverlayTimingForPoints(request, words, 5.2);
    expect(timing.start + timing.duration).toBeLessThanOrEqual(5.2);
    expect(timing.start + timing.duration).toBeCloseTo(5.2, 5);
  });

  it('falls back to original timing when no word matches (no regression)', () => {
    const words = wordsFrom('completely unrelated narration about something else', 0);
    const request: OverlayRequest = {
      block: 'checklist',
      props: { items: ['Alpha widget', 'Bravo gadget'] } as OverlayRequest['props'],
      timing: { start: 1, duration: 3 },
    };
    const timing = extendOverlayTimingForPoints(request, words, 30);
    expect(timing).toEqual({ start: 1, duration: 3 });
  });

  it('leaves single-item widgets untouched', () => {
    const words = wordsFrom('one single label spoken late at the end', 0);
    const request: OverlayRequest = {
      block: 'pill-badge',
      props: { text: 'Label spoken' } as OverlayRequest['props'],
      timing: { start: 0, duration: 2 },
    };
    const timing = extendOverlayTimingForPoints(request, words, 30);
    expect(timing).toEqual({ start: 0, duration: 2 });
  });
});
