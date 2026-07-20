import { FolderSearch, Link2, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { OfflineMediaPlaceholder } from '@/components/OfflineMediaPlaceholder';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  locateMissingSource,
  refreshMissingMediaStatuses,
  searchFolderForMissingMedia,
} from '@/services/media-relink-service';
import { useStore } from '@/store';
import type { SourceVideo } from '@/store/types';

function MissingSourceCard({
  source,
  busy,
  onLocate,
  onRemove,
}: {
  source: SourceVideo;
  busy: boolean;
  onLocate: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <Card className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 p-3">
      <div className="aspect-video overflow-hidden rounded-md border border-border/70">
        <OfflineMediaPlaceholder fileName={source.name} compact />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold" title={source.name}>
          {source.name}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground" title={source.path}>
          {source.path}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onLocate} disabled={busy}>
            <Link2 aria-hidden />
            {busy ? 'Locating…' : 'Locate'}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onRemove} disabled={busy}>
            <Trash2 aria-hidden />
            Remove
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function MissingMediaDialog(): React.JSX.Element | null {
  const sources = useStore((state) => state.sources);
  const removeSource = useStore((state) => state.removeSource);
  const offlineSources = useMemo(
    () => sources.filter((source) => source.mediaStatus === 'offline'),
    [sources],
  );
  const checkingKey = sources
    .filter((source) => source.mediaStatus === 'checking')
    .map((source) => source.id)
    .join('|');
  const offlineKey = offlineSources
    .map((source) => source.id)
    .sort()
    .join('|');
  const promptedKey = useRef('');
  const [open, setOpen] = useState(false);
  const [busySourceId, setBusySourceId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<SourceVideo | null>(null);

  useEffect(() => {
    if (checkingKey) void refreshMissingMediaStatuses();
  }, [checkingKey]);

  useEffect(() => {
    if (!offlineKey || promptedKey.current === offlineKey) return;
    promptedKey.current = offlineKey;
    setOpen(true);
  }, [offlineKey]);

  const locate = async (source: SourceVideo): Promise<void> => {
    setBusySourceId(source.id);
    try {
      if (await locateMissingSource(source.id)) toast.success(`Relinked ${source.name}`);
    } catch (error) {
      toast.error(
        `Couldn’t relink ${source.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setBusySourceId(null);
    }
  };

  const searchFolder = async (): Promise<void> => {
    setSearching(true);
    try {
      const result = await searchFolderForMissingMedia();
      if (!result.folderPath) return;
      if (result.matched > 0) {
        toast.success(
          `Relinked ${result.matched} source${result.matched === 1 ? '' : 's'}${result.missing ? ` · ${result.missing} still offline` : ''}`,
        );
      } else {
        toast.info('No matching media found in that folder');
      }
      if (result.truncated) toast.warning('Folder search stopped after 20,000 files');
    } catch (error) {
      toast.error(
        `Couldn’t search that folder: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSearching(false);
    }
  };

  if (offlineSources.length === 0 && !removeTarget) return null;

  return (
    <>
      {!open && offlineSources.length > 0 && (
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm sm:px-6"
          role="status"
        >
          <div className="flex min-w-0 items-center gap-2">
            <TriangleAlert
              className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
              aria-hidden
            />
            <p className="truncate text-foreground">
              {offlineSources.length} {offlineSources.length === 1 ? 'source is' : 'sources are'}{' '}
              offline. Your project data is safe.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => setOpen(true)}
          >
            Manage media
          </Button>
        </div>
      )}

      <Dialog open={open && offlineSources.length > 0} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 pb-4 pt-6">
            <DialogTitle>Source media is offline</DialogTitle>
            <DialogDescription>
              Your transcript, clips, decisions, brief, and plan are safe. Relink media to preview,
              process, or render it.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-3 overflow-y-auto px-6 py-4">
            {offlineSources.map((source) => (
              <MissingSourceCard
                key={source.id}
                source={source}
                busy={busySourceId === source.id || searching}
                onLocate={() => void locate(source)}
                onRemove={() => setRemoveTarget(source)}
              />
            ))}
          </div>

          <DialogFooter className="border-t border-border px-6 py-4 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => void searchFolder()}
              disabled={searching || busySourceId !== null}
            >
              <FolderSearch aria-hidden />
              {searching ? 'Searching…' : 'Search folder'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Keep offline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(next) => !next && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the source and its transcript, clips, decisions, and edit plan from this
              project. The media file on disk is not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeTarget) removeSource(removeTarget.id);
                setRemoveTarget(null);
              }}
            >
              Remove source
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
