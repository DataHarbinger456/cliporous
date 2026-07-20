import { beforeEach, describe, expect, it } from 'vitest';
import { installApiStub, resetStore } from '@/components/__tests__/test-utils';
import { useStore } from '@/store';
import type { RenderProgress } from '@/store/types';
import { estimateExport, runExportPreflight } from './export-queue';

const queue: RenderProgress[] = [
  {
    clipId: 'regular',
    kind: 'clip',
    durationSeconds: 30,
    percent: 0,
    status: 'queued',
  },
  {
    clipId: 'stitched',
    kind: 'stitched',
    durationSeconds: 45,
    percent: 0,
    status: 'queued',
  },
  {
    clipId: 'longform',
    kind: 'longform',
    durationSeconds: 600,
    percent: 0,
    status: 'cancelled',
  },
];

beforeEach(() => {
  localStorage.clear();
  resetStore();
  installApiStub();
});

describe('export estimates and preflight', () => {
  it('uses media duration, quality, encoder history, and a size range', () => {
    const settings = useStore.getState().settings;
    const estimate = estimateExport(
      queue.slice(0, 2),
      settings,
      'short',
      { encoder: 'h264_nvenc', isHardware: true },
      [
        {
          encoder: 'h264_nvenc',
          hardware: true,
          quality: settings.renderQuality.preset,
          mediaSeconds: 60,
          renderSeconds: 30,
          completedAt: Date.now(),
        },
      ],
    );

    expect(estimate.mediaSeconds).toBe(75);
    expect(estimate.learnedFromLocalSamples).toBe(1);
    expect(estimate.renderSecondsLow).toBeLessThan(estimate.renderSecondsHigh);
    expect(estimate.sizeBytesLow).toBeLessThan(estimate.sizeBytesHigh);
  });

  it('blocks missing media and low disk while keeping optional B-roll as a warning', async () => {
    installApiStub({
      getDiskSpace: async () => ({ free: 1, total: 100 * 1024 ** 3 }),
      checkMediaPaths: async (paths: string[]) => paths.map((path) => ({ path, available: false })),
    });
    const settings = {
      ...useStore.getState().settings,
      broll: { ...useStore.getState().settings.broll, enabled: true },
      pexelsApiKey: '',
    };

    const result = await runExportPreflight({
      destination: '/exports',
      sourcePaths: ['/missing/source.mp4'],
      queue: queue.slice(0, 2),
      settings,
      outputMode: 'short',
    });

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'disk-space', severity: 'blocker' }),
        expect.objectContaining({ id: 'missing-media', severity: 'blocker' }),
        expect.objectContaining({ id: 'broll-key', severity: 'warning' }),
      ]),
    );
  });
});
