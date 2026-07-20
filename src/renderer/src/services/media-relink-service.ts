import type { MediaSearchSource } from '@shared/media';
import { useStore, withoutDirtyTracking } from '@/store';

function fileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath;
}

export async function refreshMissingMediaStatuses(): Promise<void> {
  const sources = useStore
    .getState()
    .sources.filter(
      (source) => source.origin === 'file' && source.path && source.mediaStatus === 'checking',
    );
  if (sources.length === 0) return;

  try {
    const statuses = await window.api.checkMediaPaths(sources.map((source) => source.path));
    const availableByPath = new Map(statuses.map((status) => [status.path, status.available]));
    withoutDirtyTracking(() => {
      useStore.setState((state) => {
        for (const source of state.sources) {
          if (!availableByPath.has(source.path)) continue;
          source.mediaStatus = availableByPath.get(source.path) ? 'online' : 'offline';
        }
      });
    });
  } catch (error) {
    withoutDirtyTracking(() => {
      useStore.setState((state) => {
        for (const source of state.sources) {
          if (sources.some((candidate) => candidate.id === source.id))
            source.mediaStatus = 'offline';
        }
      });
    });
    useStore.getState().addError({
      source: 'project',
      message: `Couldn’t verify project media: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export async function locateMissingSource(sourceId: string): Promise<boolean> {
  const [filePath] = await window.api.openFiles();
  if (!filePath) return false;
  const metadata = await window.api.getMetadata(filePath);
  useStore.getState().updateSource(sourceId, {
    path: filePath,
    name: fileName(filePath),
    duration: metadata.duration,
    width: metadata.width,
    height: metadata.height,
    mediaStatus: 'online',
  });
  return true;
}

export interface FolderRelinkResult {
  matched: number;
  missing: number;
  folderPath: string | null;
  truncated: boolean;
}

export async function searchFolderForMissingMedia(): Promise<FolderRelinkResult> {
  const folderPath = await window.api.openDirectory();
  const offlineSources = useStore
    .getState()
    .sources.filter((source) => source.mediaStatus === 'offline');
  if (!folderPath) {
    return { matched: 0, missing: offlineSources.length, folderPath: null, truncated: false };
  }

  const request: MediaSearchSource[] = offlineSources.map((source) => ({
    id: source.id,
    path: source.path,
    name: source.name || fileName(source.path),
  }));
  const result = await window.api.searchMediaFolder(folderPath, request);
  const matchedEntries = Object.entries(result.matches);

  for (const [sourceId, path] of matchedEntries) {
    try {
      const metadata = await window.api.getMetadata(path);
      useStore.getState().updateSource(sourceId, {
        path,
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        mediaStatus: 'online',
      });
    } catch (error) {
      useStore.getState().addError({
        source: 'project',
        message: `Couldn’t relink ${fileName(path)}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const remaining = useStore
    .getState()
    .sources.filter((source) => source.mediaStatus === 'offline');
  return {
    matched: offlineSources.length - remaining.length,
    missing: remaining.length,
    folderPath,
    truncated: result.truncated,
  };
}
