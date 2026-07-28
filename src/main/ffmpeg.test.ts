import { describe, expect, it } from 'vitest';
import { buildMediaProcessEnv, isGpuSessionError } from './ffmpeg';

describe('isGpuSessionError', () => {
  it('detects macOS VideoToolbox hardware decode failures for software fallback', () => {
    // Real stderr from a failed preview render — tagged [h264 @ ...] so the
    // encoder tag pattern never matches; the text markers must catch it.
    const vtFailure =
      'ffmpeg exited with code 69: [h264 @ 0x703021880] vt decoder cb: output image buffer is null: -12909, reconfig 1\n' +
      '[h264 @ 0x703023b80] hardware accelerator failed to decode picture\n' +
      '[vist#0:0/h264 @ 0x703014180] [dec:h264 @ 0x702c14640] Decode error rate 0.832224 exceeds maximum 0.666667';
    expect(isGpuSessionError(vtFailure)).toBe(true);
  });

  it('ignores unrelated FFmpeg errors', () => {
    expect(isGpuSessionError('[mp4 @ 0x1] moov atom not found')).toBe(false);
    expect(isGpuSessionError('No such file or directory')).toBe(false);
  });
});

describe('buildMediaProcessEnv', () => {
  const ffprobePath =
    '/Applications/BatchClip.app/Contents/Resources/app.asar.unpacked/node_modules/@remotion/compositor-darwin-arm64/ffprobe';
  const libraryDir = ffprobePath.slice(0, ffprobePath.lastIndexOf('/'));

  it('points dyld at Remotion shared libraries on macOS', () => {
    expect(buildMediaProcessEnv(ffprobePath, 'darwin', { PATH: '/usr/bin' }, ':')).toEqual({
      PATH: '/usr/bin',
      DYLD_LIBRARY_PATH: libraryDir,
    });
  });

  it('preserves an existing dyld library path', () => {
    const env = buildMediaProcessEnv(
      ffprobePath,
      'darwin',
      { DYLD_LIBRARY_PATH: '/custom/lib' },
      ':',
    );

    expect(env.DYLD_LIBRARY_PATH).toBe(`${libraryDir}:/custom/lib`);
  });

  it('does not modify unrelated binaries or platforms', () => {
    expect(buildMediaProcessEnv('/usr/bin/ffprobe', 'darwin', { PATH: '/usr/bin' }, ':')).toEqual({
      PATH: '/usr/bin',
    });
    expect(buildMediaProcessEnv(ffprobePath, 'win32', { PATH: 'C:\\Windows' }, ';')).toEqual({
      PATH: 'C:\\Windows',
    });
  });
});
