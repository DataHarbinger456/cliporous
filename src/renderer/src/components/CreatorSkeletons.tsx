import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const SKELETON_SLOT_IDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'] as const;

function StaticSkeleton({ className }: { className?: string }): React.JSX.Element {
  return <Skeleton className={cn('animate-none', className)} aria-hidden />;
}

export function PosterSkeleton({ landscape = false }: { landscape?: boolean }): React.JSX.Element {
  return (
    <StaticSkeleton
      className={
        landscape
          ? 'aspect-video h-auto w-full rounded-md'
          : 'aspect-[9/16] h-auto w-full rounded-md'
      }
    />
  );
}

/** Mirrors the 160×112 poster, content column, and action rail of a real recent-project row. */
export function ProjectListSkeleton({ rows = 3 }: { rows?: number }): React.JSX.Element {
  return (
    <div className="space-y-2" role="status" aria-label="Loading recent projects">
      {SKELETON_SLOT_IDS.slice(0, rows).map((slot) => (
        <div
          key={`project-row-${slot}`}
          className="flex h-28 min-w-0 overflow-hidden rounded-lg border border-border bg-card/80"
        >
          <StaticSkeleton className="hidden h-28 w-40 shrink-0 rounded-none sm:block" />
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 px-4 py-3">
            <StaticSkeleton className="h-4 w-2/5" />
            <StaticSkeleton className="h-3 w-3/5" />
            <StaticSkeleton className="h-3 w-4/5" />
          </div>
          <div className="flex w-[3.25rem] shrink-0 items-center justify-center border-l border-border/70 px-1.5">
            <StaticSkeleton className="h-10 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Matches the persistent wide clip inspector: portrait preview, tabs, fields, and footer actions. */
export function ClipInspectorSkeleton(): React.JSX.Element {
  return (
    <div className="grid min-h-0 gap-4 rounded-lg border border-border bg-card p-4 min-[980px]:grid-cols-[minmax(220px,0.8fr)_minmax(280px,1.2fr)]">
      <PosterSkeleton />
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex gap-2 border-b border-border pb-2">
          <StaticSkeleton className="h-9 w-20" />
          <StaticSkeleton className="h-9 w-24" />
        </div>
        <StaticSkeleton className="h-5 w-3/4" />
        <StaticSkeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 gap-3">
          <StaticSkeleton className="h-10 w-full" />
          <StaticSkeleton className="h-10 w-full" />
        </div>
        <div className="mt-auto flex justify-end gap-2 border-t border-border pt-4">
          <StaticSkeleton className="h-10 w-24" />
          <StaticSkeleton className="h-10 w-28" />
        </div>
      </div>
    </div>
  );
}

/** Matches a 64×36 export poster, two-line label, status, and queue controls. */
export function ExportQueueSkeleton({ rows = 4 }: { rows?: number }): React.JSX.Element {
  return (
    <div className="space-y-2" role="status" aria-label="Loading the production queue">
      {SKELETON_SLOT_IDS.slice(0, rows).map((slot) => (
        <div
          key={`export-row-${slot}`}
          className="flex min-h-[5.5rem] items-center gap-3 rounded-lg border border-border/80 bg-card/75 p-3"
        >
          <StaticSkeleton className="h-16 w-9 shrink-0 rounded" />
          <div className="min-w-0 flex-1 space-y-2">
            <StaticSkeleton className="h-4 w-3/5" />
            <StaticSkeleton className="h-1.5 w-full" />
            <StaticSkeleton className="h-3 w-2/5" />
          </div>
          <div className="flex gap-1">
            <StaticSkeleton className="h-8 w-8" />
            <StaticSkeleton className="h-8 w-8" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Holds launch geometry while project identity and the last workspace hydrate. */
export function StudioWorkspaceSkeleton(): React.JSX.Element {
  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground" aria-busy="true">
      <div className="flex min-h-16 items-center gap-4 border-b border-border px-4">
        <StaticSkeleton className="h-8 w-8" />
        <div className="space-y-1.5">
          <StaticSkeleton className="h-3.5 w-24" />
          <StaticSkeleton className="h-2.5 w-16" />
        </div>
        <StaticSkeleton className="ml-auto h-9 w-24" />
      </div>
      <main className="min-h-0 flex-1 overflow-hidden px-4 py-5 sm:px-6 min-[1100px]:px-8">
        <div className="mx-auto w-full max-w-6xl space-y-5">
          <div className="space-y-2">
            <StaticSkeleton className="h-6 w-40" />
            <StaticSkeleton className="h-4 w-72 max-w-full" />
          </div>
          <div className="grid gap-4 min-[860px]:grid-cols-[1.15fr_0.85fr]">
            <StaticSkeleton className="h-48 w-full" />
            <StaticSkeleton className="h-48 w-full" />
          </div>
          <ProjectListSkeleton />
        </div>
      </main>
      <span className="sr-only" role="status">
        Restoring your cut room
      </span>
    </div>
  );
}
