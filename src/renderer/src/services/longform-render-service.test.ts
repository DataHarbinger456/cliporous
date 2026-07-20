import type { LongformEditPlan } from '@shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installApiStub, resetStore } from '@/components/__tests__/test-utils';
import { useStore } from '@/store';
import { prepareLongformRender } from './longform-render-service';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  }),
}));

const PLAN: LongformEditPlan = {
  phrases: [],
  blocks: [],
  cards: [],
  reasoning: 'Keep the accepted editorial timing.',
  generatedAt: 100,
};

describe('longform render readiness', () => {
  beforeEach(() => {
    resetStore();
    installApiStub();
    useStore.setState((state) => {
      state.sources = [
        {
          id: 'source-1',
          path: '/videos/source.mp4',
          name: 'source.mp4',
          duration: 60,
          width: 1920,
          height: 1080,
          origin: 'file',
          mediaStatus: 'online',
        },
      ];
      state.activeSourceId = 'source-1';
      state.settings.outputDirectory = '/exports';
      state.settings.longformPaletteId = 'missing-palette';
      state.settings.customPalettes = [];
    });
    useStore.getState().setLongformPlan('source-1', {
      plan: PLAN,
      skin: 'editorial',
      paletteId: 'missing-palette',
      status: 'accepted',
    });
  });

  it('blocks export preparation until a missing saved palette is repaired', async () => {
    const result = await prepareLongformRender();

    expect(result).toEqual({ started: false, reason: 'palette-unavailable' });
    expect(useStore.getState().renderProgress).toEqual([]);
  });

  it('distinguishes a pending media check from an offline source', async () => {
    useStore.setState((state) => {
      const source = state.sources[0];
      if (source) source.mediaStatus = 'checking';
      state.settings.longformPaletteId = 'brand';
    });

    const result = await prepareLongformRender();

    expect(result).toEqual({ started: false, reason: 'source-checking' });
    expect(useStore.getState().renderProgress).toEqual([]);
  });
});
