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

  it('stays silent after opt-in while cleared replacement cues are unavailable', () => {
    setDisplayPreferences({ soundEnabled: true });
    expect(() => playStudioSound('batch-success')).not.toThrow();
    expect(AudioMock).not.toHaveBeenCalled();
    expect(cloneNode).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });
});
