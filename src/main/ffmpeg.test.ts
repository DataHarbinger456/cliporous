import { describe, expect, it } from 'vitest';
import { buildMediaProcessEnv } from './ffmpeg';

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
