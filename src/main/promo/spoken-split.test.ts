import type { WordTimestamp } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { findMarkers, splitOnSpokenMarkers } from './spoken-split';

/**
 * Build a word stream from a compact spec: each entry is `text` and the words
 * are laid end-to-end at `secondsPerWord` each starting at `startAt`.
 */
function words(texts: string[], secondsPerWord = 0.5, startAt = 0): WordTimestamp[] {
  return texts.map((text, i) => ({
    text,
    start: startAt + i * secondsPerWord,
    end: startAt + (i + 1) * secondsPerWord,
  }));
}

describe('spoken-split — findMarkers', () => {
  it('detects "clip one/two" markers with number words', () => {
    const w = words(['clip', 'one', 'hello', 'world', 'clip', 'two', 'bye']);
    const markers = findMarkers(w, 'clip');
    expect(markers.map((m) => m.index)).toEqual([1, 2]);
  });

  it('detects digit ordinals ("clip 3")', () => {
    const w = words(['clip', '3', 'content', 'here']);
    const markers = findMarkers(w, 'clip');
    expect(markers).toHaveLength(1);
    expect(markers[0].index).toBe(3);
  });

  it('ignores "clip" when not followed by a number', () => {
    const w = words(['I', 'made', 'a', 'clip', 'about', 'growth']);
    expect(findMarkers(w, 'clip')).toHaveLength(0);
  });

  it('tolerates punctuation and casing ("Clip, Two.")', () => {
    const w = words(['Clip,', 'Two.', 'go']);
    const markers = findMarkers(w, 'clip');
    expect(markers).toHaveLength(1);
    expect(markers[0].index).toBe(2);
  });
});

describe('spoken-split — splitOnSpokenMarkers', () => {
  it('splits content between markers, excluding the spoken marker itself', () => {
    // clip one: words at idx 2..5, clip two: words at idx 8..10
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
    const segs = splitOnSpokenMarkers(w, { minDurationSeconds: 0.1 });
    expect(segs).toHaveLength(2);

    // Segment 1 starts at the first content word ("this") — marker excluded.
    expect(segs[0].index).toBe(1);
    expect(segs[0].startTime).toBeCloseTo(w[2].start);
    expect(segs[0].endTime).toBeCloseTo(w[5].end);

    // Segment 2 runs to the end of the stream.
    expect(segs[1].index).toBe(2);
    expect(segs[1].startTime).toBeCloseTo(w[8].start);
    expect(segs[1].endTime).toBeCloseTo(w[10].end);
  });

  it('ignores content before the first marker', () => {
    const w = words(['um', 'testing', 'clip', 'one', 'real', 'content', 'here']);
    const segs = splitOnSpokenMarkers(w, { minDurationSeconds: 0.1 });
    expect(segs).toHaveLength(1);
    expect(segs[0].startTime).toBeCloseTo(w[4].start); // "real", not "um"
  });

  it('drops segments shorter than minDurationSeconds', () => {
    // clip one has only one 0.5s content word → below 2s default.
    const w = words(['clip', 'one', 'x', 'clip', 'two', 'a', 'b', 'c', 'd', 'e', 'f', 'g']);
    const segs = splitOnSpokenMarkers(w); // default min 2s
    expect(segs.map((s) => s.index)).toEqual([2]);
  });

  it('returns [] when there are no markers (caller handles fallback)', () => {
    const w = words(['just', 'a', 'normal', 'talking', 'head', 'video']);
    expect(splitOnSpokenMarkers(w)).toEqual([]);
  });

  it('supports a custom trigger word', () => {
    const w = words(['section', 'one', 'hello', 'there', 'friend', 'now']);
    const segs = splitOnSpokenMarkers(w, {
      triggerWord: 'section',
      minDurationSeconds: 0.1,
    });
    expect(segs).toHaveLength(1);
    expect(segs[0].startTime).toBeCloseTo(w[2].start);
  });
});
