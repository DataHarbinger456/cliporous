import type { BlockPlacement } from '@shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { renderRemotionSegment, muxRemotionVisualWithAudio } = vi.hoisted(() => ({
  renderRemotionSegment: vi.fn(async () => '/tmp/visual.mp4'),
  muxRemotionVisualWithAudio: vi.fn(async () => {}),
}));

vi.mock('../../remotion/render', () => ({ renderRemotionSegment }));
vi.mock('../longform-encode', () => ({ muxRemotionVisualWithAudio }));

import { renderBlockSegment } from './blocks.feature';

const placement: BlockPlacement = {
  kind: 'stat-hero',
  startTime: 5,
  endTime: 9,
  kicker: 'THE NUMBER',
  heading: 'Revenue growth',
  value: 42,
  label: 'percent',
};

describe('renderBlockSegment', () => {
  beforeEach(() => {
    renderRemotionSegment.mockClear();
    muxRemotionVisualWithAudio.mockClear();
  });

  it('renders the selected Remotion composition and muxes source audio', async () => {
    const onProgress = vi.fn();
    const outputPath = await renderBlockSegment({
      placement,
      skinId: 'editorial',
      sourceVideoPath: '/tmp/source.mp4',
      width: 1920,
      height: 1080,
      fps: 30,
      onProgress,
    });

    expect(renderRemotionSegment).toHaveBeenCalledWith(
      expect.objectContaining({
        compositionId: 'StatHero-editorial',
        durationSec: 4,
        transparent: false,
      }),
    );
    expect(muxRemotionVisualWithAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceVideoPath: '/tmp/source.mp4',
        startTime: 5,
        duration: 4,
      }),
    );
    expect(outputPath).toMatch(/batchcontent-block-seg-.*\.mp4$/);
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });
});
