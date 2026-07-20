import type { RecentProjectEntry } from '@shared/recent-projects';
import { Clapperboard, Film, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContactSheetFrame {
  image: string;
  project: RecentProjectEntry;
}

interface ProjectContactSheetProps {
  projects: RecentProjectEntry[];
  busyPath: string | null;
  onOpenProject: (project: RecentProjectEntry) => void;
}

const CONTACT_SHEET_SLOTS = ['lead', 'second', 'third', 'fourth', 'fifth'] as const;

function contactFrames(projects: RecentProjectEntry[]): ContactSheetFrame[] {
  const usedImages = new Set<string>();
  const frames: ContactSheetFrame[] = [];
  for (const project of projects) {
    for (const image of [project.poster, ...(project.selectedFrames ?? [])]) {
      if (!image || usedImages.has(image)) continue;
      usedImages.add(image);
      frames.push({ image, project });
      if (frames.length === 5) return frames;
    }
  }
  return frames;
}

function NeutralFrame({ index }: { index: number }): React.JSX.Element {
  return (
    <div
      className="border-border/80 bg-muted relative flex min-h-24 items-center justify-center overflow-hidden border"
      aria-hidden
    >
      <div
        className={cn(
          'absolute inset-0 opacity-70',
          index % 3 === 0 &&
            'bg-[linear-gradient(135deg,hsl(var(--muted)),hsl(var(--secondary))_46%,hsl(var(--border))_47%,hsl(var(--muted))_100%)]',
          index % 3 === 1 &&
            'bg-[linear-gradient(90deg,hsl(var(--secondary))_0_34%,hsl(var(--border))_34%_36%,hsl(var(--muted))_36%_100%)]',
          index % 3 === 2 &&
            'bg-[radial-gradient(circle_at_68%_42%,hsl(var(--border-strong))_0_16%,transparent_17%),linear-gradient(160deg,hsl(var(--muted)),hsl(var(--secondary)))]',
        )}
      />
      <Film className="text-muted-foreground/70 relative h-5 w-5" strokeWidth={1.5} />
    </div>
  );
}

export function ProjectContactSheet({
  projects,
  busyPath,
  onOpenProject,
}: ProjectContactSheetProps): React.JSX.Element {
  const frames = contactFrames(projects);

  return (
    <section aria-labelledby="contact-sheet-title" className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Clapperboard className="text-signal h-4 w-4 shrink-0" aria-hidden />
          <h2 id="contact-sheet-title" className="text-sm font-semibold tracking-tight">
            Your latest cuts
          </h2>
        </div>
        <p className="text-muted-foreground text-xs">Real frames from saved projects</p>
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))] min-[1200px]:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))]">
        {CONTACT_SHEET_SLOTS.map((slot, index) => {
          const frame = frames[index];
          const visibility = cn(
            index === 3 && 'hidden sm:block',
            index === 4 && 'hidden min-[1200px]:block',
          );
          if (!frame) {
            return (
              <div key={slot} className={visibility}>
                <NeutralFrame index={index} />
              </div>
            );
          }
          const busy = busyPath === frame.project.path;
          return (
            <button
              key={slot}
              type="button"
              className={cn(
                'group border-border/80 bg-muted relative min-h-24 overflow-hidden border text-left',
                'transition-[border-color,box-shadow,opacity] duration-150 hover:border-primary/70',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
                'disabled:cursor-wait disabled:opacity-70',
                visibility,
              )}
              onClick={() => onOpenProject(frame.project)}
              disabled={busyPath !== null}
              aria-busy={busy}
              aria-label={busy ? `Opening ${frame.project.name}` : `Open ${frame.project.name}`}
            >
              <img
                src={frame.image}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />
              {busy && (
                <span className="absolute inset-0 z-10 flex items-center justify-center gap-1.5 bg-black/65 text-xs font-medium text-white">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Opening
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2.5 pt-8 pb-2 text-white">
                <span className="block truncate text-xs font-semibold">{frame.project.name}</span>
                <span className="block truncate text-[10px] text-white/80">
                  {frame.project.sourceName ?? 'Saved project'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
