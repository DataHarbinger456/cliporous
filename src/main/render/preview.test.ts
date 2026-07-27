import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captionsPrepare: vi.fn(async (..._args: unknown[]) => ({ tempFiles: [], modified: true })),
  renderClip: vi.fn(async () => undefined),
  renderSegmentedClip: vi.fn(async (_config: unknown, outputPath: string) => outputPath),
}));

vi.mock('../ffmpeg', () => ({
  getVideoMetadata: vi.fn(async () => ({ width: 1920, height: 1080, fps: 30, duration: 10 })),
}));

vi.mock('../auto-zoom', () => ({ generateZoomFilter: vi.fn(() => '') }));

vi.mock('./base-render', () => ({
  buildVideoFilter: vi.fn(() => 'scale=1080:1920'),
  renderClip: mocks.renderClip,
}));

vi.mock('./features/captions.feature', () => ({
  createCaptionsFeature: vi.fn(() => ({
    name: 'captions',
    prepare: mocks.captionsPrepare,
    overlayPass: vi.fn(() => null),
  })),
}));

vi.mock('./features/hook-title.feature', () => ({
  createHookTitleFeature: vi.fn(() => ({ name: 'hook-title' })),
}));

vi.mock('./features/rehook.feature', () => ({
  createRehookFeature: vi.fn(() => ({ name: 'rehook' })),
}));

vi.mock('./features/word-emphasis.feature', () => ({
  wordEmphasisFeature: { name: 'word-emphasis' },
}));

vi.mock('./segment-render', () => ({
  renderSegmentedClip: mocks.renderSegmentedClip,
}));

import { type PreviewRenderConfig, renderPreview } from './preview';

const subtitlePosition = { x: 43, y: 77 };
const templateLayout = {
  titleText: { x: 50, y: 18 },
  subtitles: subtitlePosition,
};

function baseConfig(): PreviewRenderConfig {
  return {
    sourceVideoPath: '/videos/source.mp4',
    startTime: 0,
    endTime: 2,
    captionsEnabled: true,
    captionStyle: { fontSize: 0.065, wordsPerLine: 4 },
    wordTimestamps: [{ text: 'Stable', start: 0.1, end: 0.4 }],
    templateLayout,
  };
}

describe('renderPreview template layout forwarding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards the subtitle center through the non-segmented caption feature path', async () => {
    await renderPreview(baseConfig());

    expect(mocks.captionsPrepare).toHaveBeenCalledOnce();
    const batchOptions = mocks.captionsPrepare.mock.calls[0][1] as {
      templateLayout: typeof templateLayout & { rehookText: { x: number; y: number } };
    };
    expect(batchOptions.templateLayout).toEqual({
      ...templateLayout,
      rehookText: templateLayout.titleText,
    });
    expect(batchOptions.templateLayout.subtitles).toBe(subtitlePosition);
    expect(mocks.renderClip).toHaveBeenCalledOnce();
  });

  it('forwards the subtitle center through the segmented render path', async () => {
    await renderPreview({
      ...baseConfig(),
      segments: [
        {
          id: 'segment-1',
          clipId: 'clip-1',
          index: 0,
          startTime: 0,
          endTime: 2,
          captionText: 'Stable',
          words: [{ text: 'Stable', start: 0.1, end: 0.4 }],
          archetype: 'talking-head',
          segmentStyleCategory: 'speaker-fullscreen',
          zoomKeyframes: [],
          transitionIn: 'hard-cut',
          transitionOut: 'hard-cut',
        },
      ],
    });

    expect(mocks.renderSegmentedClip).toHaveBeenCalledOnce();
    const segmentConfig = mocks.renderSegmentedClip.mock.calls[0][0] as {
      templateLayout: typeof templateLayout & { rehookText: { x: number; y: number } };
    };
    expect(segmentConfig.templateLayout).toEqual({
      ...templateLayout,
      rehookText: templateLayout.titleText,
    });
    expect(segmentConfig.templateLayout.subtitles).toBe(subtitlePosition);
  });
});
