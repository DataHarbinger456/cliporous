import type { BlockPlacement, DelosCardPlacement, PhraseEmphasis } from '@shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  renderRemotionSegment: vi.fn(async () => undefined),
  muxRemotionVisualWithAudio: vi.fn(async () => undefined),
  compositePhraseOverlays: vi.fn(async () => undefined),
  compositeDelosCards: vi.fn(async () => undefined),
  buildCardContentWithSource: vi.fn(async () => ({
    content: {
      kind: 'delos-console' as const,
      title: 'Proof',
      statusText: 'ACTIVE',
      metrics: [{ label: 'Edits', value: 'ON' }],
    },
    source: 'fallback' as const,
  })),
}));

vi.mock('../../remotion/render', () => ({
  renderRemotionSegment: mocks.renderRemotionSegment,
}));

vi.mock('../longform-encode', () => ({
  muxRemotionVisualWithAudio: mocks.muxRemotionVisualWithAudio,
  compositePhraseOverlays: mocks.compositePhraseOverlays,
  compositeDelosCards: mocks.compositeDelosCards,
}));

vi.mock('../../hyperframes/card-content', () => ({
  buildCardContentWithSource: mocks.buildCardContentWithSource,
}));

const { renderBlockSegment } = await import('./blocks.feature');
const { applyPhraseOverlays } = await import('./phrase-emphasis.feature');
const { applyDelosCards } = await import('./delos-card.feature');

const block: BlockPlacement = {
  kind: 'stat-hero',
  startTime: 1,
  endTime: 4,
  kicker: 'PROOF',
  heading: 'Block enabled',
  value: 100,
  suffix: '%',
  label: 'RENDERED',
};

const phrase: PhraseEmphasis = {
  text: 'PHRASE ENABLED',
  startTime: 5,
  endTime: 6,
};

const card: DelosCardPlacement = {
  kind: 'delos-console',
  startTime: 7,
  endTime: 10,
  sourceText: 'Card enabled',
};

describe('longform edit render paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders blocks, phrases, and cards instead of dropping them as unavailable', async () => {
    await renderBlockSegment({
      placement: block,
      skinId: 'ezcoder',
      sourceVideoPath: '/tmp/source.mp4',
      width: 1920,
      height: 1080,
      fps: 30,
    });

    const phraseResult = await applyPhraseOverlays({
      inputPath: '/tmp/base.mp4',
      outputPath: '/tmp/phrased.mp4',
      phrases: [phrase],
      width: 1920,
      height: 1080,
      fps: 30,
      qualityParams: {},
    });

    const cardResult = await applyDelosCards({
      inputPath: '/tmp/phrased.mp4',
      outputPath: '/tmp/final.mp4',
      cards: [card],
      speakerRanges: [{ start: 4, end: 12 }],
      width: 1920,
      height: 1080,
      fps: 30,
      qualityParams: {},
    });

    const compositionIds = mocks.renderRemotionSegment.mock.calls.map(
      ([options]) => (options as { compositionId: string }).compositionId,
    );
    expect(compositionIds).toEqual([
      'StatHero-ezcoder',
      'HormoziPhraseOverlay',
      'DelosEvidenceCard',
    ]);
    expect(phraseResult.stats).toEqual({ rendered: 1, dropped: 0 });
    expect(cardResult.stats).toEqual({ rendered: 1, dropped: 0, aiText: 0, fallbackText: 1 });
    expect(mocks.muxRemotionVisualWithAudio).toHaveBeenCalledTimes(1);
    expect(mocks.compositePhraseOverlays).toHaveBeenCalledTimes(1);
    expect(mocks.compositeDelosCards).toHaveBeenCalledTimes(1);
  });
});
