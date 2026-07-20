import type { WordTimestamp } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { matchEvidenceBeatsHeuristic } from './evidence-trigger';

/** Lay words end-to-end at `spw` seconds each. */
function words(texts: string[], spw = 0.4): WordTimestamp[] {
  return texts.map((text, i) => ({
    text,
    start: i * spw,
    end: (i + 1) * spw,
  }));
}

/** Build a stream where a phrase appears at a given second. */
function phraseAt(
  second: number,
  phrase: string,
  filler = 'and then we keep going with more talking here',
): WordTimestamp[] {
  const pre = filler.split(' ');
  const spw = 0.4;
  const preCount = Math.max(0, Math.round(second / spw));
  const stream: string[] = [];
  for (let i = 0; i < preCount; i++) stream.push(pre[i % pre.length]);
  stream.push(...phrase.split(' '));
  for (let i = 0; i < 12; i++) stream.push(pre[i % pre.length]);
  return words(stream, spw);
}

describe('evidence-trigger — heuristic matcher', () => {
  it('categorizes an app-ui phrase', () => {
    const beats = matchEvidenceBeatsHeuristic(phraseAt(5, 'media master'));
    expect(beats[0].category).toBe('app-ui');
    expect(beats[0].trigger).toBe('media master');
  });

  it('categorizes a community-proof phrase', () => {
    const beats = matchEvidenceBeatsHeuristic(phraseAt(5, 'inside my skool'));
    expect(beats[0].category).toBe('community-proof');
  });

  it('categorizes a growth-stat phrase', () => {
    const beats = matchEvidenceBeatsHeuristic(phraseAt(5, '100 posts'));
    expect(beats[0].category).toBe('growth-stat');
  });

  it('protects the hook — ignores matches before hookProtectionSeconds', () => {
    // "media master" at ~0.4s, inside the default 2s hook window.
    const beats = matchEvidenceBeatsHeuristic(
      words(['media', 'master', 'is', 'the', 'thing', 'i', 'built', 'here', 'now']),
    );
    expect(beats).toHaveLength(0);
  });

  it('enforces a minimum gap between beats', () => {
    // Two app-ui phrases 1s apart → only the first survives a 3s min gap.
    const stream = words([
      ...'ok so here we go talking a bit'.split(' '), // ~0..3.2s
      'media',
      'master', // ~3.2s
      'and',
      'also', // filler
      'the',
      'chat', // ~4.8s — within 3s of the first
      ...'keeps going on and on and on and on'.split(' '),
    ]);
    const beats = matchEvidenceBeatsHeuristic(stream, { minGapSeconds: 3 });
    expect(beats).toHaveLength(1);
  });

  it('caps total beats at maxBeats', () => {
    const stream = words([
      ...'intro words here to pass the hook window fully now'.split(' '),
      'media',
      'master',
      ...'x x x x x x x x'.split(' '),
      'my',
      'skool',
      ...'y y y y y y y y'.split(' '),
      '100',
      'posts',
      ...'z z z z z z z z'.split(' '),
      'the',
      'agent',
      ...'q q q q q q q q'.split(' '),
      'swipe',
      'ads',
    ]);
    const beats = matchEvidenceBeatsHeuristic(stream, { maxBeats: 2, minGapSeconds: 1 });
    expect(beats.length).toBeLessThanOrEqual(2);
  });

  it('does not text-fill CTA beats', () => {
    const beats = matchEvidenceBeatsHeuristic(phraseAt(5, 'link in bio'));
    expect(beats[0].category).toBe('cta');
    expect(beats[0].textFill).toBeUndefined();
  });

  it('respects word boundaries (no partial-word matches)', () => {
    // "generated" should match the "generated" phrase but "regenerate" must not
    // trigger via the "generate" phrase substring.
    const beats = matchEvidenceBeatsHeuristic(
      words(['we', 'never', 'regenerate', 'anything', 'at', 'all', 'here', 'ok']),
    );
    expect(beats).toHaveLength(0);
  });

  it('returns [] for empty transcript', () => {
    expect(matchEvidenceBeatsHeuristic([])).toEqual([]);
  });
});
