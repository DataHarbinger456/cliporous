import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { OfflineMediaPlaceholder } from '@/components/OfflineMediaPlaceholder';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toMediaFileUrl } from '@/lib/media-url';
import { formatSourceTime } from '@/lib/transcript-review';
import type { ClipCandidate, SourceVideo } from '@/store/types';

interface ClipComparisonDialogProps {
  open: boolean;
  clips: readonly ClipCandidate[];
  source: SourceVideo | null;
  onOpenChange: (open: boolean) => void;
}

type ListeningSide = 'a' | 'b' | 'muted';

function statusLabel(status: ClipCandidate['status']): string {
  return status === 'pending' ? 'Unreviewed' : status[0]?.toUpperCase() + status.slice(1);
}

function CompareMetadata({
  clip,
  label,
}: {
  clip: ClipCandidate;
  label: string;
}): React.JSX.Element {
  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Badge variant="outline">{statusLabel(clip.status)}</Badge>
      </div>
      <h3 className="text-base font-semibold leading-snug text-foreground">
        {clip.hookText || 'Untitled clip'}
      </h3>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Score</dt>
          <dd className="mt-1 font-mono font-semibold tabular-nums">
            {clip.scoreSource === 'manual' ? 'Not scored' : `${Math.round(clip.score)}/100`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Duration</dt>
          <dd className="mt-1 font-mono font-semibold tabular-nums">{clip.duration.toFixed(1)}s</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Source</dt>
          <dd className="mt-1 font-mono font-semibold tabular-nums">
            {formatSourceTime(clip.startTime)}
          </dd>
        </div>
      </dl>
      <div className="rounded-md border border-border bg-muted/25 px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {clip.scoreSource === 'manual' ? 'Editorial note' : 'Model rationale'}
        </p>
        <p className="mt-1 text-xs leading-5 text-foreground">
          {clip.reasoning?.trim() || 'No rationale was saved for this candidate.'}
        </p>
      </div>
    </div>
  );
}

export function ClipComparisonDialog({
  open,
  clips,
  source,
  onOpenChange,
}: ClipComparisonDialogProps): React.JSX.Element {
  const clipA = clips[0] ?? null;
  const clipB = clips[1] ?? null;
  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);
  const syncingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [relativeTime, setRelativeTimeState] = useState(0);
  const [listening, setListening] = useState<ListeningSide>('muted');
  const sourceUnavailable = source?.mediaStatus === 'offline' || source?.mediaStatus === 'checking';
  const mediaUrl = source && !sourceUnavailable ? toMediaFileUrl(source.path) : null;
  const compareDuration = useMemo(
    () => (clipA && clipB ? Math.max(0.1, Math.min(clipA.duration, clipB.duration)) : 0.1),
    [clipA, clipB],
  );

  const pauseBoth = (): void => {
    videoARef.current?.pause();
    videoBRef.current?.pause();
    setPlaying(false);
  };

  const seekBoth = (seconds: number): void => {
    if (!clipA || !clipB) return;
    const clamped = Math.max(0, Math.min(compareDuration, seconds));
    syncingRef.current = true;
    try {
      if (videoARef.current) videoARef.current.currentTime = clipA.startTime + clamped;
      if (videoBRef.current) videoBRef.current.currentTime = clipB.startTime + clamped;
    } catch {
      // loadedmetadata will restore the same relative position.
    }
    syncingRef.current = false;
    setRelativeTimeState(clamped);
  };

  useEffect(() => {
    const playerA = videoARef.current;
    const playerB = videoBRef.current;
    if (!open) {
      playerA?.pause();
      playerB?.pause();
      setPlaying(false);
      return;
    }
    setRelativeTimeState(0);
    setListening('muted');
    const frame = requestAnimationFrame(() => {
      if (!clipA || !clipB) return;
      try {
        if (playerA) playerA.currentTime = clipA.startTime;
        if (playerB) playerB.currentTime = clipB.startTime;
      } catch {
        // loadedmetadata will seek again.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open, clipA, clipB]);

  useEffect(() => {
    if (videoARef.current) videoARef.current.muted = listening !== 'a';
    if (videoBRef.current) videoBRef.current.muted = listening !== 'b';
  }, [listening]);

  const togglePlayback = async (): Promise<void> => {
    if (!clipA || !clipB || !mediaUrl) return;
    if (playing) {
      pauseBoth();
      return;
    }
    if (relativeTime >= compareDuration - 0.05) seekBoth(0);
    const players = [videoARef.current, videoBRef.current].filter(
      (player): player is HTMLVideoElement => player !== null,
    );
    if (players.length !== 2) return;
    const results = await Promise.allSettled(players.map((player) => player.play()));
    if (results.every((result) => result.status === 'fulfilled')) setPlaying(true);
    else pauseBoth();
  };

  const handleLeaderTime = (): void => {
    if (!clipA || !clipB || syncingRef.current) return;
    const leader = videoARef.current;
    const follower = videoBRef.current;
    if (!leader || !follower) return;
    const nextRelative = Math.max(0, leader.currentTime - clipA.startTime);
    if (nextRelative >= compareDuration - 0.02) {
      seekBoth(compareDuration);
      pauseBoth();
      return;
    }
    setRelativeTimeState(nextRelative);
    const followerTarget = clipB.startTime + nextRelative;
    if (Math.abs(follower.currentTime - followerTarget) > 0.12) {
      syncingRef.current = true;
      try {
        follower.currentTime = followerTarget;
      } catch {
        // Keep the leader usable if the follower is still loading.
      }
      syncingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(96vw,1120px)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle>Compare two candidates</DialogTitle>
          <DialogDescription>
            Playback uses the same relative source time. Listen to one side at a time to avoid
            doubled audio.
          </DialogDescription>
        </DialogHeader>

        {!clipA || !clipB ? (
          <div className="flex min-h-64 items-center justify-center p-6 text-sm text-muted-foreground">
            Select exactly two standard clips to compare.
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                {[clipA, clipB].map((clip, index) => (
                  <article key={clip.id} className="min-w-0 bg-card">
                    <div className="bg-black">
                      {mediaUrl ? (
                        <video
                          ref={index === 0 ? videoARef : videoBRef}
                          src={mediaUrl}
                          muted
                          playsInline
                          preload="metadata"
                          className="mx-auto aspect-[9/16] max-h-[42vh] w-full object-contain"
                          aria-label={`Candidate ${index === 0 ? 'A' : 'B'} preview`}
                          onLoadedMetadata={() => seekBoth(relativeTime)}
                          onTimeUpdate={index === 0 ? handleLeaderTime : undefined}
                          onPause={() => {
                            if (index === 0 && playing && !syncingRef.current) pauseBoth();
                          }}
                        />
                      ) : sourceUnavailable ? (
                        <div className="mx-auto aspect-[9/16] max-h-[42vh]">
                          <OfflineMediaPlaceholder
                            fileName={source?.name ?? 'Source media'}
                            status={source?.mediaStatus === 'checking' ? 'checking' : 'offline'}
                          />
                        </div>
                      ) : (
                        <div className="flex aspect-[9/16] max-h-[42vh] items-center justify-center text-sm text-white/70">
                          No source video
                        </div>
                      )}
                    </div>
                    <CompareMetadata
                      clip={clip}
                      label={index === 0 ? 'Candidate A' : 'Candidate B'}
                    />
                  </article>
                ))}
              </div>
            </div>

            <footer className="shrink-0 border-t border-border bg-background px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void togglePlayback()}
                  disabled={!mediaUrl}
                  aria-label={playing ? 'Pause both candidates' : 'Play both candidates'}
                >
                  {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                  {playing ? 'Pause both' : 'Play both'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    pauseBoth();
                    seekBoth(0);
                  }}
                  disabled={!mediaUrl}
                >
                  <RotateCcw aria-hidden="true" />
                  Restart
                </Button>
                <fieldset className="flex items-center gap-1">
                  <legend className="sr-only">Comparison audio</legend>
                  {(['muted', 'a', 'b'] as const).map((side) => (
                    <Button
                      key={side}
                      type="button"
                      size="sm"
                      variant={listening === side ? 'secondary' : 'ghost'}
                      aria-pressed={listening === side}
                      onClick={() => setListening(side)}
                    >
                      {side === 'muted' ? (
                        <VolumeX aria-hidden="true" />
                      ) : (
                        <Volume2 aria-hidden="true" />
                      )}
                      {side === 'muted' ? 'Muted' : `Listen ${side.toUpperCase()}`}
                    </Button>
                  ))}
                </fieldset>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="w-12 text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {relativeTime.toFixed(1)}s
                </span>
                <input
                  type="range"
                  min={0}
                  max={compareDuration}
                  step={0.1}
                  value={Math.min(relativeTime, compareDuration)}
                  onChange={(event) => {
                    pauseBoth();
                    seekBoth(Number(event.target.value));
                  }}
                  className="h-8 min-w-0 flex-1 accent-primary"
                  aria-label="Synchronized comparison position"
                />
                <span className="w-12 font-mono text-xs tabular-nums text-muted-foreground">
                  {compareDuration.toFixed(1)}s
                </span>
              </div>
              <p className="mt-1 text-center text-[11px] text-muted-foreground">
                The synchronized window ends with the shorter candidate. Full durations remain
                listed above.
              </p>
            </footer>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
