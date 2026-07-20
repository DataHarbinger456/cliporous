import { describe, expect, it } from 'vitest';
import {
  breakWordStyle,
  CHAR_WIDTH_RATIO,
  clampStyle,
  computeFitFontSize,
  estimateLines,
} from './fit-text';

describe('estimateLines', () => {
  it('fits short text on one line', () => {
    expect(estimateLines('Hello world', 40)).toBe(1);
  });

  it('wraps onto multiple lines when the budget is small', () => {
    // 4 words of ≤5 chars each, 6 chars per line → one word per line.
    expect(estimateLines('alpha bravo delta gamma', 6)).toBe(4);
  });

  it('breaks a single word that is wider than a line', () => {
    // 30-char word at 10 chars/line → 3 lines (break-word).
    expect(estimateLines('x'.repeat(30), 10)).toBe(3);
  });

  it('treats an impossible width as infinite lines', () => {
    expect(estimateLines('anything', 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns one line for empty/whitespace text', () => {
    expect(estimateLines('   ', 10)).toBe(1);
  });
});

describe('computeFitFontSize', () => {
  const base = {
    maxWidth: 1000,
    maxFontSize: 120,
    minFontSize: 60,
    maxLines: 1,
    charWidthRatio: CHAR_WIDTH_RATIO.bebas,
  };

  it('keeps the design size for normal-length text', () => {
    // "Scaling Playbook" easily fits one line at 120px in 1000px.
    expect(computeFitFontSize('Scaling Playbook', base)).toBe(120);
  });

  it('shrinks long text toward the floor', () => {
    const long =
      'The Complete End To End Operating System For Scaling Your Agency Past Seven Figures';
    const size = computeFitFontSize(long, base);
    expect(size).toBeLessThan(120);
    expect(size).toBeGreaterThanOrEqual(60);
  });

  it('never drops below the floor even for extreme text', () => {
    const huge = 'word '.repeat(200).trim();
    expect(computeFitFontSize(huge, base)).toBe(60);
  });

  it('never exceeds the design max for empty text', () => {
    expect(computeFitFontSize('', base)).toBe(120);
  });

  it('allows more text at the same size when more lines are permitted', () => {
    const text = 'Build a repeatable acquisition engine that compounds every single month';
    const oneLine = computeFitFontSize(text, { ...base, maxLines: 1 });
    const threeLines = computeFitFontSize(text, { ...base, maxLines: 3 });
    expect(threeLines).toBeGreaterThanOrEqual(oneLine);
  });

  it('factors letter-spacing into the width budget', () => {
    const text = 'OPERATING SYSTEM PLAYBOOK';
    const tight = computeFitFontSize(text, { ...base, letterSpacing: 0 });
    const spaced = computeFitFontSize(text, { ...base, letterSpacing: 12 });
    expect(spaced).toBeLessThanOrEqual(tight);
  });
});

describe('clampStyle', () => {
  it('produces a webkit line-clamp box that hides overflow', () => {
    const s = clampStyle(3);
    expect(s.display).toBe('-webkit-box');
    expect(s.WebkitBoxOrient).toBe('vertical');
    expect(s.WebkitLineClamp).toBe(3);
    expect(s.overflow).toBe('hidden');
  });

  it('is a no-op for a non-positive line count', () => {
    expect(clampStyle(0)).toEqual({});
  });
});

describe('breakWordStyle', () => {
  it('forces overlong words to wrap instead of overflowing', () => {
    expect(breakWordStyle.overflowWrap).toBe('break-word');
    expect(breakWordStyle.wordBreak).toBe('break-word');
  });
});
