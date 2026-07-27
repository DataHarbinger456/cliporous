import { describe, expect, it } from 'vitest';
import {
  CAPTION_HORIZONTAL_INSET_FRACTION,
  CAPTION_MAX_LINES,
  CAPTION_MAX_WIDTH_FRACTION,
  DEFAULT_SUBTITLE_POSITION,
  resolveSubtitleAnchor,
} from './caption-layout';

describe('caption layout contract', () => {
  it('keeps the existing subtitle default and a two-line width budget', () => {
    expect(DEFAULT_SUBTITLE_POSITION).toEqual({ x: 50, y: 85 });
    expect(CAPTION_MAX_LINES).toBe(2);
    expect(CAPTION_MAX_WIDTH_FRACTION).toBe(1 - CAPTION_HORIZONTAL_INSET_FRACTION * 2);
  });

  it('converts the percentage center to pixels on the locked vertical canvas', () => {
    expect(resolveSubtitleAnchor({ x: 50, y: 85 }, 1080, 1920)).toEqual({
      x: 540,
      y: 1632,
    });
  });

  it('clamps saved percentages to the canvas', () => {
    expect(resolveSubtitleAnchor({ x: -20, y: 140 }, 1080, 1920)).toEqual({
      x: 0,
      y: 1920,
    });
  });

  it('falls back per axis for non-finite values and rejects invalid extents', () => {
    expect(resolveSubtitleAnchor({ x: Number.NaN, y: 25 }, Number.POSITIVE_INFINITY, -10)).toEqual({
      x: 0,
      y: 0,
    });
    expect(resolveSubtitleAnchor({ x: 25, y: Number.NEGATIVE_INFINITY }, 1080, 1920)).toEqual({
      x: 270,
      y: 1632,
    });
  });
});
