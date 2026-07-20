import { describe, expect, it } from 'vitest';

import { classifyRenderError } from './render-error-map';

describe('classifyRenderError', () => {
  it('maps disk-full output to the shared creator-facing contract', () => {
    const result = classifyRenderError(
      'ffmpeg exited with code 1: av_interleaved_write_frame(): No space left on device',
    );
    expect(result.headline).toMatch(/not enough disk space/i);
    expect(result.whatIsSafe).toMatch(/completed outputs/i);
    expect(result.whatToDoNext).toMatch(/free up space/i);
    expect(result.recoveryAction).toBe('free-space');
    expect(result.technicalDetails).toContain('No space left on device');
  });

  it('maps missing audio stream', () => {
    const result = classifyRenderError(
      "ffmpeg exited with code 1: Stream specifier ':a' in filtergraph matches no streams",
    );
    expect(result.headline).toMatch(/no usable audio/i);
    expect(result.whatToDoNext).toMatch(/source with audio/i);
  });

  it('maps corrupt or unreadable source media', () => {
    const result = classifyRenderError('ffmpeg exited with code 1: moov atom not found');
    expect(result.headline).toMatch(/could not be read/i);
    expect(result.recoveryAction).toBe('relink');
  });

  it('maps unsupported codec', () => {
    const result = classifyRenderError('ffmpeg exited with code 1: Unknown encoder libfoo');
    expect(result.headline).toMatch(/format is not supported/i);
    expect(result.whatToDoNext).toMatch(/H\.264 MP4/i);
  });

  it('maps permission denied', () => {
    const result = classifyRenderError('ffmpeg exited with code 1: out.mp4: Permission denied');
    expect(result.headline).toMatch(/couldn't write/i);
  });

  it('gives unknown engine output safe generic copy with diagnostics', () => {
    const raw = 'ffmpeg exited with code 1: some unrecognised filter graph error xyz';
    const result = classifyRenderError(raw);
    expect(result.headline).toMatch(/could not be rendered/i);
    expect(result.whatHappened).not.toContain(raw);
    expect(result.technicalDetails).toBe(raw);
  });

  it('prioritises specific signatures over generic ones', () => {
    const result = classifyRenderError(
      'Invalid data found when processing input ... No space left on device',
    );
    expect(result.headline).toMatch(/not enough disk space/i);
  });
});
