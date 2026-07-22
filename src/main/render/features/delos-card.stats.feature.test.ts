// ---------------------------------------------------------------------------
// applyDelosCards stats wiring.
//
// The Remotion renderer, compositor, and content builder are mocked so this
// proves rendered/dropped and AI/fallback accounting without rendering video.
// ---------------------------------------------------------------------------

import type { DelosCardPlacement } from '@shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderRemotionSegmentMock = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('../../remotion/render', () => ({
  renderRemotionSegment: (...args: unknown[]) => renderRemotionSegmentMock(...args),
}));

const compositeMock = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('../longform-encode', () => ({
  compositeDelosCards: (...args: unknown[]) => compositeMock(...args),
}));

const buildSourceMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('../../hyperframes/card-content', () => ({
  buildCardContentWithSource: (...args: unknown[]) => buildSourceMock(...args),
}));

const { applyDelosCards } = await import('./delos-card.feature');

function card(startTime: number, endTime: number): DelosCardPlacement {
  return { kind: 'delos-console', startTime, endTime };
}

const BASE_OPTS = {
  inputPath: '/tmp/in.mp4',
  outputPath: '/tmp/out.mp4',
  speakerRanges: [{ start: 0, end: 60 }],
  width: 1920,
  height: 1080,
  fps: 30,
  qualityParams: {},
  apiKey: 'key',
};

beforeEach(() => {
  renderRemotionSegmentMock.mockReset();
  compositeMock.mockReset();
  buildSourceMock.mockReset();
  compositeMock.mockResolvedValue(undefined);
});

describe('applyDelosCards — stats', () => {
  it('counts a failed Remotion card and AI/fallback text', async () => {
    const cards = [card(2, 7), card(12, 17), card(22, 27)];
    buildSourceMock
      .mockResolvedValueOnce({ content: { kind: 'delos-console' }, source: 'ai' })
      .mockResolvedValueOnce({ content: { kind: 'delos-console' }, source: 'ai' })
      .mockResolvedValueOnce({ content: { kind: 'delos-console' }, source: 'fallback' });
    renderRemotionSegmentMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('render failed'))
      .mockResolvedValueOnce(undefined);

    const { outputPath, stats } = await applyDelosCards({ ...BASE_OPTS, cards });

    expect(stats).toEqual({ rendered: 2, dropped: 1, aiText: 2, fallbackText: 1 });
    expect(compositeMock).toHaveBeenCalledTimes(1);
    expect(outputPath).toBe('/tmp/out.mp4');
  });

  it('returns the input untouched when no card survives filtering', async () => {
    const { outputPath, stats, tempFiles } = await applyDelosCards({
      ...BASE_OPTS,
      cards: [card(100, 110)],
    });

    expect(stats).toEqual({ rendered: 0, dropped: 0, aiText: 0, fallbackText: 0 });
    expect(renderRemotionSegmentMock).not.toHaveBeenCalled();
    expect(compositeMock).not.toHaveBeenCalled();
    expect(outputPath).toBe(BASE_OPTS.inputPath);
    expect(tempFiles).toEqual([]);
  });

  it('reports every surviving card as dropped when all renders fail', async () => {
    const cards = [card(2, 7), card(12, 17)];
    buildSourceMock
      .mockResolvedValueOnce({ content: { kind: 'delos-console' }, source: 'fallback' })
      .mockResolvedValueOnce({ content: { kind: 'delos-console' }, source: 'fallback' });
    renderRemotionSegmentMock.mockRejectedValue(new Error('render unavailable'));

    const { outputPath, stats } = await applyDelosCards({ ...BASE_OPTS, cards });

    expect(stats).toEqual({ rendered: 0, dropped: 2, aiText: 0, fallbackText: 2 });
    expect(compositeMock).not.toHaveBeenCalled();
    expect(outputPath).toBe(BASE_OPTS.inputPath);
  });
});
