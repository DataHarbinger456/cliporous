import type { Palette } from '@shared/palettes';
import type { BlockPlacement, LongformSkinId } from '@shared/types';
import { AlertTriangle, Film, Loader2 } from 'lucide-react';
import type * as React from 'react';
import { SkinThumbnail } from '@/components/SkinThumbnail';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

interface PreviewContent {
  sourceName: string | null;
  posterUrl: string | null;
  headline: string;
  kicker: string;
  state: 'empty' | 'checking' | 'offline' | 'ready';
  basis: string;
}

function blockHeadline(block: BlockPlacement | undefined): string | null {
  if (!block) return null;
  if ('heading' in block && typeof block.heading === 'string' && block.heading.trim()) {
    return block.heading.trim();
  }
  if ('body' in block && typeof block.body === 'string' && block.body.trim()) {
    return block.body.trim();
  }
  return null;
}

function blockKicker(block: BlockPlacement | undefined): string | null {
  return block && 'kicker' in block && typeof block.kicker === 'string' && block.kicker.trim()
    ? block.kicker.trim()
    : null;
}

export function useLongformPreviewContent(): PreviewContent {
  const activeSourceId = useStore((state) => state.activeSourceId);
  const sources = useStore((state) => state.sources);
  const transcriptions = useStore((state) => state.transcriptions);
  const longformPlans = useStore((state) => state.longformPlans);
  const source = sources.find((item) => item.id === activeSourceId) ?? null;
  const transcription = activeSourceId ? transcriptions[activeSourceId] : undefined;
  const plan = activeSourceId ? longformPlans[activeSourceId]?.plan : undefined;
  const firstBlock = plan?.blocks[0];
  const transcriptExcerpt = transcription?.words
    .slice(0, 9)
    .map((word) => word.text)
    .join(' ')
    .trim();

  if (!source) {
    return {
      sourceName: null,
      posterUrl: null,
      headline: 'Your project headline appears here',
      kicker: 'Preview unavailable',
      state: 'empty',
      basis: 'Import footage to use a representative frame and real project copy.',
    };
  }

  const plannedHeadline = blockHeadline(firstBlock);
  const headline = plannedHeadline || transcriptExcerpt || source.name;
  const kicker = blockKicker(firstBlock) ?? (firstBlock ? firstBlock.kind : 'Project source');
  const state =
    source.mediaStatus === 'checking'
      ? 'checking'
      : source.mediaStatus === 'offline'
        ? 'offline'
        : 'ready';
  const copyBasis = plannedHeadline
    ? 'the first planned content block'
    : transcriptExcerpt
      ? 'the opening transcript words'
      : 'the source title';
  const basis =
    state === 'offline'
      ? `Uses ${copyBasis}; the source frame is currently offline.`
      : state === 'checking'
        ? `Uses ${copyBasis} while source media is checked.`
        : source.thumbnail
          ? `Uses this project frame and ${copyBasis}.`
          : `Uses ${copyBasis}; no source frame is available yet.`;

  return {
    sourceName: source.name,
    posterUrl: source.thumbnail ?? null,
    headline,
    kicker,
    state,
    basis,
  };
}

export interface LongformStylePreviewProps {
  palette: Palette;
  skin: LongformSkinId;
  className?: string;
  compact?: boolean;
}

/** Preview long-form choices against the active project's real frame and copy. */
export function LongformStylePreview({
  palette,
  skin,
  className,
  compact = false,
}: LongformStylePreviewProps): React.JSX.Element {
  const content = useLongformPreviewContent();

  if (content.state === 'empty') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/25 p-3',
          className,
        )}
      >
        <Film className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-xs font-medium text-foreground">Project preview needs footage</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{content.basis}</p>
        </div>
      </div>
    );
  }

  return (
    <figure className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}>
      <div className="relative">
        <SkinThumbnail
          skin={skin}
          palette={palette}
          posterUrl={content.state === 'ready' ? content.posterUrl : null}
          headline={content.headline}
          kicker={content.kicker}
        />
        {content.state === 'checking' && (
          <div
            className="absolute inset-0 flex items-center justify-center gap-2 bg-background/85 text-xs font-medium text-foreground backdrop-blur-sm"
            role="status"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Checking source frame
          </div>
        )}
        {content.state === 'offline' && (
          <div
            className="absolute inset-x-2 bottom-2 flex items-start gap-2 rounded-md border border-warning/40 bg-background/95 p-2 text-xs text-foreground shadow-sm"
            role="status"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
            Source frame unavailable. The saved project copy still previews the selected treatment.
          </div>
        )}
      </div>
      {!compact && (
        <figcaption className="flex flex-wrap items-start justify-between gap-2 border-t border-border px-3 py-2.5">
          <div className="min-w-0">
            <p
              className="truncate text-xs font-medium text-foreground"
              title={content.sourceName ?? undefined}
            >
              {content.sourceName}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {content.basis}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0 font-normal">
            {content.posterUrl && content.state === 'ready'
              ? 'Real project content'
              : 'Real project copy'}
          </Badge>
        </figcaption>
      )}
    </figure>
  );
}
