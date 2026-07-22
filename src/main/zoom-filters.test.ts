import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { describe, expect, it } from 'vitest';
import { buildSnapZoom } from './zoom-filters';

function maximumParenthesisDepth(value: string): number {
  let depth = 0;
  let maximum = 0;
  for (const character of value) {
    if (character === '(') {
      depth++;
      maximum = Math.max(maximum, depth);
    } else if (character === ')') {
      depth--;
    }
  }
  expect(depth).toBe(0);
  return maximum;
}

describe('buildSnapZoom', () => {
  it('uses a per-frame zoom filter with a fixed output canvas', () => {
    const filter = buildSnapZoom({
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 10,
      zoomIntensity: 1.12,
      emphasisTimestamps: [{ time: 2, duration: 1 }],
    });

    expect(filter).toContain("zoompan=z='if(isnan(in_time),1,");
    expect(filter).toContain(':d=1:s=1920x1080:fps=30');
    expect(filter).not.toContain('crop=w=');
  });

  it('keeps hundreds of emphasis beats in a balanced FFmpeg expression', () => {
    const emphasisTimestamps = Array.from({ length: 180 }, (_, index) => ({
      time: index * 3 + 1,
      duration: 0.8,
    }));

    const filter = buildSnapZoom({
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 600,
      zoomIntensity: 1.12,
      emphasisTimestamps,
    });

    expect(filter).toContain('between(in_time,537.933,538.867)');
    expect(filter.match(/between\(in_time/g)).toHaveLength(180);
    expect(maximumParenthesisDepth(filter)).toBeLessThan(30);

    expect(ffmpegPath).toBeTruthy();
    const parsed = spawnSync(
      ffmpegPath as string,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=size=320x180:rate=30:duration=0.04',
        '-vf',
        filter,
        '-frames:v',
        '1',
        '-f',
        'null',
        '-',
      ],
      { encoding: 'utf8' },
    );
    expect(parsed.status, parsed.stderr).toBe(0);
  });

  it('ignores emphasis beats outside the clip', () => {
    const filter = buildSnapZoom({
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 10,
      zoomIntensity: 1.12,
      emphasisTimestamps: [{ time: 20, duration: 1 }],
    });

    expect(filter).toBe('');
  });
});
