import {
  AlertCircle,
  Clapperboard,
  Clock3,
  FileVideo2,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  autoSaveProject,
  clearRecovery,
  loadRecovery,
  type RecoverySnapshot,
  restoreProject,
} from '@/services';
import { useStore } from '@/store';

const STAGE_LABELS: Record<string, string> = {
  idle: 'Source setup',
  downloading: 'Importing source',
  transcribing: 'Transcribing',
  scoring: 'Finding moments',
  stitching: 'Building stories',
  'optimizing-loops': 'Refining loops',
  'detecting-faces': 'Framing speakers',
  'ai-editing': 'Planning edits',
  segmenting: 'Shaping clips',
  ready: 'Review',
  rendering: 'Exporting',
  done: 'Export complete',
  error: 'Needs attention',
};

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replace(/[-_]/g, ' ');
}

function formatAutosaveTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function recoverableAssetSummary(counts: RecoverySnapshot['counts']): string {
  const assets = [
    [counts.sources, 'source', 'sources'],
    [counts.transcripts, 'transcript', 'transcripts'],
    [counts.clips, 'clip', 'clips'],
    [counts.editPlans, 'cut plan', 'cut plans'],
  ]
    .filter(([count]) => Number(count) > 0)
    .map(
      ([count, singular, plural]) =>
        `${count} ${countLabel(Number(count), String(singular), String(plural))}`,
    );

  if (assets.length === 0) return 'the saved editing state';
  if (assets.length === 1) return assets[0] ?? 'the saved editing state';
  if (assets.length === 2) return `${assets[0]} and ${assets[1]}`;
  return `${assets.slice(0, -1).join(', ')}, and ${assets.at(-1)}`;
}

function RecoveryLoadFailure({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}): React.JSX.Element {
  return (
    <AlertDialog open>
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertCircle className="text-destructive h-5 w-5" aria-hidden="true" />
            Recovery needs attention
          </AlertDialogTitle>
          <AlertDialogDescription className="leading-6">
            BatchClip found a recovery file but could not read it. The file is still safe on disk,
            and nothing was deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div
          className="border-destructive/30 bg-destructive/10 text-foreground rounded-lg border p-3 text-sm"
          role="alert"
        >
          <p className="font-medium">What happened</p>
          <p className="text-muted-foreground mt-1 break-words">{error}</p>
        </div>
        <AlertDialogFooter>
          <Button onClick={onRetry}>
            <RotateCcw aria-hidden="true" />
            Try again
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface RecoveryDialogProps {
  snapshot: RecoverySnapshot;
  mode: 'summary' | 'confirm-discard';
  pendingAction: 'restore' | 'discard' | null;
  actionError: string | null;
  onRestore: () => void;
  onRequestDiscard: () => void;
  onCancelDiscard: () => void;
  onConfirmDiscard: () => void;
}

export function RecoveryDialog({
  snapshot,
  mode,
  pendingAction,
  actionError,
  onRestore,
  onRequestDiscard,
  onCancelDiscard,
  onConfirmDiscard,
}: RecoveryDialogProps): React.JSX.Element {
  const isPending = pendingAction !== null;
  const autosaveTime = formatAutosaveTime(snapshot.savedAt);

  if (mode === 'confirm-discard') {
    return (
      <AlertDialog open>
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard recovery for “{snapshot.projectName}”?</AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              This permanently deletes the autosave from {autosaveTime}, including{' '}
              {recoverableAssetSummary(snapshot.counts)}. Your source media and any manually saved
              project file will stay untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && (
            <div
              className="border-destructive/30 bg-destructive/10 rounded-lg border p-3 text-sm"
              role="alert"
            >
              <p className="font-medium">Recovery was not discarded</p>
              <p className="text-muted-foreground mt-1 break-words">
                {actionError} The autosave is still available. Try again or keep it.
              </p>
            </div>
          )}
          <AlertDialogFooter className="flex-col sm:flex-row">
            <Button variant="outline" onClick={onCancelDiscard} disabled={isPending}>
              Keep recovery
            </Button>
            <Button variant="destructive" onClick={onConfirmDiscard} disabled={isPending}>
              {pendingAction === 'discard' && (
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {pendingAction === 'discard' ? 'Discarding…' : 'Discard recovery'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open>
      <AlertDialogContent className="max-h-[calc(100vh-2rem)] max-w-xl overflow-y-auto">
        <AlertDialogHeader>
          <div className="text-primary mb-1 flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Your editing progress is safe
          </div>
          <AlertDialogTitle>Continue “{snapshot.projectName}”?</AlertDialogTitle>
          <AlertDialogDescription className="leading-6">
            BatchClip found an autosave from before the app closed. Restore it to reopen your saved
            editing state. Your original media will not be changed.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <section className="bg-card rounded-lg border" aria-label="Recovered project details">
          <dl className="divide-border divide-y text-sm">
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-4 py-3">
              <dt className="text-muted-foreground flex items-center gap-2">
                <Clapperboard className="h-4 w-4 shrink-0" aria-hidden="true" />
                Project
              </dt>
              <dd className="min-w-0 break-words font-medium">{snapshot.projectName}</dd>
            </div>
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-4 py-3">
              <dt className="text-muted-foreground flex items-center gap-2">
                <FileVideo2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                Source
              </dt>
              <dd className="min-w-0 break-words font-medium">
                {snapshot.sourceName ?? 'No source name saved'}
              </dd>
            </div>
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-4 py-3">
              <dt className="text-muted-foreground flex items-center gap-2">
                <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                Autosaved
              </dt>
              <dd className="font-medium">
                <time dateTime={new Date(snapshot.savedAt).toISOString()}>{autosaveTime}</time>
              </dd>
            </div>
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-4 py-3">
              <dt className="text-muted-foreground flex items-center gap-2">
                <Workflow className="h-4 w-4 shrink-0" aria-hidden="true" />
                Last stage
              </dt>
              <dd className="font-medium capitalize">{stageLabel(snapshot.stage)}</dd>
            </div>
          </dl>
        </section>

        <dl
          className="border-border grid grid-cols-2 overflow-hidden rounded-lg border sm:grid-cols-4"
          aria-label="Recoverable assets"
        >
          {[
            [snapshot.counts.sources, 'Source', 'Sources'],
            [snapshot.counts.transcripts, 'Transcript', 'Transcripts'],
            [snapshot.counts.clips, 'Clip', 'Clips'],
            [snapshot.counts.editPlans, 'Cut plan', 'Cut plans'],
          ].map(([count, singular, plural]) => (
            <div
              className="border-border border-b p-3 last:border-b-0 odd:border-r sm:border-b-0 sm:border-r sm:last:border-r-0"
              key={singular}
            >
              <dd className="text-foreground text-lg font-semibold tabular-nums">{count}</dd>
              <dt className="text-muted-foreground mt-0.5 text-xs">
                {countLabel(Number(count), String(singular), String(plural))}
              </dt>
            </div>
          ))}
        </dl>

        {actionError && (
          <div
            className="border-destructive/30 bg-destructive/10 rounded-lg border p-3 text-sm"
            role="alert"
          >
            <p className="font-medium">Your recovery file is still safe</p>
            <p className="text-muted-foreground mt-1 break-words">
              Restore did not finish: {actionError}. Try again when you are ready.
            </p>
          </div>
        )}

        <AlertDialogFooter className="flex-col sm:flex-row">
          <Button variant="outline" onClick={onRequestDiscard} disabled={isPending}>
            Discard recovery…
          </Button>
          <Button onClick={onRestore} disabled={isPending} autoFocus>
            {pendingAction === 'restore' && (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {pendingAction === 'restore' ? 'Restoring…' : 'Restore project'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RecoveryPrompt(): React.JSX.Element | null {
  const acknowledgedSnapshotId = useStore((state) => state.acknowledgedRecoverySnapshotId);
  const acknowledgedAtLaunch = useRef(acknowledgedSnapshotId).current;
  const acknowledgeSnapshot = useStore((state) => state.acknowledgeRecoverySnapshot);
  const [snapshot, setSnapshot] = useState<RecoverySnapshot | null>(null);
  const [mode, setMode] = useState<'summary' | 'confirm-discard'>('summary');
  const [pendingAction, setPendingAction] = useState<'restore' | 'discard' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const checkRecovery = useCallback(async (): Promise<void> => {
    setLoadError(null);
    try {
      const recovery = await loadRecovery();
      if (!recovery || recovery.id === acknowledgedAtLaunch) return;
      setSnapshot(recovery);
      setMode('summary');
      setOpen(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
      setOpen(true);
    }
  }, [acknowledgedAtLaunch]);

  useEffect(() => {
    void checkRecovery();
  }, [checkRecovery]);

  const handleRestore = async (): Promise<void> => {
    if (!snapshot || pendingAction) return;
    setPendingAction('restore');
    setActionError(null);
    try {
      restoreProject(snapshot.json, undefined, { recovered: true });
      // Refresh crash protection without overwriting a possibly newer project file.
      await autoSaveProject({ recoveryOnly: true });
      const refreshError = useStore.getState().lastSaveError;
      if (refreshError) {
        setOpen(false);
        toast.warning('Project restored, but its safety copy could not be refreshed. Save now.');
        return;
      }
      acknowledgeSnapshot(snapshot.id);
      setOpen(false);
      toast.success(`Restored “${snapshot.projectName}”`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction(null);
    }
  };

  const handleDiscard = async (): Promise<void> => {
    if (!snapshot || pendingAction) return;
    setPendingAction('discard');
    setActionError(null);
    try {
      await clearRecovery();
      acknowledgeSnapshot(snapshot.id);
      setOpen(false);
      toast.success(`Discarded recovery for “${snapshot.projectName}”`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction(null);
    }
  };

  if (!open) return null;
  if (loadError && !snapshot) {
    return <RecoveryLoadFailure error={loadError} onRetry={() => void checkRecovery()} />;
  }
  if (!snapshot) return null;

  return (
    <RecoveryDialog
      snapshot={snapshot}
      mode={mode}
      pendingAction={pendingAction}
      actionError={actionError}
      onRestore={() => void handleRestore()}
      onRequestDiscard={() => {
        setActionError(null);
        setMode('confirm-discard');
      }}
      onCancelDiscard={() => {
        setActionError(null);
        setMode('summary');
      }}
      onConfirmDiscard={() => void handleDiscard()}
    />
  );
}
