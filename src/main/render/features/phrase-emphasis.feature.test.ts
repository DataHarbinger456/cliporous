// ---------------------------------------------------------------------------
// Phrase-emphasis graceful-degrade tests (RF-003).
//
// A single phrase overlay failing to render (or Remotion being wholly
// unavailable) must NOT kill the long-form render: failed phrases are skipped
// and the rest still composite. When every phrase fails, the base video is
// returned untouched so the pipeline can finalize the speaker cut.
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
  it('skips a phrase whose overlay render throws and composites the rest', async () => {
    // First phrase fails, second succeeds.
    renderRemotionSegment
      .mockRejectedValueOnce(new Error('remotion boom'))
      .mockResolvedValueOnce(undefined);

    const result = await applyPhraseOverlays({
      ...baseOpts,
      phrases: [phrase('first', 1, 2), phrase('second', 3, 4)],
    });

    // Only the surviving overlay should be composited and reconciled.
    expect(compositePhraseOverlays).toHaveBeenCalledTimes(1);
    const arg = compositePhraseOverlays.mock.calls[0][0] as { overlays: unknown[] };
    expect(arg.overlays).toHaveLength(1);
    expect(result.outputPath).toBe(baseOpts.outputPath);
    expect(result.tempFiles).toHaveLength(1);
    expect(result.stats).toEqual({ rendered: 1, dropped: 1 });
  });

  it('returns the base untouched (no composite) when every phrase fails', async () => {
    renderRemotionSegment.mockRejectedValue(new Error('remotion unavailable'));

    const result = await applyPhraseOverlays({
      ...baseOpts,
      phrases: [phrase('a', 1, 2), phrase('b', 3, 4)],
    });

    // No composite pass, base path returned so the caller finalizes the concat.
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

  it('uses a phrase override before the selected palette color', async () => {
    renderRemotionSegment.mockResolvedValue(undefined);

    await applyPhraseOverlays({
      ...baseOpts,
      phraseColor: '#9f75ff',
      phrases: [
        phrase('palette fallback', 1, 2),
        { ...phrase('custom accent', 3, 4), accentColor: '#ff5500' },
      ],
    });

    const firstProps = renderRemotionSegment.mock.calls[0][0] as {
      inputProps: { accentColor?: string };
    };
    const secondProps = renderRemotionSegment.mock.calls[1][0] as {
      inputProps: { accentColor?: string };
    };
    expect(firstProps.inputProps.accentColor).toBe('#9f75ff');
    expect(secondProps.inputProps.accentColor).toBe('#ff5500');
  });
});
