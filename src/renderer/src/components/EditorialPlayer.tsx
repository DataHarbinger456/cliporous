import {
  FastForward,
  Pause,
  Play,
  Redo2,
  Rewind,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const FRAME_SECONDS = 1 / 30;
const VOLUME_STORAGE_KEY = 'batchclip-review-player-audio';
const EDITORIAL_PLAYER_COMMAND_EVENT = 'batchclip:editorial-player-command';

export type EditorialPlayerCommand =
  | 'seek-back-5'
  | 'seek-forward-5'
  | 'nudge-back-frame'
  | 'nudge-forward-frame'
  | 'nudge-back-100ms'
  | 'nudge-forward-100ms'
  | 'replay'
  | 'toggle-loop';

export function dispatchEditorialPlayerCommand(command: EditorialPlayerCommand): void {
  window.dispatchEvent(
    new CustomEvent<EditorialPlayerCommand>(EDITORIAL_PLAYER_COMMAND_EVENT, { detail: command }),
  );
}

interface SavedAudioPreference {
  volume: number;
  muted: boolean;
}

function readAudioPreference(): SavedAudioPreference {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (!raw) return { volume: 0.75, muted: true };
    const saved = JSON.parse(raw) as Partial<SavedAudioPreference>;
    return {
      volume:
        typeof saved.volume === 'number' && Number.isFinite(saved.volume)
          ? Math.max(0, Math.min(1, saved.volume))
          : 0.75,
      muted: typeof saved.muted === 'boolean' ? saved.muted : true,
    };
  } catch {
    return { volume: 0.75, muted: true };
  }
}

function saveAudioPreference(preference: SavedAudioPreference): void {
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Playback remains usable when storage is unavailable.
  }
}

function formatPlayerTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${minutes}:${remainder.toFixed(1).padStart(4, '0')}`;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && target.closest('button, input, select, textarea') !== null
  );
}

interface EditorialPlayerProps {
  src: string;
  label: string;
  selectionStart: number;
  selectionEnd: number;
  initialTime?: number | undefined;
  videoRef?: RefObject<HTMLVideoElement | null> | undefined;
  className?: string | undefined;
  layout?: 'stacked' | 'side-by-side' | 'responsive' | undefined;
  children?: React.ReactNode | undefined;
  onTimeChange?: ((seconds: number) => void) | undefined;
  onMediaError?: (() => void) | undefined;
}

export function EditorialPlayer({
  src,
  label,
  selectionStart,
  selectionEnd,
  initialTime,
  videoRef: forwardedVideoRef,
  className,
  layout = 'stacked',
  children,
  onTimeChange,
  onMediaError,
}: EditorialPlayerProps): React.JSX.Element {
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoRef = forwardedVideoRef ?? internalVideoRef;
  const [{ volume, muted }, setAudioPreference] = useState(readAudioPreference);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopSelection, setLoopSelection] = useState(false);
  const [currentTime, setCurrentTime] = useState(selectionStart);
  const [mediaError, setMediaError] = useState(false);
  const rangeStartRef = useRef(selectionStart);
  const rangeEndRef = useRef(selectionEnd);
  const initialTimeRef = useRef(initialTime);
  const loopRef = useRef(loopSelection);
  const commandHandlerRef = useRef<(command: EditorialPlayerCommand) => void>(() => {});
  initialTimeRef.current = initialTime;

  useEffect(() => {
    rangeStartRef.current = selectionStart;
    rangeEndRef.current = selectionEnd;
  }, [selectionEnd, selectionStart]);

  useEffect(() => {
    loopRef.current = loopSelection;
  }, [loopSelection]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setIsPlaying(false);
    setMediaError(false);
    video.dataset.previewSource = src;
    const rangeStart = rangeStartRef.current;
    const rangeEnd = rangeEndRef.current;
    const target = Math.max(rangeStart, Math.min(initialTimeRef.current ?? rangeStart, rangeEnd));
    const seek = (): void => {
      try {
        video.currentTime = target;
        setCurrentTime(target);
      } catch {
        // loadedmetadata retries below when the media timeline is available.
      }
    };
    if (video.readyState >= 1) seek();
    else video.addEventListener('loadedmetadata', seek, { once: true });
    return () => video.removeEventListener('loadedmetadata', seek);
  }, [src, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
  }, [muted, videoRef, volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = (): void => setIsPlaying(true);
    const handlePause = (): void => setIsPlaying(false);
    const handleTimeUpdate = (): void => {
      const end = rangeEndRef.current;
      if (video.currentTime >= end - 0.015) {
        if (loopRef.current) {
          video.currentTime = rangeStartRef.current;
          void video.play().catch(() => setIsPlaying(false));
        } else {
          video.pause();
          video.currentTime = end;
        }
      }
      setCurrentTime(video.currentTime);
      onTimeChange?.(video.currentTime);
    };
    const handleSeeked = (): void => {
      setCurrentTime(video.currentTime);
      onTimeChange?.(video.currentTime);
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('seeked', handleSeeked);
    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('seeked', handleSeeked);
    };
  }, [onTimeChange, videoRef]);

  const seekTo = (seconds: number, pause = false): void => {
    const video = videoRef.current;
    if (!video) return;
    if (pause) video.pause();
    const next = Math.max(selectionStart, Math.min(seconds, selectionEnd));
    try {
      video.currentTime = next;
      setCurrentTime(next);
      onTimeChange?.(next);
    } catch {
      // Media metadata is not ready yet; the player stays at its current position.
    }
  };

  const togglePlayback = (): void => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    if (video.currentTime < selectionStart || video.currentTime >= selectionEnd - 0.015) {
      seekTo(selectionStart);
    }
    void video.play().catch(() => setIsPlaying(false));
  };

  const replaySelection = (): void => {
    const video = videoRef.current;
    if (!video) return;
    seekTo(selectionStart);
    void video.play().catch(() => setIsPlaying(false));
  };

  const updateAudio = (next: SavedAudioPreference): void => {
    const preference = {
      volume: Math.max(0, Math.min(1, next.volume)),
      muted: next.muted,
    };
    setAudioPreference(preference);
    saveAudioPreference(preference);
    const video = videoRef.current;
    if (video) {
      video.volume = preference.volume;
      video.muted = preference.muted;
    }
  };

  commandHandlerRef.current = (command) => {
    const mediaTime = videoRef.current?.currentTime ?? currentTime;
    switch (command) {
      case 'seek-back-5':
        seekTo(mediaTime - 5);
        break;
      case 'seek-forward-5':
        seekTo(mediaTime + 5);
        break;
      case 'nudge-back-frame':
        seekTo(mediaTime - FRAME_SECONDS, true);
        break;
      case 'nudge-forward-frame':
        seekTo(mediaTime + FRAME_SECONDS, true);
        break;
      case 'nudge-back-100ms':
        seekTo(mediaTime - 0.1, true);
        break;
      case 'nudge-forward-100ms':
        seekTo(mediaTime + 0.1, true);
        break;
      case 'replay':
        replaySelection();
        break;
      case 'toggle-loop':
        setLoopSelection((current) => !current);
        break;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const commaKey = event.code === 'Comma' || key === ',' || key === '<';
    const periodKey = event.code === 'Period' || key === '.' || key === '>';
    let command: EditorialPlayerCommand | null = null;
    if (key === 'l') command = 'toggle-loop';
    else if (key === '0') command = 'replay';
    else if (event.key === '[') command = 'seek-back-5';
    else if (event.key === ']') command = 'seek-forward-5';
    else if (commaKey) command = event.shiftKey ? 'nudge-back-100ms' : 'nudge-back-frame';
    else if (periodKey) command = event.shiftKey ? 'nudge-forward-100ms' : 'nudge-forward-frame';

    if (command) {
      event.preventDefault();
      commandHandlerRef.current(command);
      return;
    }
    if (event.key === ' ' && !isInteractiveTarget(event.target)) {
      event.preventDefault();
      togglePlayback();
    }
  };

  useEffect(() => {
    const handleCommand = (event: Event): void => {
      commandHandlerRef.current((event as CustomEvent<EditorialPlayerCommand>).detail);
    };
    window.addEventListener(EDITORIAL_PLAYER_COMMAND_EVENT, handleCommand);
    return () => window.removeEventListener(EDITORIAL_PLAYER_COMMAND_EVENT, handleCommand);
  }, []);

  return (
    <section
      data-editorial-player="true"
      className={cn(
        'bg-black text-white',
        layout === 'side-by-side' && 'grid grid-cols-[150px_minmax(0,1fr)] items-stretch',
        layout === 'responsive' &&
          'min-[700px]:grid min-[700px]:grid-cols-[150px_minmax(0,1fr)] min-[700px]:items-stretch',
        className,
      )}
      onKeyDown={handleKeyDown}
      aria-label={`${label} editorial player`}
    >
      <div
        className={cn(
          'relative mx-auto aspect-[9/16] w-full overflow-hidden bg-black',
          layout === 'side-by-side' && 'max-w-[150px]',
          layout === 'stacked' && 'max-w-[260px]',
          layout === 'responsive' && 'max-w-[220px] min-[700px]:max-w-[150px]',
        )}
      >
        <video
          ref={videoRef}
          data-review-player="true"
          src={src}
          playsInline
          preload="metadata"
          muted={muted}
          aria-label={label}
          onError={() => {
            setMediaError(true);
            onMediaError?.();
          }}
          className="h-full w-full object-contain"
        />
        {children}
        {mediaError && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/85 p-5 text-center text-xs text-white"
            role="status"
          >
            This preview could not be played. The edit controls are still safe to use.
          </div>
        )}
      </div>

      <div
        className={cn(
          'space-y-2 bg-black/95 px-3 py-2.5',
          layout === 'side-by-side' && 'border-l border-white/15',
          layout === 'stacked' && 'border-t border-white/15',
          layout === 'responsive' &&
            'border-t border-white/15 min-[700px]:border-l min-[700px]:border-t-0',
        )}
      >
        <div className="flex items-center gap-2">
          <span className="w-11 font-mono text-[10px] tabular-nums text-white/75">
            {formatPlayerTime(currentTime - selectionStart)}
          </span>
          <input
            type="range"
            min={selectionStart}
            max={Math.max(selectionStart + 0.001, selectionEnd)}
            step={FRAME_SECONDS}
            value={Math.max(selectionStart, Math.min(currentTime, selectionEnd))}
            onChange={(event) => seekTo(Number(event.target.value), true)}
            aria-label="Preview playhead"
            className="h-6 min-w-0 flex-1 accent-primary"
          />
          <span className="w-11 text-right font-mono text-[10px] tabular-nums text-white/75">
            {formatPlayerTime(selectionEnd - selectionStart)}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
              onClick={() => seekTo(currentTime - 5)}
              aria-label="Seek back 5 seconds"
              aria-keyshortcuts="["
              title="Back 5 seconds ([)"
            >
              <Rewind aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
              onClick={() => seekTo(currentTime - FRAME_SECONDS, true)}
              aria-label="Nudge back one frame"
              aria-keyshortcuts=","
              title="Back one frame (,)"
            >
              <SkipBack aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon"
              className="h-9 w-9"
              onClick={togglePlayback}
              aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
              aria-keyshortcuts="Space"
            >
              {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
              onClick={() => seekTo(currentTime + FRAME_SECONDS, true)}
              aria-label="Nudge forward one frame"
              aria-keyshortcuts="."
              title="Forward one frame (.)"
            >
              <SkipForward aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
              onClick={() => seekTo(currentTime + 5)}
              aria-label="Seek forward 5 seconds"
              aria-keyshortcuts="]"
              title="Forward 5 seconds (])"
            >
              <FastForward aria-hidden="true" />
            </Button>
          </div>

          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
              onClick={replaySelection}
              aria-label="Replay selection"
              aria-keyshortcuts="0"
              title="Replay selection (0)"
            >
              <RotateCcw aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={loopSelection ? 'secondary' : 'ghost'}
              className={cn(
                'h-8 w-8',
                loopSelection ? 'text-foreground' : 'text-white hover:bg-white/15 hover:text-white',
              )}
              onClick={() => setLoopSelection((current) => !current)}
              aria-label="Loop selection"
              aria-pressed={loopSelection}
              aria-keyshortcuts="L"
              title="Loop selection (L)"
            >
              <Redo2 aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
              onClick={() => updateAudio({ volume, muted: !muted })}
              aria-label={muted ? 'Unmute preview' : 'Mute preview'}
              aria-pressed={muted}
            >
              {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
            </Button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(event) =>
                updateAudio({ volume: Number(event.target.value), muted: false })
              }
              aria-label="Preview volume"
              className="h-8 w-16 accent-primary"
            />
          </div>
        </div>
        <p className="sr-only">
          Shortcuts: Space play or pause, brackets seek five seconds, comma and period nudge one
          frame, Shift plus comma or period nudges 100 milliseconds, zero replays, and L loops the
          selection.
        </p>
      </div>
    </section>
  );
}
