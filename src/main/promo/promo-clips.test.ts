import type { WordTimestamp } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { buildPromoClips } from './promo-clips';

/** Lay words end-to-end at `secondsPerWord` each, starting at `startAt`. */
function words(texts: string[], secondsPerWord = 0.5, startAt = 0): WordTimestamp[] {
  return texts.map((text, i) => ({
    text,
    start: startAt + i * secondsPerWord,
    end: startAt + (i + 1) * secondsPerWord,
  }));
}

describe('promo-clips — buildPromoClips', () => {
  it('builds one candidate per PromoSegment with correct time ranges', () => {
    // clip one content: idx 2..5, clip two content: idx 8..10
    const w = words([
      'clip',
      'one',
      'this',
      'is',
      'segment',
      'a',
      'clip',
      'two',
      'now',
      'segment',
      'b',
    ]);

    const clips = buildPromoClips(w, { minDurationSeconds: 0.1 });
    expect(clips).toHaveLength(2);

    expect(clips[0].index).toBe(1);
    expect(clips[0].startTime).toBeCloseTo(w[2].start);
    expect(clips[0].endTime).toBeCloseTo(w[5].end);
    expect(clips[0].label).toBe('clip 1');
    expect(clips[0].text).toBe('this is segment a');

    expect(clips[1].index).toBe(2);
    expect(clips[1].startTime).toBeCloseTo(w[8].start);
    expect(clips[1].endTime).toBeCloseTo(w[10].end);
    expect(clips[1].text).toBe('now segment b');
  });

  it('preserves source-relative word timestamps on each candidate', () => {
    const w = words([
      'clip',
      'one',
      'this',
      'is',
      'segment',
      'a',
      'clip',
      'two',
      'now',
      'segment',
      'b',
    ]);

    const clips = buildPromoClips(w, { minDurationSeconds: 0.1 });

    // Candidate 1 carries exactly its in-range words with original timings.
    expect(clips[0].wordTimestamps).toEqual(w.slice(2, 6));
    // Candidate 2 runs to the end of the stream.
    expect(clips[1].wordTimestamps).toEqual(w.slice(8, 11));
    // No marker words ("clip"/"one"/"two") leak into the candidates.
    for (const clip of clips) {
      for (const word of clip.wordTimestamps) {
        expect(word.text).not.toBe('clip');
      }
    }
  });

  it('falls back to a single whole-recording clip when no markers are found', () => {
    const w = words(['just', 'a', 'normal', 'talking', 'head', 'video']);
    const clips = buildPromoClips(w);

    expect(clips).toHaveLength(1);
    expect(clips[0].index).toBe(1);
    expect(clips[0].startTime).toBeCloseTo(w[0].start);
    expect(clips[0].endTime).toBeCloseTo(w[w.length - 1].end);
    expect(clips[0].wordTimestamps).toEqual(w);
    expect(clips[0].text).toBe('just a normal talking head video');
  });

  it('returns [] for an empty word stream (does not crash)', () => {
    expect(buildPromoClips([])).toEqual([]);
  });

  it('supports a custom trigger word', () => {
    const w = words(['section', 'one', 'hello', 'there', 'friend', 'now']);
    const clips = buildPromoClips(w, { triggerWord: 'section', minDurationSeconds: 0.1 });
    expect(clips).toHaveLength(1);
    expect(clips[0].startTime).toBeCloseTo(w[2].start);
  });
});
