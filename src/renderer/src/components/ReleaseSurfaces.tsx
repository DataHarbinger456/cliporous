import type { AppUpdateState } from '@shared/updater';
import { CheckCircle2, Download, RefreshCw, RotateCw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { releaseNotesThrough } from '@/release-notes';
import { saveProject } from '@/services';
import { useStore } from '@/store';

const LAST_VERSION_STORAGE_KEY = 'batchclip.release.last-version.v1';

const INITIAL_UPDATE_STATE: AppUpdateState = {
  phase: 'idle',
  currentVersion: '0.0.0',
  availableVersion: null,
  progressPercent: null,
  message: null,
  manual: false,
};

function shouldShowBanner(update: AppUpdateState): boolean {
  return (
    update.phase === 'available' ||
    update.phase === 'downloading' ||
    update.phase === 'ready' ||
    update.phase === 'error' ||
    Boolean(update.manual && update.message)
  );
}

export function ReleaseSurfaces(): React.JSX.Element {
  const [update, setUpdate] = useState<AppUpdateState>(INITIAL_UPDATE_STATE);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  const considerUpdatedVersion = useCallback((currentVersion: string): void => {
    if (!currentVersion || currentVersion === '0.0.0') return;
    try {
      const previousVersion = window.localStorage.getItem(LAST_VERSION_STORAGE_KEY);
      window.localStorage.setItem(LAST_VERSION_STORAGE_KEY, currentVersion);
      if (previousVersion && previousVersion !== currentVersion) setWhatsNewOpen(true);
    } catch {
      // Release notes remain available from Help when local persistence is unavailable.
    }
  }, []);

  useEffect(() => {
    let active = true;
    void window.api
      .getUpdateState()
      .then((next) => {
        if (!active) return;
        setUpdate(next);
        considerUpdatedVersion(next.currentVersion);
      })
      .catch(() => {});
    const offState = window.api.onUpdateState((next) => {
      setUpdate(next);
      considerUpdatedVersion(next.currentVersion);
    });
    const offWhatsNew = window.api.onWhatsNewRequest(() => setWhatsNewOpen(true));
    const offUpdateCheck = window.api.onUpdateCheckRequest(() => {
      void window.api
        .checkForUpdates()
        .then(setUpdate)
        .catch(() => {});
    });
    return () => {
      active = false;
      offState();
      offWhatsNew();
      offUpdateCheck();
    };
  }, [considerUpdatedVersion]);

  const notes = useMemo(() => releaseNotesThrough(update.currentVersion), [update.currentVersion]);
  const bannerVersion = update.availableVersion ?? update.currentVersion;
  const bannerVisible = shouldShowBanner(update) && dismissedVersion !== bannerVersion;

  const download = async (): Promise<void> => {
    setDismissedVersion(null);
    try {
      setUpdate(await window.api.downloadUpdate());
    } catch {
      toast.error('The update could not download. Your project was not changed.');
    }
  };

  const retryCheck = async (): Promise<void> => {
    setDismissedVersion(null);
    try {
      setUpdate(await window.api.checkForUpdates());
    } catch {
      toast.error('The release service could not be reached.');
    }
  };

  const install = async (): Promise<void> => {
    const state = useStore.getState();
    const activeJob = state.creatorJobs.some(
      (job) => job.status === 'running' || job.status === 'cancelling',
    );
    if (activeJob || state.isRendering || state.singleRenderStatus === 'rendering') {
      toast.warning('Finish or stop active studio work before restarting for the update.');
      return;
    }
    const hasQueuedWork =
      state.renderProgress.length > 0 ||
      state.creatorJobs.some((job) => job.status === 'queued' || job.status === 'paused');
    if (state.isDirty || hasQueuedWork) {
      const savedPath = await saveProject();
      if (!savedPath || useStore.getState().isDirty) {
        toast.error('Save the project before restarting for the update.');
        return;
      }
    }
    const started = await window.api.installUpdate();
    if (!started) toast.error('The update is not ready to install yet.');
  };

  return (
    <>
      {bannerVisible && (
        <section
          className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-primary/25 bg-primary/[0.08] px-4 py-2 text-sm"
          aria-live="polite"
          aria-label="BatchClip update"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {update.phase === 'ready' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            ) : update.phase === 'downloading' ? (
              <Download className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            )}
            <div className="min-w-0">
              <p className="font-medium text-foreground">
                {update.phase === 'available' &&
                  `BatchClip ${update.availableVersion} is available`}
                {update.phase === 'downloading' && 'Downloading the signed update'}
                {update.phase === 'ready' && `BatchClip ${update.availableVersion} is ready`}
                {update.phase === 'error' && 'Update check needs attention'}
                {update.phase === 'idle' && 'BatchClip is up to date'}
              </p>
              {update.message && (
                <p className="truncate text-xs text-muted-foreground">{update.message}</p>
              )}
            </div>
          </div>
          {update.phase === 'downloading' && (
            <div className="flex min-w-44 items-center gap-2">
              <Progress
                value={update.progressPercent ?? 0}
                className="h-1.5 w-36"
                aria-label="Update download progress"
              />
              <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                {Math.round(update.progressPercent ?? 0)}%
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            {update.phase === 'available' && (
              <Button size="sm" onClick={() => void download()}>
                <Download className="h-4 w-4" aria-hidden />
                Download
              </Button>
            )}
            {update.phase === 'ready' && (
              <Button size="sm" onClick={() => void install()}>
                <RotateCw className="h-4 w-4" aria-hidden />
                Save and restart
              </Button>
            )}
            {update.phase === 'error' && (
              <Button size="sm" variant="outline" onClick={() => void retryCheck()}>
                Try again
              </Button>
            )}
            {update.phase !== 'downloading' && (
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9"
                onClick={() => setDismissedVersion(bannerVersion)}
                aria-label="Dismiss update message"
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
        </section>
      )}

      <Dialog open={whatsNewOpen} onOpenChange={setWhatsNewOpen}>
        <DialogContent className="max-h-[min(720px,88vh)] overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border bg-muted/35 px-6 py-5 text-left">
            <BrandMark showName />
            <DialogTitle className="pt-3 text-xl">What’s new in your cut room</DialogTitle>
            <DialogDescription>
              Creator-facing changes in BatchClip {update.currentVersion}.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto px-6 py-5">
            {notes.map((note, index) => (
              <section
                key={note.version}
                className={index === 0 ? '' : 'mt-6 border-t border-border pt-6'}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold text-foreground">{note.title}</h2>
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    Version {note.version}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{note.summary}</p>
                <ul className="mt-4 space-y-3">
                  {note.items.map((item) => (
                    <li
                      key={item}
                      className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2 text-sm leading-6"
                    >
                      <CheckCircle2 className="mt-1 h-4 w-4 text-primary" aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
            <Button onClick={() => setWhatsNewOpen(false)}>Back to the cut</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
