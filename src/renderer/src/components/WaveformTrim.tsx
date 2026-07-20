import * as SliderPrimitive from '@radix-ui/react-slider';
import type { WordTimestamp } from '@shared/types';
import { RotateCcw, Waves } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FillerSegmentUI } from '@/store/types';

const WAVEFORM_POINTS = 180;
const waveformCache = new Map<string, number[]>();

type WaveformStatus = 'loading' | 'ready' | 'unavailable';

interface TimeBand {
  start: number;
  end: number;
}

interface WaveformTrimProps {
  sourcePath: string;
  sourceDuration: number;
  value: [number, number];
  step: number;
  words?: WordTimestamp[] | undefined;
  fillerSegments?: FillerSegmentUI[] | undefined;
  autoRange?: [number, number] | undefined;
  onValueChange: (value: [number, number]) => void;
  onValueCommit: (value: [number, number]) => void;
  onResetAuto: () => void;
}

function clampPercent(time: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.max(0, Math.min(100, (time / duration) * 100));
}

function speechGaps(words: WordTimestamp[] | undefined): TimeBand[] {
  if (!words || words.length < 2) return [];
  const sorted = [...words].sort((left, right) => left.start - right.start);
  const gaps: TimeBand[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (!previous || !current) continue;
    const gap = current.start - previous.end;
    if (gap >= 0.5) gaps.push({ start: previous.end, end: current.start });
  }
  return gaps;
}

function waveformCacheKey(path: string, duration: number): string {
  return `${path}:${duration}:${WAVEFORM_POINTS}`;
}

export function WaveformTrim({
  sourcePath,
  sourceDuration,
  value,
  step,
  words,
  fillerSegments,
  autoRange,
  onValueChange,
  onValueCommit,
  onResetAuto,
}: WaveformTrimProps): React.JSX.Element {
  const cacheKey = waveformCacheKey(sourcePath, sourceDuration);
  const cachedWaveform = waveformCache.get(cacheKey);
  const [waveform, setWaveform] = useState<number[]>(cachedWaveform ?? []);
  const [status, setStatus] = useState<WaveformStatus>(cachedWaveform ? 'ready' : 'loading');

  useEffect(() => {
    const cached = waveformCache.get(cacheKey);
    if (cached) {
      setWaveform(cached);
      setStatus('ready');
      return;
    }
    if (!sourcePath || sourceDuration <= 0) {
      setWaveform([]);
      setStatus('unavailable');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    void window.api
      .getWaveform(sourcePath, 0, sourceDuration, WAVEFORM_POINTS)
      .then((values) => {
        if (cancelled) return;
        const normalized = values
          .filter((point) => Number.isFinite(point))
          .slice(0, WAVEFORM_POINTS)
          .map((point) => Math.max(0, Math.min(1, point)));
        if (normalized.length === 0) {
          setWaveform([]);
          setStatus('unavailable');
          return;
        }
        waveformCache.set(cacheKey, normalized);
        setWaveform(normalized);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setWaveform([]);
          setStatus('unavailable');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, sourceDuration, sourcePath]);

  const gaps = useMemo(() => speechGaps(words), [words]);
  const cutBoundaries = useMemo(
    () =>
      (fillerSegments ?? [])
        .flatMap((segment) => [segment.start, segment.end])
        .filter((time) => time >= 0 && time <= sourceDuration),
    [fillerSegments, sourceDuration],
  );
  const startPercent = clampPercent(value[0], sourceDuration);
  const endPercent = clampPercent(value[1], sourceDuration);
  const resetDisabled = !autoRange || (value[0] === autoRange[0] && value[1] === autoRange[1]);
  const statusLabel =
    status === 'loading'
      ? 'Extracting source waveform'
      : status === 'unavailable'
        ? 'Waveform unavailable. Trim controls remain available.'
        : `Source waveform with ${gaps.length} speech gaps and ${cutBoundaries.length} suggested cut boundaries.`;

  return (
    <div className="space-y-2">
      <div className="relative h-20 overflow-hidden rounded-md border border-border bg-muted/45">
        <div
          className="absolute inset-0 flex items-center gap-px px-1.5"
          role="img"
          aria-label={statusLabel}
        >
          {status === 'ready' ? (
            waveform.map((point, index) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: Waveform samples are immutable ordered signal points.
                key={`${cacheKey}-${index}`}
                className="min-w-px flex-1 rounded-sm bg-muted-foreground/50"
                style={{ height: `${Math.max(6, point * 88)}%` }}
                aria-hidden="true"
              />
            ))
          ) : (
            <span className="mx-auto flex items-center gap-2 text-xs text-muted-foreground">
              <Waves
                className={cn('h-4 w-4', status === 'loading' && 'animate-pulse')}
                aria-hidden
              />
              {status === 'loading' ? 'Preparing waveform…' : 'Waveform unavailable'}
            </span>
          )}
        </div>

        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-background/70"
          style={{ width: `${startPercent}%` }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 bg-background/70"
          style={{ width: `${100 - endPercent}%` }}
          aria-hidden="true"
        />

        {gaps.map((gap) => (
          <span
            key={`${gap.start}-${gap.end}`}
            className="pointer-events-none absolute bottom-1 top-1 border-x border-dashed border-amber-500/80 bg-amber-500/10"
            style={{
              left: `${clampPercent(gap.start, sourceDuration)}%`,
              width: `${Math.max(0.35, clampPercent(gap.end - gap.start, sourceDuration))}%`,
            }}
            aria-hidden="true"
          />
        ))}
        {cutBoundaries.map((time) => (
          <span
            key={time}
            className="pointer-events-none absolute inset-y-0 border-l-2 border-primary/75"
            style={{ left: `${clampPercent(time, sourceDuration)}%` }}
            aria-hidden="true"
          />
        ))}

        <SliderPrimitive.Root
          min={0}
          max={Math.max(sourceDuration, value[1])}
          step={step}
          minStepsBetweenThumbs={1}
          value={value}
          onValueChange={(next) => {
            const start = next[0];
            const end = next[1];
            if (start !== undefined && end !== undefined) onValueChange([start, end]);
          }}
          onValueCommit={(next) => {
            const start = next[0];
            const end = next[1];
            if (start !== undefined && end !== undefined) onValueCommit([start, end]);
          }}
          className="absolute inset-0 flex w-full touch-none select-none items-center"
        >
          <SliderPrimitive.Track className="relative h-full w-full grow">
            <SliderPrimitive.Range className="absolute inset-y-0 border-y-2 border-primary bg-primary/10" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-label="Trim start"
            aria-valuetext={`${value[0].toFixed(1)} seconds`}
            className="block h-12 w-6 rounded-sm border-2 border-primary bg-background shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <SliderPrimitive.Thumb
            aria-label="Trim end"
            aria-valuetext={`${value[1].toFixed(1)} seconds`}
            className="block h-12 w-6 rounded-sm border-2 border-primary bg-background shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </SliderPrimitive.Root>
      </div>

      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-hidden="true">
          {gaps.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-3 border-l border-dashed border-amber-500" /> Speech gap
            </span>
          )}
          {cutBoundaries.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-3 border-l-2 border-primary" /> Suggested cut
            </span>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          disabled={resetDisabled}
          onClick={onResetAuto}
        >
          <RotateCcw aria-hidden="true" />
          Reset to Auto
        </Button>
      </div>
    </div>
  );
}
