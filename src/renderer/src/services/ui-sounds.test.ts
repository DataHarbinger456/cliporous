import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DISPLAY_PREFERENCES, setDisplayPreferences } from '@/services/display-preferences';
import { playStudioSound } from './ui-sounds';

const play = vi.fn(async () => undefined);
const cloneNode = vi.fn(() => ({ volume: 0, play }));
const AudioMock = vi.fn(function AudioElementMock() {
  return { preload: '', cloneNode };
});

beforeEach(() => {
  vi.clearAllMocks();
  setDisplayPreferences({ ...DEFAULT_DISPLAY_PREFERENCES });
  vi.stubGlobal('Audio', AudioMock);
});

describe('studio sound cues', () => {
  it('stays silent until the creator opts in', () => {
    playStudioSound('approve');
    expect(AudioMock).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it('plays a finite best-effort cue after opt-in', () => {
    setDisplayPreferences({ soundEnabled: true });
    expect(() => playStudioSound('batch-success')).not.toThrow();
    expect(AudioMock).toHaveBeenCalledTimes(1);
    expect(cloneNode).toHaveBeenCalledWith(true);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
