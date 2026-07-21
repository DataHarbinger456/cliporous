// ---------------------------------------------------------------------------
// Phrase-emphasis graceful-degrade tests (RF-003).
//
// Remotion is intentionally absent from distribution builds. Phrase overlays
// must degrade to the base video without invoking a renderer or compositor.
// ---------------------------------------------------------------------------

import type { PhraseEmphasis } from '@shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QualityParams } from '../../ffmpeg';

// The feature dynamically imports the Remotion renderer and statically imports
// the FFmpeg compositor. Mock both so no real render/encode is spawned.
// vi.hoisted keeps the spies addressable from the hoisted vi.mock factories.
const { renderRemotionSegment, compositePhraseOverlays } = vi.hoisted(() => ({
  renderRemotionSegment: vi.fn(),
  compositePhraseOverlays: vi.fn(async () => {}),
}));

vi.mock('../../remotion/render', () => ({ renderRemotionSegment }));
vi.mock('../longform-encode', () => ({ compositePhraseOverlays }));

import { applyPhraseOverlays } from './phrase-emphasis.feature';

const qualityParams = {} as QualityParams;

function phrase(text: string, startTime: number, endTime: number): PhraseEmphasis {
  return { text, startTime, endTime };
}

const baseOpts = {
  inputPath: '/tmp/concat.mp4',
  outputPath: '/tmp/out.mp4',
  width: 1920,
  height: 1080,
  fps: 30,
  qualityParams,
};

beforeEach(() => {
  renderRemotionSegment.mockReset();
  compositePhraseOverlays.mockClear();
});

describe('applyPhraseOverlays — graceful degrade', () => {
  it('returns the base untouched when distribution overlays are unavailable', async () => {
    const result = await applyPhraseOverlays({
      ...baseOpts,
      phrases: [phrase('a', 1, 2), phrase('b', 3, 4)],
    });

    expect(renderRemotionSegment).not.toHaveBeenCalled();
    expect(compositePhraseOverlays).not.toHaveBeenCalled();
    expect(result.outputPath).toBe(baseOpts.inputPath);
    expect(result.tempFiles).toHaveLength(0);
    expect(result.stats).toEqual({ rendered: 0, dropped: 2 });
  });

  it('returns the base unchanged with no phrases', async () => {
    const result = await applyPhraseOverlays({ ...baseOpts, phrases: [] });
    expect(renderRemotionSegment).not.toHaveBeenCalled();
    expect(compositePhraseOverlays).not.toHaveBeenCalled();
    expect(result.outputPath).toBe(baseOpts.inputPath);
    expect(result.stats).toEqual({ rendered: 0, dropped: 0 });
  });
});
