import attentionUrl from '@/assets/ui-sounds/attention.mp3';
import completeUrl from '@/assets/ui-sounds/complete.mp3';
import decisionUrl from '@/assets/ui-sounds/decision.mp3';
import { getDisplayPreferences } from '@/services/display-preferences';

/** Finite creator-work cues. These files are UI-only and never enter exported media. */
export type StudioSound =
  | 'approve'
  | 'reject'
  | 'job-ready'
  | 'batch-success'
  | 'warning'
  | 'failure';

const SOURCES: Record<StudioSound, string> = {
  approve: decisionUrl,
  reject: attentionUrl,
  'job-ready': completeUrl,
  'batch-success': completeUrl,
  warning: attentionUrl,
  failure: attentionUrl,
};

const VOLUMES: Record<StudioSound, number> = {
  approve: 0.18,
  reject: 0.18,
  'job-ready': 0.24,
  'batch-success': 0.32,
  warning: 0.22,
  failure: 0.28,
};

const bases: Partial<Record<StudioSound, HTMLAudioElement>> = {};

function getBase(sound: StudioSound): HTMLAudioElement {
  let audio = bases[sound];
  if (!audio) {
    audio = new Audio(SOURCES[sound]);
    audio.preload = 'auto';
    bases[sound] = audio;
  }
  return audio;
}

/** Best-effort playback. Decode and autoplay failures never interrupt creator work. */
export function playStudioSound(sound: StudioSound): void {
  if (!getDisplayPreferences().soundEnabled) return;
  try {
    const audio = getBase(sound).cloneNode(true) as HTMLAudioElement;
    audio.volume = VOLUMES[sound];
    void audio.play().catch(() => {});
  } catch {
    // Audio is a progressive enhancement. The visible state remains authoritative.
  }
}
