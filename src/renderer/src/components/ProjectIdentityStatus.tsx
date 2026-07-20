import { useEffect } from 'react';
import { useStore } from '@/store';

function readableStage(stage: string): string {
  return stage.replace(/[-_]/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
}

export function ProjectIdentityStatus({
  stage,
  compact = false,
}: {
  stage: string;
  compact?: boolean;
}): React.JSX.Element {
  const project = useStore((state) => state.currentProject);
  const isDirty = useStore((state) => state.isDirty);
  const saveStatus = useStore((state) => state.saveStatus);
  const lastSaveError = useStore((state) => state.lastSaveError);
  const activeSource = useStore(
    (state) =>
      state.sources.find((source) => source.id === state.activeSourceId) ?? state.sources[0],
  );

  useEffect(() => {
    const runningContext = ['idle', 'ready', 'done'].includes(stage)
      ? ''
      : ` · ${readableStage(stage)}`;
    const dirtyMarker = isDirty ? ' • Unsaved' : '';
    document.title = `${project.displayName}${dirtyMarker}${runningContext} · BatchClip`;
  }, [isDirty, project.displayName, stage]);

  const statusText =
    saveStatus === 'saving'
      ? 'Saving'
      : saveStatus === 'saved'
        ? 'Saved just now'
        : saveStatus === 'error'
          ? 'Save failed'
          : saveStatus === 'dirty'
            ? project.filePath
              ? 'Unsaved changes'
              : 'Not saved yet'
            : project.filePath
              ? 'Saved'
              : 'New project';

  const statusClass =
    saveStatus === 'error'
      ? 'text-destructive'
      : saveStatus === 'saving'
        ? 'text-primary'
        : saveStatus === 'dirty'
          ? 'text-warning'
          : 'text-muted-foreground';

  return (
    <div
      className={`min-w-0 border-l border-border/70 pl-3 leading-tight ${compact ? 'max-w-36' : 'max-w-52'}`}
      title={project.filePath ?? project.displayName}
    >
      <div className="text-foreground truncate text-xs font-semibold">{project.displayName}</div>
      <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px]">
        <span className={`truncate text-muted-foreground ${compact ? 'max-w-20' : 'max-w-28'}`}>
          {activeSource?.name ?? 'No source'}
        </span>
        <span className="text-border" aria-hidden="true">
          ·
        </span>
        <span
          className={`${statusClass} shrink-0 font-medium`}
          role="status"
          aria-live="polite"
          title={saveStatus === 'error' ? (lastSaveError ?? 'Save failed') : statusText}
        >
          {statusText}
        </span>
      </div>
    </div>
  );
}
