import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipCard } from '@/components/ClipCard';
import { CompletedOutputCard } from '@/components/CompletedOutputCard';
import type { ClipCandidate, RenderProgress, SourceVideo } from '@/store/types';
import { installApiStub } from './__tests__/test-utils';

const SOURCE: SourceVideo = {
  id: 'source',
  path: '/QA-Fixtures/source.mp4',
  name: 'source.mp4',
  duration: 60,
  width: 1920,
  height: 1080,
  origin: 'file',
  mediaStatus: 'online',
};

const CLIP: ClipCandidate = {
  id: 'clip',
  sourceId: SOURCE.id,
  startTime: 4,
  endTime: 18,
  duration: 14,
  text: 'Fixture transcript',
  score: 91,
  hookText: 'Fixture hook',
  reasoning: 'Fixture reasoning',
  status: 'pending',
  thumbnail: 'data:image/png;base64,fixture',
};

function completedItem(id: string): RenderProgress {
  return {
    clipId: id,
    label: `Output ${id}`,
    percent: 100,
    status: 'done',
    outputPath: `/QA-Fixtures/Exports/${id}.mp4`,
  };
}

describe('media-heavy list performance contracts', () => {
  beforeEach(() => {
    installApiStub();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('defers poster decoding and creates a hover decoder only after intent', () => {
    const { container } = render(
      <ClipCard
        clip={CLIP}
        source={SOURCE}
        mediaPriority="lazy"
        onOpenDetail={() => undefined}
        onApprove={() => undefined}
        onReject={() => undefined}
      />,
    );

    expect(container.querySelector('img')).toHaveAttribute('loading', 'lazy');
    expect(container.querySelectorAll('video')).toHaveLength(0);

    const card = screen.getByRole('button', { name: /^Clip:/ }).parentElement as HTMLElement;
    fireEvent.mouseEnter(card);
    expect(container.querySelectorAll('video')).toHaveLength(1);

    fireEvent.mouseLeave(card);
    expect(container.querySelectorAll('video')).toHaveLength(0);
  });

  it('mounts a 120-clip contact sheet without allocating video decoders', () => {
    const startedAt = performance.now();
    const { container } = render(
      <div>
        {Array.from({ length: 120 }, (_, index) => ({
          ...CLIP,
          id: `clip-${index}`,
          hookText: `Fixture hook ${index}`,
        })).map((clip, index) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            source={SOURCE}
            mediaPriority={index < 8 ? 'eager' : 'lazy'}
            onOpenDetail={() => undefined}
            onApprove={() => undefined}
            onReject={() => undefined}
          />
        ))}
      </div>,
    );
    const mountMilliseconds = performance.now() - startedAt;

    console.info(`[qa-performance] 120 clip cards mounted in ${mountMilliseconds.toFixed(1)}ms`);
    expect(container.querySelectorAll('video')).toHaveLength(0);
    expect(container.querySelectorAll('img[loading="lazy"]')).toHaveLength(112);
    expect(mountMilliseconds).toBeLessThan(2_500);
  });

  it('keeps completed outputs unloaded and pauses the previous output before another plays', () => {
    const { container } = render(
      <>
        <CompletedOutputCard item={completedItem('one')} onRenderAgain={() => undefined} />
        <CompletedOutputCard item={completedItem('two')} onRenderAgain={() => undefined} />
      </>,
    );

    const videos = Array.from(container.querySelectorAll('video'));
    expect(videos).toHaveLength(2);
    expect(videos.every((video) => video.preload === 'none')).toBe(true);

    const playButtons = screen.getAllByRole('button', { name: 'Play' });
    fireEvent.click(playButtons[0] as HTMLElement);
    fireEvent.click(playButtons[1] as HTMLElement);

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
  });
});
