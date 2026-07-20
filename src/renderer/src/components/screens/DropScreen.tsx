import type { RecentProjectEntry } from '@shared/recent-projects';
import {
  AlertTriangle,
  ArrowRight,
  FilePlus2,
  FolderOpen,
  Import,
  KeyRound,
  Link as LinkIcon,
  Settings as SettingsIcon,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { NewProjectDialog, type NewProjectDraft } from '@/components/NewProjectDialog';
import { PalettePicker } from '@/components/PalettePicker';
import { ProcessingRecipe } from '@/components/ProcessingRecipe';
import { ProjectContactSheet } from '@/components/ProjectContactSheet';
import { PythonSetupCard } from '@/components/PythonSetupCard';
import { RecentProjectLibrary } from '@/components/RecentProjectLibrary';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLongformPipeline, usePipeline } from '@/hooks';
import { resolveGeminiKey } from '@/lib/gemini-key';
import { cn } from '@/lib/utils';
import { createNewProject, loadProject, loadProjectFromPath } from '@/services';
import { getCreatorProfiles } from '@/services/creator-profiles';
import type { SourceVideo } from '@/store';
import { useStore } from '@/store';

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mts', 'm4v'] as const;

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function isYouTubeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (/youtu\.be\/[A-Za-z0-9_-]{11}/i.test(trimmed)) return true;
  try {
    const host = new URL(trimmed).hostname.replace(/^www\./i, '');
    return host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be';
  } catch {
    return false;
  }
}

function isVideoFilename(name: string): boolean {
  const extension = name.split('.').pop()?.toLowerCase();
  return extension ? (VIDEO_EXTENSIONS as readonly string[]).includes(extension) : false;
}

function basename(path: string): string {
  const cleaned = path.replace(/[/\\]+$/, '');
  const last = cleaned.split(/[/\\]/).pop();
  return last && last.length > 0 ? last : cleaned;
}

function filenameStem(path: string): string {
  return basename(path).replace(/\.[^.]+$/, '');
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function DropScreen(): React.JSX.Element {
  const addSource = useStore((state) => state.addSource);
  const setActiveSource = useStore((state) => state.setActiveSource);
  const addError = useStore((state) => state.addError);
  const pythonStatus = useStore((state) => state.pythonStatus);
  const outputMode = useStore((state) => state.settings.outputMode);
  const setOutputMode = useStore((state) => state.setOutputMode);
  const setProjectDisplayName = useStore((state) => state.setProjectDisplayName);
  const setCreativeBrief = useStore((state) => state.setCreativeBrief);
  const commitCreativeBrief = useStore((state) => state.commitCreativeBrief);
  const setCreatorProfile = useStore((state) => state.setCreatorProfile);
  const setProcessingConfig = useStore((state) => state.setProcessingConfig);
  const setTargetPlatform = useStore((state) => state.setTargetPlatform);
  const setTemplateLayout = useStore((state) => state.setTemplateLayout);
  const setLongformSkin = useStore((state) => state.setLongformSkin);
  const setLongformPaletteId = useStore((state) => state.setLongformPaletteId);
  const { processVideo } = usePipeline();
  const { processLongform } = useLongformPipeline();

  const showSetupCard =
    pythonStatus === 'not-setup' ||
    pythonStatus === 'repair-needed' ||
    pythonStatus === 'installing' ||
    pythonStatus === 'cancelling' ||
    pythonStatus === 'error';
  const isSetupBusy = pythonStatus === 'installing' || pythonStatus === 'cancelling';

  const [url, setUrl] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [recents, setRecents] = useState<RecentProjectEntry[]>([]);
  const [recentsLoading, setRecentsLoading] = useState(true);
  const [recentsError, setRecentsError] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [keyMissing, setKeyMissing] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [busyProjectPath, setBusyProjectPath] = useState<string | null>(null);
  const [queuedSource, setQueuedSource] = useState<{
    source: SourceVideo;
    outputMode: 'short' | 'longform';
  } | null>(null);
  const dragDepth = useRef(0);

  const ensureScoringKey = useCallback(async (): Promise<boolean> => {
    const state = useStore.getState();
    if (state.settings.outputMode === 'short' && state.processingConfig.promoMode) {
      setKeyMissing(false);
      return true;
    }

    const resolvedCredential = await resolveGeminiKey(state.settings.geminiApiKey);
    if (resolvedCredential) {
      setKeyMissing(false);
      return true;
    }
    setKeyMissing(true);
    setIngestError(null);
    toast.error('Gemini API key required', {
      description: 'Add your key in Settings before processing a video.',
    });
    return false;
  }, []);

  const handleOpenSettings = useCallback(async (): Promise<void> => {
    try {
      await window.api.openSettingsWindow();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const structured = addError({ source: 'settings', error, message });
      toast.error(structured.headline);
    }
  }, [addError]);

  const refreshRecents = useCallback(async (): Promise<void> => {
    setRecentsLoading(true);
    setRecentsError(null);
    try {
      setRecents(await window.api.getRecentProjects());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addError({ source: 'project', message: `Failed to load recent projects: ${message}` });
      setRecentsError(message || 'The recent-project index is unavailable.');
    } finally {
      setRecentsLoading(false);
    }
  }, [addError]);

  useEffect(() => {
    void refreshRecents();
  }, [refreshRecents]);

  const processOrQueueSource = useCallback(
    (source: SourceVideo): void => {
      const state = useStore.getState();
      const selectedMode = state.settings.outputMode;
      if (state.pythonStatus !== 'ready') {
        setQueuedSource({ source, outputMode: selectedMode });
        return;
      }
      if (selectedMode === 'longform') void processLongform(source);
      else void processVideo(source);
    },
    [processLongform, processVideo],
  );

  useEffect(() => {
    if (!queuedSource || pythonStatus !== 'ready') return;
    setQueuedSource(null);
    if (queuedSource.outputMode === 'longform') void processLongform(queuedSource.source);
    else void processVideo(queuedSource.source);
  }, [processLongform, processVideo, pythonStatus, queuedSource]);

  const startFromFilePath = useCallback(
    async (filePath: string): Promise<void> => {
      if (isStarting) return;
      if (!(await ensureScoringKey())) return;
      setIsStarting(true);
      try {
        const [metadataResult, thumbnailResult] = await Promise.allSettled([
          window.api.getMetadata(filePath),
          window.api.getThumbnail(filePath, 1),
        ]);
        if (metadataResult.status === 'rejected') throw metadataResult.reason;
        const metadata = metadataResult.value;
        const source: SourceVideo = {
          id: makeId(),
          path: filePath,
          name: basename(filePath),
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
          ...(thumbnailResult.status === 'fulfilled' ? { thumbnail: thumbnailResult.value } : {}),
          origin: 'file',
          mediaStatus: 'online',
        };
        if (useStore.getState().currentProject.displayName === 'Untitled Project') {
          setProjectDisplayName(filenameStem(filePath));
        }
        addSource(source);
        setActiveSource(source.id);
        processOrQueueSource(source);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const structured = addError({
          source: 'pipeline',
          error,
          message: `Failed to ingest ${filePath}: ${message}`,
          failedStage: 'source-ingest',
        });
        toast.error(structured.headline);
        setIngestError(`${basename(filePath)}: ${structured.whatHappened}`);
        setIsStarting(false);
      }
    },
    [
      addError,
      addSource,
      ensureScoringKey,
      isStarting,
      processOrQueueSource,
      setActiveSource,
      setProjectDisplayName,
    ],
  );

  const startFromUrl = useCallback(
    async (sourceUrl: string): Promise<void> => {
      if (isStarting) return;
      if (!(await ensureScoringKey())) return;
      setIsStarting(true);
      const source: SourceVideo = {
        id: makeId(),
        path: '',
        name: sourceUrl,
        duration: 0,
        width: 0,
        height: 0,
        origin: 'youtube',
        youtubeUrl: sourceUrl,
        mediaStatus: 'online',
      };
      if (useStore.getState().currentProject.displayName === 'Untitled Project') {
        setProjectDisplayName('YouTube project');
      }
      addSource(source);
      setActiveSource(source.id);
      processOrQueueSource(source);
    },
    [
      addSource,
      ensureScoringKey,
      isStarting,
      processOrQueueSource,
      setActiveSource,
      setProjectDisplayName,
    ],
  );

  const handleUrlSubmit = useCallback((): void => {
    if (isSetupBusy || isStarting) return;
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!isUrl(trimmed) || !isYouTubeUrl(trimmed)) {
      const message = 'Paste a valid YouTube URL.';
      toast.error(message);
      setIngestError(message);
      return;
    }
    setIngestError(null);
    void startFromUrl(trimmed);
  }, [isSetupBusy, isStarting, startFromUrl, url]);

  const chooseVideoPath = useCallback(async (): Promise<string | null> => {
    try {
      const paths = await window.api.openFiles();
      return paths[0] ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const structured = addError({
        source: 'pipeline',
        error,
        message: `Open file dialog: ${message}`,
        failedStage: 'source-ingest',
      });
      toast.error(structured.headline);
      setIngestError(structured.whatHappened);
      return null;
    }
  }, [addError]);

  const handleBrowse = useCallback(async (): Promise<void> => {
    const path = await chooseVideoPath();
    if (!path) return;
    setIngestError(null);
    void startFromFilePath(path);
  }, [chooseVideoPath, startFromFilePath]);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLElement>): void => {
      event.preventDefault();
      dragDepth.current = 0;
      setIsDragOver(false);
      const file = Array.from(event.dataTransfer.files ?? [])[0];
      if (!file) return;
      const path = window.api.getPathForFile(file);

      if (file.name.toLowerCase().endsWith('.batchclip')) {
        void loadProjectFromPath(path).then((opened) => {
          if (opened) {
            toast.success('Project loaded');
            void refreshRecents();
          } else {
            setIngestError(`Couldn't open ${file.name}`);
          }
        });
        return;
      }
      if (!isVideoFilename(file.name)) {
        const message = `Unsupported file type: ${file.name}`;
        toast.error(message);
        setIngestError(message);
        return;
      }
      if (!path) {
        setIngestError("Couldn't resolve the dropped file path.");
        return;
      }
      setIngestError(null);
      void startFromFilePath(path);
    },
    [refreshRecents, startFromFilePath],
  );

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLElement>): void => {
    event.preventDefault();
    dragDepth.current += 1;
    if (event.dataTransfer.types.includes('Files')) setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLElement>): void => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLElement>): void => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragOver(false);
  }, []);

  const handleOpenRecent = useCallback(async (entry: RecentProjectEntry): Promise<void> => {
    setBusyProjectPath(entry.path);
    try {
      const opened = await loadProjectFromPath(entry.path);
      if (opened) {
        toast.success(`Opened ${entry.name}`);
        setIngestError(null);
      } else {
        setIngestError(`Couldn't open ${entry.name}. The project may have moved or been damaged.`);
      }
    } finally {
      setBusyProjectPath(null);
    }
  }, []);

  const handleOpenProjectFile = useCallback(async (): Promise<void> => {
    const opened = await loadProject();
    if (opened) {
      toast.success('Project loaded');
      void refreshRecents();
    }
  }, [refreshRecents]);

  const runProjectAction = useCallback(
    async (
      entry: RecentProjectEntry,
      action: () => Promise<void>,
      success: string,
    ): Promise<void> => {
      setBusyProjectPath(entry.path);
      try {
        await action();
        toast.success(success);
        await refreshRecents();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setIngestError(`${entry.name}: ${message}`);
        toast.error(message);
      } finally {
        setBusyProjectPath(null);
      }
    },
    [refreshRecents],
  );

  const handleCreateProject = useCallback(
    (draft: NewProjectDraft): void => {
      if (draft.source.kind === 'url' && !isYouTubeUrl(draft.source.value)) {
        setIngestError('Paste a valid YouTube URL.');
        setNewProjectOpen(false);
        return;
      }
      createNewProject();
      setProjectDisplayName(draft.name);
      setOutputMode(draft.outputMode);
      if (draft.profileId) {
        const profile = getCreatorProfiles().find((item) => item.id === draft.profileId);
        if (profile) {
          setCreatorProfile(profile.id);
          setProcessingConfig({ targetAudience: profile.audience });
          setTargetPlatform(profile.targetPlatform);
          setTemplateLayout(profile.templateLayout);
          setLongformSkin(profile.longformSkin);
          setLongformPaletteId(profile.longformPaletteId);
        }
      }
      if (draft.brief) {
        setCreativeBrief(draft.brief);
        commitCreativeBrief();
      }
      setNewProjectOpen(false);
      setIngestError(null);
      if (draft.source.kind === 'file') void startFromFilePath(draft.source.value);
      else void startFromUrl(draft.source.value);
    },
    [
      commitCreativeBrief,
      setCreativeBrief,
      setCreatorProfile,
      setLongformPaletteId,
      setLongformSkin,
      setOutputMode,
      setProcessingConfig,
      setProjectDisplayName,
      setTargetPlatform,
      setTemplateLayout,
      startFromFilePath,
      startFromUrl,
    ],
  );

  return (
    <div className="studio-shell h-full w-full overflow-y-auto px-4 py-4 sm:px-6 min-[1100px]:px-8 min-[1100px]:py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Project lobby</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Start from footage or pick up your last cut.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              id="new-project-button"
              variant="outline"
              size="sm"
              onClick={() => setNewProjectOpen(true)}
            >
              <FilePlus2 className="h-4 w-4" aria-hidden />
              New project
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleOpenProjectFile()}>
              <FolderOpen className="h-4 w-4" aria-hidden />
              Open project
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleBrowse()}>
              <Import className="h-4 w-4" aria-hidden />
              Import video
            </Button>
          </div>
        </header>

        <ProjectContactSheet
          projects={recents}
          busyPath={busyProjectPath}
          onOpenProject={(entry) => void handleOpenRecent(entry)}
        />

        {keyMissing && (
          <Alert variant="destructive">
            <KeyRound className="h-4 w-4" />
            <AlertTitle>Gemini API key required</AlertTitle>
            <AlertDescription className="break-words">
              <p className="mb-2">
                Finding and shaping moments needs a Gemini API key. Add it in Settings, then try
                your source again.
              </p>
              <Button variant="default" size="sm" onClick={() => void handleOpenSettings()}>
                <SettingsIcon className="h-3.5 w-3.5" aria-hidden />
                Open Settings
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {ingestError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>That action did not finish</AlertTitle>
            <AlertDescription className="break-words">{ingestError}</AlertDescription>
          </Alert>
        )}

        {showSetupCard ? (
          <PythonSetupCard queuedSourceName={queuedSource?.source.name ?? null} />
        ) : (
          <Card
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'bg-card/80 grid overflow-hidden border-2 transition-[border-color,background-color,box-shadow,opacity] duration-150 min-[860px]:grid-cols-[1.15fr_0.85fr]',
              isDragOver &&
                'border-primary bg-primary/5 shadow-[0_0_0_4px_hsl(var(--primary)/0.08)]',
              isStarting && 'opacity-65',
            )}
          >
            <button
              type="button"
              aria-label="Drop a video file or paste a URL"
              disabled={isStarting}
              onClick={() => void handleBrowse()}
              className={cn(
                'group flex min-h-48 items-center gap-5 border-b border-dashed p-5 text-left min-[860px]:border-r min-[860px]:border-b-0 sm:p-6',
                'transition-[background-color,color] duration-150 hover:bg-muted/60',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none',
              )}
            >
              <Upload
                className={cn(
                  'h-8 w-8 shrink-0 transition-colors duration-150',
                  isDragOver ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                )}
                strokeWidth={1.6}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block text-base font-semibold">Drop video</span>
                <span className="text-muted-foreground mt-1 block text-sm">
                  Or choose a local file to start this project.
                </span>
                <span className="text-muted-foreground mt-3 block text-xs">
                  MP4, MOV, MKV, WEBM, MTS, and M4V
                </span>
              </span>
            </button>

            <div className="flex min-w-0 flex-col justify-center gap-4 p-5 sm:p-6">
              <div className="grid gap-2">
                <Label htmlFor="lobby-youtube-url">YouTube URL</Label>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <LinkIcon
                      className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                      aria-hidden
                    />
                    <Input
                      id="lobby-youtube-url"
                      type="url"
                      value={url}
                      onChange={(event) => {
                        setUrl(event.target.value);
                        setIngestError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          handleUrlSubmit();
                        }
                      }}
                      placeholder="Paste a YouTube link"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={isStarting}
                      className="pl-9"
                      aria-label="Video URL or file path"
                    />
                  </div>
                  <Button
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    disabled={!url.trim() || isStarting}
                    onClick={handleUrlSubmit}
                    aria-label="Import YouTube URL"
                  >
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  A clear alternative to local footage. Downloads begin after connection checks.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Output mode</p>
                  <p className="text-muted-foreground text-xs">
                    {outputMode === 'longform' ? 'One 16:9 edit' : 'Multiple 9:16 clips'}
                  </p>
                </div>
                <Select
                  value={outputMode}
                  onValueChange={(value) => setOutputMode(value as 'short' | 'longform')}
                  disabled={isStarting}
                >
                  <SelectTrigger className="w-full sm:w-48" aria-label="Output mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short clips (9:16)</SelectItem>
                    <SelectItem value="longform">Long-form (16:9)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>
        )}

        {!showSetupCard && outputMode === 'short' && <ProcessingRecipe disabled={isStarting} />}

        {!showSetupCard && outputMode === 'longform' && <PalettePicker disabled={isStarting} />}

        <RecentProjectLibrary
          projects={recents}
          loading={recentsLoading}
          error={recentsError}
          busyPath={busyProjectPath}
          onRetry={() => void refreshRecents()}
          onOpen={(entry) => void handleOpenRecent(entry)}
          onNewProject={() => setNewProjectOpen(true)}
          onOpenProjectFile={() => void handleOpenProjectFile()}
          onReveal={(entry) => void window.api.showItemInFolder(entry.path)}
          onPin={(entry) =>
            void runProjectAction(
              entry,
              async () => {
                setRecents(await window.api.setRecentProjectPinned(entry.path, !entry.pinned));
              },
              entry.pinned ? 'Project unpinned' : 'Project pinned',
            )
          }
          onRename={(entry, name) =>
            void runProjectAction(
              entry,
              async () => {
                await window.api.renameRecentProject(entry.path, name);
              },
              `Renamed to ${name}`,
            )
          }
          onDuplicate={(entry) =>
            void runProjectAction(
              entry,
              async () => {
                await window.api.duplicateRecentProject(entry.path);
              },
              'Project duplicated',
            )
          }
          onRemove={(entry) =>
            void runProjectAction(
              entry,
              async () => {
                await window.api.removeRecentProject(entry.path);
              },
              'Removed from Recents',
            )
          }
          onDelete={(entry) =>
            void runProjectAction(
              entry,
              async () => {
                await window.api.deleteRecentProject(entry.path);
              },
              'Project file deleted',
            )
          }
        />
      </div>

      <NewProjectDialog
        open={newProjectOpen}
        busy={isStarting}
        onOpenChange={setNewProjectOpen}
        onChooseFile={chooseVideoPath}
        onCreate={handleCreateProject}
      />
    </div>
  );
}
