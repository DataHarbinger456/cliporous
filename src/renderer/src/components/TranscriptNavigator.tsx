import { CornerDownRight, Flag, Play, Scissors, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { OfflineMediaPlaceholder } from '@/components/OfflineMediaPlaceholder';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toMediaFileUrl } from '@/lib/media-url';
import {
  formatSourceTime,
  searchTranscriptWords,
  transcriptPassages,
  transcriptTextForRange,
} from '@/lib/transcript-review';
import { cn } from '@/lib/utils';
import type {
  ClipCandidate,
  SourceVideo,
  StitchedClipCandidate,
  TranscriptionData,
} from '@/store/types';

type ReviewClip = ClipCandidate | StitchedClipCandidate;

interface TranscriptNavigatorProps {
  open: boolean;
  source: SourceVideo | null;
  transcription: TranscriptionData | null;
  selectedClip: ReviewClip | null;
  onOpenChange: (open: boolean) => void;
  onCreateCandidate: (start: number, end: number, text: string) => void;
}

interface RangeSelection {
  start: number;
  end: number;
}

function clipRanges(clip: ReviewClip | null): RangeSelection[] {
  if (!clip) return [];
  if ('startTime' in clip) return [{ start: clip.startTime, end: clip.endTime }];
  return clip.sourceRanges.map((range) => ({
    start: range.startTime,
    end: range.endTime,
  }));
}

function rangesOverlap(
  leftStart: number,
  leftEnd: number,
  ranges: readonly RangeSelection[],
): boolean {
  return ranges.some((range) => leftEnd >= range.start && leftStart <= range.end);
}

export function TranscriptNavigator({
  open,
  source,
  transcription,
  selectedClip,
  onOpenChange,
  onCreateCandidate,
}: TranscriptNavigatorProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<RangeSelection | null>(null);
  const [jumpedTo, setJumpedTo] = useState<number | null>(null);
  const selectedClipRanges = useMemo(() => clipRanges(selectedClip), [selectedClip]);
  const words = transcription?.words ?? [];
  const passages = useMemo(
    () => transcriptPassages(transcription?.segments ?? [], words),
    [transcription?.segments, words],
  );
  const searchResults = useMemo(() => searchTranscriptWords(words, query), [query, words]);
  const searching = query.trim().length > 0;
  const visibleSearchResults = searchResults.slice(0, 200);
  const selectedText = selection
    ? transcriptTextForRange(words, selection.start, selection.end)
    : '';
  const canCreate =
    selection !== null && selection.end - selection.start >= 1 && selectedText.trim().length > 0;
  const sourceUnavailable =
    !source || source.mediaStatus === 'offline' || source.mediaStatus === 'checking';

  useEffect(() => {
    if (!open) return;
    setSelection(null);
    setJumpedTo(null);
  }, [open]);

  const jumpTo = (seconds: number): void => {
    const video = videoRef.current;
    if (video) {
      try {
        video.currentTime = seconds;
      } catch {
        // Metadata can arrive after the click; the status still preserves intent.
      }
    }
    setJumpedTo(seconds);
  };

  const setRangeStart = (start: number, fallbackEnd: number): void => {
    setSelection((current) => {
      if (!current || start >= current.end) return { start, end: fallbackEnd };
      return { ...current, start };
    });
  };

  const setRangeEnd = (end: number, fallbackStart: number): void => {
    setSelection((current) => {
      if (!current || end <= current.start) return { start: fallbackStart, end };
      return { ...current, end };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88vh,820px)] w-[min(96vw,1100px)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle>Search source transcript</DialogTitle>
          <DialogDescription>
            Find a phrase, jump the source player, or mark a transcript range for a new candidate.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 min-[760px]:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
          <section className="flex min-h-0 flex-col border-b border-border bg-muted/20 min-[760px]:border-b-0 min-[760px]:border-r">
            <div className="shrink-0 p-4">
              <div className="overflow-hidden rounded-lg border border-border bg-black">
                {source && !sourceUnavailable ? (
                  <video
                    ref={videoRef}
                    src={toMediaFileUrl(source.path)}
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    className="aspect-video w-full object-contain"
                    aria-label={`Source video: ${source.name}`}
                  />
                ) : source ? (
                  <div className="aspect-video">
                    <OfflineMediaPlaceholder
                      fileName={source.name}
                      status={source.mediaStatus === 'checking' ? 'checking' : 'offline'}
                    />
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center text-sm text-white/70">
                    No source video
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground" role="status" aria-live="polite">
                {jumpedTo === null
                  ? 'Choose Jump beside a result. Playback stays paused until you press Play.'
                  : `Source player moved to ${formatSourceTime(jumpedTo)}.`}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto border-t border-border p-4">
              <h3 className="text-sm font-semibold">
                {selectedClipRanges.length > 1 ? 'Selected clip ranges' : 'Selected clip range'}
              </h3>
              {selectedClip && selectedClipRanges.length > 0 ? (
                <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                  <div className="space-y-1">
                    {selectedClipRanges.map((range, index) => (
                      <Button
                        key={`${range.start}-${range.end}`}
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="w-full justify-start px-2 font-mono text-xs tabular-nums text-primary"
                        onClick={() => jumpTo(range.start)}
                        disabled={sourceUnavailable}
                      >
                        <Play aria-hidden="true" />
                        {selectedClipRanges.length > 1 ? `Range ${index + 1}: ` : ''}
                        {formatSourceTime(range.start)} to {formatSourceTime(range.end)}
                      </Button>
                    ))}
                  </div>
                  <p className="mt-2 line-clamp-6 text-sm leading-6 text-foreground">
                    {selectedClip.text || 'No transcript text is saved for this clip.'}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Select a clip in the contact sheet to keep its source range in view.
                </p>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="shrink-0 space-y-3 border-b border-border p-4">
              <label htmlFor="transcript-search" className="text-sm font-medium">
                Words or phrase
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="transcript-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search the full transcript"
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
                {searching
                  ? `${searchResults.length} ${searchResults.length === 1 ? 'match' : 'matches'}`
                  : `${passages.length} transcript ${passages.length === 1 ? 'passage' : 'passages'}`}
                {searchResults.length > visibleSearchResults.length
                  ? `, showing the first ${visibleSearchResults.length}`
                  : ''}
              </p>

              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold">Candidate range</p>
                    <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                      {selection
                        ? `${formatSourceTime(selection.start)} to ${formatSourceTime(selection.end)} · ${(selection.end - selection.start).toFixed(1)}s`
                        : 'Set a start and end from the transcript.'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canCreate}
                    onClick={() => {
                      if (!selection || !canCreate) return;
                      onCreateCandidate(selection.start, selection.end, selectedText);
                    }}
                  >
                    <Scissors aria-hidden="true" />
                    Create candidate
                  </Button>
                </div>
                {selection && (
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                    {selectedText || 'No timed words fall inside this range.'}
                  </p>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3" data-transcript-results="true">
              {!transcription ? (
                <div className="flex min-h-40 items-center justify-center text-center text-sm text-muted-foreground">
                  No source transcript is available.
                </div>
              ) : searching && visibleSearchResults.length === 0 ? (
                <div className="flex min-h-40 items-center justify-center text-center text-sm text-muted-foreground">
                  No transcript matches “{query.trim()}”.
                </div>
              ) : (
                <ul className="space-y-2">
                  {(searching ? visibleSearchResults : passages).map((result) => {
                    const start = result.start;
                    const end = result.end;
                    const text =
                      'match' in result
                        ? [result.before, result.match, result.after].filter(Boolean).join(' ')
                        : result.text;
                    const inSelectedClip = rangesOverlap(start, end, selectedClipRanges);
                    const isChosen = rangesOverlap(start, end, selection ? [selection] : []);
                    return (
                      <li
                        key={result.id}
                        className={cn(
                          'rounded-lg border p-3 transition-[border-color,background-color] duration-150',
                          inSelectedClip
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-border bg-card',
                          isChosen && 'ring-1 ring-primary/35',
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                              {formatSourceTime(start)} to {formatSourceTime(end)}
                              {inSelectedClip ? ' · Selected clip' : ''}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-foreground">
                              {'match' in result ? (
                                <>
                                  {result.before ? `${result.before} ` : ''}
                                  <mark className="rounded-sm bg-primary/20 px-0.5 text-foreground">
                                    {result.match}
                                  </mark>
                                  {result.after ? ` ${result.after}` : ''}
                                </>
                              ) : (
                                text
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => jumpTo(start)}
                            disabled={sourceUnavailable}
                          >
                            <CornerDownRight aria-hidden="true" />
                            Jump
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setSelection({ start, end })}
                          >
                            <Scissors aria-hidden="true" />
                            Use result
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setRangeStart(start, end)}
                          >
                            <Flag aria-hidden="true" />
                            Set start
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setRangeEnd(end, start)}
                          >
                            <Flag aria-hidden="true" />
                            Set end
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
