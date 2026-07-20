import { Clapperboard, MonitorPlay } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatJobDuration } from '@/services/job-service';
import type { OutputMode, SourceVideo } from '@/store/types';

interface SourceMediaSummaryProps {
  source: SourceVideo;
  outputMode: OutputMode;
  cachedSourcePath?: string | null;
}

export function SourceMediaSummary({
  source,
  outputMode,
  cachedSourcePath,
}: SourceMediaSummaryProps): React.JSX.Element {
  const [waveform, setWaveform] = useState<Array<{ id: string; value: number }>>([]);
  const [waveformStatus, setWaveformStatus] = useState<'loading' | 'ready' | 'unavailable'>(
    'loading',
  );
  const playablePath = cachedSourcePath || source.path;

  useEffect(() => {
    let cancelled = false;
    if (!playablePath || source.duration <= 0) {
      setWaveform([]);
      setWaveformStatus('unavailable');
      return;
    }
    setWaveformStatus('loading');
    void window.api
      .getWaveform(playablePath, 0, source.duration, 56)
      .then((values) => {
        if (!cancelled && Array.isArray(values)) {
          setWaveform(
            values
              .filter((value) => Number.isFinite(value))
              .slice(0, 56)
              .map((value, index) => ({ id: `wave-point-${index}`, value })),
          );
          setWaveformStatus(values.length > 0 ? 'ready' : 'unavailable');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWaveform([]);
          setWaveformStatus('unavailable');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [playablePath, source.duration]);

  const outputLabel =
    outputMode === 'longform' ? '16:9 long-form · 1920×1080' : '9:16 clips · 1080×1920';

  return (
    <section aria-labelledby="processing-source-title" className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border/80 bg-muted/40">
        <div className="relative aspect-video overflow-hidden bg-muted">
          {source.thumbnail ? (
            <img
              src={source.thumbnail}
              alt={`Poster frame from ${source.name}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Clapperboard className="h-8 w-8" aria-hidden />
              <span className="sr-only">Poster frame unavailable</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2 pt-8 text-white">
            <h2
              id="processing-source-title"
              className="truncate text-xs font-semibold"
              title={source.name}
            >
              {source.name}
            </h2>
          </div>
        </div>

        {source.thumbnail && (
          <div
            className="grid h-9 grid-cols-4 gap-px border-t border-border/80 bg-border"
            aria-hidden
          >
            {[20, 40, 60, 80].map((position) => (
              <img
                key={position}
                src={source.thumbnail}
                alt=""
                className="h-full w-full object-cover opacity-80"
                style={{ objectPosition: `${position}% center` }}
              />
            ))}
          </div>
        )}

        <div
          className="flex h-10 items-center justify-center gap-px border-t border-border/80 px-2"
          style={{ backgroundColor: 'hsl(var(--card))' }}
          role="img"
          aria-label={
            waveformStatus === 'ready' ? 'Source audio waveform' : 'Source waveform status'
          }
        >
          {waveform.length > 0 ? (
            waveform.map((point) => (
              <span
                key={point.id}
                className="min-w-px flex-1 rounded-sm bg-primary/65"
                style={{ height: `${Math.max(8, Math.min(100, point.value * 100))}%` }}
                aria-hidden
              />
            ))
          ) : (
            <span className="rounded bg-black/75 px-2 py-1 text-[10px] text-white">
              {waveformStatus === 'loading'
                ? 'Preparing source waveform…'
                : 'Waveform unavailable for this source'}
            </span>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Duration</dt>
          <dd className="mt-0.5 font-mono tabular-nums text-foreground">
            {formatJobDuration(source.duration)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Source</dt>
          <dd className="mt-0.5 font-mono tabular-nums text-foreground">
            {source.width > 0 && source.height > 0
              ? `${source.width}×${source.height}`
              : 'Reading size'}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Output</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 text-foreground">
            <MonitorPlay className="h-3.5 w-3.5 text-primary" aria-hidden />
            {outputLabel}
          </dd>
        </div>
      </dl>
    </section>
  );
}
