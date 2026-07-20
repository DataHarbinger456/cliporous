import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { stripCredentialFields } from '@shared/credential-safety';
import { Ch } from '@shared/ipc-channels';
import type { MediaPathStatus, MediaSearchResult, MediaSearchSource } from '@shared/media';
import type { ProjectLoadResult, ProjectSaveOptions } from '@shared/project';
import type { RecentProjectEntry, RecentProjectRenameResult } from '@shared/recent-projects';
import { app, dialog, ipcMain } from 'electron';
import { updateRecentProjectsMenu } from '../app-menu';
import { wrapHandler } from '../ipc-error-handler';
import { consumePendingProjectPath } from '../project-file-integration';

const MAX_RECENT_PROJECTS = 10;
const MAX_MEDIA_SCAN_FILES = 20_000;
const MAX_MEDIA_SCAN_DEPTH = 12;

export interface LegacyProjectCleanupResult {
  status: 'already-clean' | 'cleaned';
  outputPath?: string;
  removedFieldCount: number;
}

export function sanitizeProjectJsonForDisk(
  json: string,
  pretty = false,
): { json: string; removedFields: string[] } {
  const parsed = JSON.parse(json) as unknown;
  const { value, removedFields } = stripCredentialFields(parsed);
  return {
    json: JSON.stringify(value, null, pretty ? 2 : undefined),
    removedFields,
  };
}

/** Durable same-directory temp write followed by one atomic rename. */
export function atomicWriteFileSync(filePath: string, data: string): void {
  const directory = dirname(filePath);
  mkdirSync(directory, { recursive: true });
  const tempPath = join(directory, `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  let descriptor: number | null = null;

  try {
    descriptor = openSync(tempPath, 'wx');
    writeFileSync(descriptor, data, 'utf-8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(tempPath, filePath);

    // Persist the directory entry where the platform supports directory fsync.
    if (process.platform !== 'win32') {
      try {
        const directoryDescriptor = openSync(directory, 'r');
        try {
          fsyncSync(directoryDescriptor);
        } finally {
          closeSync(directoryDescriptor);
        }
      } catch {
        // Some filesystems do not allow opening directories. The file rename is complete.
      }
    }
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    if (existsSync(tempPath)) unlinkSync(tempPath);
    throw error;
  }
}

function cleanCopyDefaultPath(filePath: string): string {
  const extension = extname(filePath);
  const stem = basename(filePath, extension);
  return join(dirname(filePath), `${stem}.clean.batchclip`);
}

function suggestedProjectPath(name: string): string {
  const safeName =
    name
      .trim()
      .replace(/[\\/:*?"<>|%]/g, '-')
      .replace(/\.+$/g, '') || 'project';
  return `${safeName}.batchclip`;
}

export function areSameProjectPath(
  sourcePath: string,
  outputPath: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const source = resolve(sourcePath);
  const output = resolve(outputPath);
  return platform === 'win32' || platform === 'darwin'
    ? source.toLocaleLowerCase('en-US') === output.toLocaleLowerCase('en-US')
    : source === output;
}

const MAX_RECENT_FRAME_LENGTH = 900_000;

function safeRecentFrame(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_RECENT_FRAME_LENGTH) return null;
  return /^data:image\/(?:png|jpe?g|webp);base64,/i.test(value) ? value : null;
}

function normalizeRecentProject(value: Partial<RecentProjectEntry>): RecentProjectEntry | null {
  if (typeof value.path !== 'string' || typeof value.name !== 'string') return null;
  return {
    path: value.path,
    name: value.name,
    sourceName: typeof value.sourceName === 'string' ? value.sourceName : null,
    lastOpened: typeof value.lastOpened === 'number' ? value.lastOpened : 0,
    clipCount: typeof value.clipCount === 'number' ? value.clipCount : 0,
    selectedCount: typeof value.selectedCount === 'number' ? value.selectedCount : 0,
    sourceCount: typeof value.sourceCount === 'number' ? value.sourceCount : 0,
    kind: value.kind === 'longform' ? 'longform' : 'short',
    stage: typeof value.stage === 'string' ? value.stage : value.clipCount ? 'ready' : 'idle',
    missingMedia: !existsSync(value.path) || value.missingMedia === true,
    pinned: value.pinned === true,
    poster: safeRecentFrame(value.poster),
    selectedFrames: Array.isArray(value.selectedFrames)
      ? value.selectedFrames
          .flatMap((frame) => {
            const safeFrame = safeRecentFrame(frame);
            return safeFrame ? [safeFrame] : [];
          })
          .slice(0, 3)
      : [],
  };
}

function getRecentProjectsFilePath(): string {
  return join(app.getPath('userData'), 'recent-projects.json');
}

export function loadRecentProjects(): RecentProjectEntry[] {
  try {
    const filePath = getRecentProjectsFilePath();
    if (!existsSync(filePath)) return [];
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<RecentProjectEntry>[];
    return Array.isArray(parsed)
      ? parsed.flatMap((entry) => {
          const normalized = normalizeRecentProject(entry);
          return normalized ? [normalized] : [];
        })
      : [];
  } catch {
    return [];
  }
}

type RecentProjectInput = Pick<
  RecentProjectEntry,
  'path' | 'name' | 'lastOpened' | 'clipCount' | 'sourceCount'
> &
  Partial<RecentProjectEntry>;

export function saveRecentProjects(entries: RecentProjectInput[]): void {
  try {
    atomicWriteFileSync(getRecentProjectsFilePath(), JSON.stringify(entries, null, 2));
    updateRecentProjectsMenu(entries);
  } catch {
    // Recents are convenience metadata; project writes surface their own errors.
  }
}

export function addRecentProject(entry: RecentProjectEntry): void {
  const entries = loadRecentProjects();
  const existing = entries.find((candidate) => candidate.path === entry.path);
  const filtered = entries.filter((candidate) => candidate.path !== entry.path);
  const merged: RecentProjectEntry = {
    ...entry,
    pinned: existing?.pinned ?? entry.pinned,
    poster: entry.poster ?? existing?.poster ?? null,
    selectedFrames: entry.selectedFrames.length
      ? entry.selectedFrames
      : (existing?.selectedFrames ?? []),
  };
  saveRecentProjects([merged, ...filtered].slice(0, MAX_RECENT_PROJECTS));
  try {
    app.addRecentDocument(entry.path);
  } catch {
    // Unsupported on some Linux desktops.
  }
}

function buildRecentEntry(filePath: string, json: string): RecentProjectEntry {
  const project = JSON.parse(json);
  const sources = Array.isArray(project.sources) ? project.sources : [];
  const clips = Object.values(project.clips ?? {}).flat() as Array<Record<string, unknown>>;
  const stitchedClips = Object.values(project.stitchedClips ?? {}).flat() as Array<
    Record<string, unknown>
  >;
  const allClips = [...clips, ...stitchedClips];
  const selectedClips = allClips.filter((clip) => clip.status === 'approved');
  const selectedFrames = selectedClips
    .flatMap((clip) => {
      const frame = safeRecentFrame(clip.customThumbnail) ?? safeRecentFrame(clip.thumbnail);
      return frame ? [frame] : [];
    })
    .slice(0, 3);
  const sourcePoster = sources
    .map((source: Record<string, unknown>) => safeRecentFrame(source.thumbnail))
    .find((frame: string | null): frame is string => frame !== null);
  const fallbackClipPoster = allClips
    .map((clip) => safeRecentFrame(clip.customThumbnail) ?? safeRecentFrame(clip.thumbnail))
    .find((frame): frame is string => frame !== null);
  const name =
    (typeof project.identity?.displayName === 'string' && project.identity.displayName.trim()) ||
    basename(filePath, extname(filePath)) ||
    'Untitled Project';
  const isLongform =
    project.settings?.outputMode === 'longform' ||
    Object.keys(project.longformPlans ?? {}).length > 0;
  const missingMedia = sources.some(
    (source: Record<string, unknown>) =>
      source.origin === 'file' &&
      typeof source.path === 'string' &&
      source.path.length > 0 &&
      !existsSync(source.path),
  );
  return {
    path: filePath,
    name,
    sourceName: typeof sources[0]?.name === 'string' ? sources[0].name : null,
    lastOpened: Date.now(),
    clipCount: allClips.length,
    selectedCount: selectedClips.length,
    sourceCount: sources.length,
    kind: isLongform ? 'longform' : 'short',
    stage: typeof project.workspace?.stage === 'string' ? project.workspace.stage : 'idle',
    missingMedia,
    pinned: false,
    poster: selectedFrames[0] ?? sourcePoster ?? fallbackClipPoster ?? null,
    selectedFrames,
  };
}

function trackRecentProject(filePath: string, json: string): void {
  try {
    addRecentProject(buildRecentEntry(filePath, json));
  } catch {
    // A valid project write must not fail because optional recent metadata is malformed.
  }
}

export function projectJsonForPath(json: string, filePath: string, pretty: boolean): string {
  const sanitized = sanitizeProjectJsonForDisk(json).json;
  const project = JSON.parse(sanitized) as Record<string, unknown>;
  // Snapshot identity stays in the recovery slot, never in the normal project file.
  delete project.recovery;
  const existingIdentity =
    project.identity && typeof project.identity === 'object' && !Array.isArray(project.identity)
      ? (project.identity as Record<string, unknown>)
      : {};
  project.identity = {
    ...existingIdentity,
    filePath,
  };
  return JSON.stringify(project, null, pretty ? 2 : undefined);
}

function rewriteProjectIdentity(
  json: string,
  filePath: string,
  displayName: string,
  duplicate: boolean,
): string {
  const project = JSON.parse(projectJsonForPath(json, filePath, false)) as Record<string, unknown>;
  const identity = project.identity as Record<string, unknown>;
  const now = Date.now();
  project.identity = {
    ...identity,
    ...(duplicate ? { id: randomUUID(), createdAt: now } : {}),
    displayName,
    filePath,
    modifiedAt: now,
  };
  return JSON.stringify(project, null, 2);
}

function nextCopyPath(sourcePath: string): string {
  const extension = extname(sourcePath) || '.batchclip';
  const stem = basename(sourcePath, extension);
  for (let index = 1; index < 10_000; index += 1) {
    const suffix = index === 1 ? ' Copy' : ` Copy ${index}`;
    const candidate = join(dirname(sourcePath), `${stem}${suffix}${extension}`);
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error("Couldn't find an available filename for the project copy");
}

function requireTrackedProjectPath(path: string): void {
  const trackedProject =
    extname(path).toLowerCase() === '.batchclip' &&
    loadRecentProjects().some((entry) => areSameProjectPath(entry.path, path));
  if (!trackedProject) {
    throw new Error('This action is limited to BatchClip files shown in Recents');
  }
}

export function setRecentProjectPinned(path: string, pinned: boolean): RecentProjectEntry[] {
  const entries = loadRecentProjects().map((entry) =>
    entry.path === path ? { ...entry, pinned } : entry,
  );
  saveRecentProjects(entries);
  return entries;
}

export function renameRecentProject(path: string, displayName: string): RecentProjectRenameResult {
  requireTrackedProjectPath(path);
  if (!existsSync(path)) throw new Error('The project file is missing. Remove it from Recents.');
  const trimmedName = displayName.trim();
  if (!trimmedName) throw new Error('Enter a project name');
  const nextPath = join(dirname(path), suggestedProjectPath(trimmedName));
  if (!areSameProjectPath(path, nextPath) && existsSync(nextPath)) {
    throw new Error(`A project named ${basename(nextPath)} already exists in this folder`);
  }

  const json = rewriteProjectIdentity(readFileSync(path, 'utf-8'), nextPath, trimmedName, false);
  atomicWriteFileSync(nextPath, json);
  if (!areSameProjectPath(path, nextPath)) unlinkSync(path);
  saveRecentProjects(loadRecentProjects().filter((entry) => entry.path !== path));
  const entry = buildRecentEntry(nextPath, json);
  addRecentProject(entry);
  return { oldPath: path, entry };
}

export function duplicateRecentProject(path: string): RecentProjectEntry {
  requireTrackedProjectPath(path);
  if (!existsSync(path)) throw new Error('The project file is missing. Remove it from Recents.');
  const nextPath = nextCopyPath(path);
  const copyName = basename(nextPath, extname(nextPath));
  const json = rewriteProjectIdentity(readFileSync(path, 'utf-8'), nextPath, copyName, true);
  atomicWriteFileSync(nextPath, json);
  const entry = buildRecentEntry(nextPath, json);
  addRecentProject(entry);
  return entry;
}

export function deleteRecentProject(path: string): void {
  requireTrackedProjectPath(path);
  if (existsSync(path)) unlinkSync(path);
  saveRecentProjects(loadRecentProjects().filter((entry) => entry.path !== path));
}

function readProject(filePath: string): ProjectLoadResult {
  const json = projectJsonForPath(readFileSync(filePath, 'utf-8'), filePath, false);
  trackRecentProject(filePath, json);
  return { json, filePath };
}

function recoveryPath(): string {
  return join(app.getPath('userData'), 'recovery', 'autosave.batchclip');
}

export function checkMediaPaths(paths: string[]): MediaPathStatus[] {
  return paths.map((path) => {
    let available = false;
    try {
      available = path.trim().length > 0 && statSync(path).isFile();
    } catch {
      available = false;
    }
    return { path, available };
  });
}

/** Find moved media by filename without following symlinks or scanning indefinitely. */
export function searchMediaFolder(
  folderPath: string,
  sources: MediaSearchSource[],
): MediaSearchResult {
  const wantedNames = new Set(
    sources.map((source) => basename(source.name || source.path).toLowerCase()),
  );
  const candidates = new Map<string, string[]>();
  let scannedFiles = 0;
  let truncated = false;

  const walk = (directory: string, depth: number): void => {
    if (truncated || depth > MAX_MEDIA_SCAN_DEPTH) return;
    let entries: import('node:fs').Dirent<string>[];
    try {
      entries = readdirSync(directory, { withFileTypes: true, encoding: 'utf8' });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (truncated) break;
      const candidatePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(candidatePath, depth + 1);
      } else if (entry.isFile()) {
        scannedFiles += 1;
        if (scannedFiles >= MAX_MEDIA_SCAN_FILES) truncated = true;
        const key = entry.name.toLowerCase();
        if (!wantedNames.has(key)) continue;
        const matches = candidates.get(key) ?? [];
        matches.push(candidatePath);
        candidates.set(key, matches);
      }
    }
  };

  walk(folderPath, 0);

  const matches: Record<string, string> = {};
  for (const source of sources) {
    const key = basename(source.name || source.path).toLowerCase();
    const options = candidates.get(key);
    if (!options || options.length === 0) continue;
    // Prefer the shortest path, then lexical order. This is deterministic when
    // duplicate filenames exist and keeps the chosen file close to the folder root.
    options.sort((left, right) => left.length - right.length || left.localeCompare(right));
    const match = options[0];
    if (match) matches[source.id] = match;
  }

  return { folderPath, matches, scannedFiles, truncated };
}

export function registerProjectHandlers(): void {
  ipcMain.handle(
    Ch.Invoke.PROJECT_CHECK_MEDIA,
    wrapHandler(Ch.Invoke.PROJECT_CHECK_MEDIA, (_event, paths: string[]) => checkMediaPaths(paths)),
  );

  ipcMain.handle(
    Ch.Invoke.PROJECT_SEARCH_MEDIA_FOLDER,
    wrapHandler(
      Ch.Invoke.PROJECT_SEARCH_MEDIA_FOLDER,
      (_event, folderPath: string, sources: MediaSearchSource[]) =>
        searchMediaFolder(folderPath, sources),
    ),
  );

  ipcMain.handle(
    Ch.Invoke.PROJECT_GET_RECENT,
    wrapHandler(Ch.Invoke.PROJECT_GET_RECENT, (): RecentProjectEntry[] => loadRecentProjects()),
  );

  ipcMain.handle(
    Ch.Invoke.PROJECT_ADD_RECENT,
    wrapHandler(Ch.Invoke.PROJECT_ADD_RECENT, (_event, entry: RecentProjectEntry) => {
      addRecentProject(entry);
    }),
  );

  ipcMain.handle(
    Ch.Invoke.PROJECT_REMOVE_RECENT,
    wrapHandler(Ch.Invoke.PROJECT_REMOVE_RECENT, (_event, path: string) => {
      saveRecentProjects(loadRecentProjects().filter((entry) => entry.path !== path));
    }),
  );

  ipcMain.handle(
    Ch.Invoke.PROJECT_SET_RECENT_PINNED,
    wrapHandler(
      Ch.Invoke.PROJECT_SET_RECENT_PINNED,
      (_event, path: string, pinned: boolean): RecentProjectEntry[] =>
        setRecentProjectPinned(path, pinned),
    ),
  );

  ipcMain.handle(
    Ch.Invoke.PROJECT_RENAME_RECENT,
    wrapHandler(
      Ch.Invoke.PROJECT_RENAME_RECENT,
      (_event, path: string, displayName: string): RecentProjectRenameResult =>
        renameRecentProject(path, displayName),
    ),
  );

  ipcMain.handle(
    Ch.Invoke.PROJECT_DUPLICATE_RECENT,
    wrapHandler(
      Ch.Invoke.PROJECT_DUPLICATE_RECENT,
      (_event, path: string): RecentProjectEntry => duplicateRecentProject(path),
    ),
  );

  ipcMain.handle(
    Ch.Invoke.PROJECT_DELETE_RECENT,
    wrapHandler(Ch.Invoke.PROJECT_DELETE_RECENT, (_event, path: string) => {
      deleteRecentProject(path);
    }),
  );

  ipcMain.handle(
    Ch.Invoke.PROJECT_CONSUME_PENDING_OPEN,
    wrapHandler(Ch.Invoke.PROJECT_CONSUME_PENDING_OPEN, (): string | null =>
      consumePendingProjectPath(),
    ),
  );

  ipcMain.handle(
    Ch.Invoke.PROJECT_CLEAR_RECENT,
    wrapHandler(Ch.Invoke.PROJECT_CLEAR_RECENT, () => {
      saveRecentProjects([]);
      try {
        app.clearRecentDocuments();
      } catch {
        // Unsupported on some Linux desktops.
      }
    }),
  );

  ipcMain.handle(
    Ch.Invoke.PROJECT_CLEAN_LEGACY,
    wrapHandler(
      Ch.Invoke.PROJECT_CLEAN_LEGACY,
      async (): Promise<LegacyProjectCleanupResult | null> => {
        const openResult = await dialog.showOpenDialog({
          title: 'Choose a Legacy BatchClip Project',
          properties: ['openFile'],
          filters: [{ name: 'BatchClip Project', extensions: ['batchclip'] }],
        });
        if (openResult.canceled || openResult.filePaths.length === 0) return null;

        const sourcePath = openResult.filePaths[0];
        if (!sourcePath) return null;
        const cleaned = sanitizeProjectJsonForDisk(readFileSync(sourcePath, 'utf-8'), true);
        if (cleaned.removedFields.length === 0) {
          return { status: 'already-clean', removedFieldCount: 0 };
        }

        const saveResult = await dialog.showSaveDialog({
          title: 'Save Clean Project Copy',
          defaultPath: cleanCopyDefaultPath(sourcePath),
          filters: [{ name: 'BatchClip Project', extensions: ['batchclip'] }],
        });
        if (saveResult.canceled || !saveResult.filePath) return null;
        if (areSameProjectPath(sourcePath, saveResult.filePath)) {
          throw new Error('Choose a different filename so the original project stays unchanged');
        }

        atomicWriteFileSync(saveResult.filePath, cleaned.json);
        return {
          status: 'cleaned',
          outputPath: saveResult.filePath,
          removedFieldCount: cleaned.removedFields.length,
        };
      },
    ),
  );

  ipcMain.handle(
    Ch.Invoke.PROJECT_SAVE,
    wrapHandler(
      Ch.Invoke.PROJECT_SAVE,
      async (_event, json: string, options: ProjectSaveOptions): Promise<string | null> => {
        let filePath = options.currentPath;
        if (!filePath || options.forceDialog) {
          const result = await dialog.showSaveDialog({
            title: options.forceDialog ? 'Save Project As' : 'Save Project',
            defaultPath: options.currentPath ?? suggestedProjectPath(options.suggestedName),
            filters: [{ name: 'BatchClip Project', extensions: ['batchclip'] }],
          });
          if (result.canceled || !result.filePath) return null;
          filePath = result.filePath;
        }

        const sanitized = projectJsonForPath(json, filePath, true);
        atomicWriteFileSync(filePath, sanitized);
        trackRecentProject(filePath, sanitized);
        return filePath;
      },
    ),
  );

  ipcMain.handle(
    Ch.Invoke.PROJECT_LOAD,
    wrapHandler(Ch.Invoke.PROJECT_LOAD, async (): Promise<ProjectLoadResult | null> => {
      const result = await dialog.showOpenDialog({
        title: 'Open Project',
        properties: ['openFile'],
        filters: [{ name: 'BatchClip Project', extensions: ['batchclip'] }],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const filePath = result.filePaths[0];
      return filePath ? readProject(filePath) : null;
    }),
  );

  ipcMain.handle(
    Ch.Invoke.PROJECT_AUTO_SAVE,
    wrapHandler(
      Ch.Invoke.PROJECT_AUTO_SAVE,
      async (_event, json: string, currentPath: string | null): Promise<string> => {
        const sanitizedRecovery = sanitizeProjectJsonForDisk(json).json;
        const snapshotPath = recoveryPath();
        atomicWriteFileSync(snapshotPath, sanitizedRecovery);

        if (currentPath) {
          const projectJson = projectJsonForPath(json, currentPath, true);
          atomicWriteFileSync(currentPath, projectJson);
          trackRecentProject(currentPath, projectJson);
        }
        return snapshotPath;
      },
    ),
  );

  ipcMain.handle(
    Ch.Invoke.PROJECT_LOAD_RECOVERY,
    wrapHandler(Ch.Invoke.PROJECT_LOAD_RECOVERY, async () => {
      const snapshotPath = recoveryPath();
      if (!existsSync(snapshotPath)) return null;
      const sanitized = sanitizeProjectJsonForDisk(readFileSync(snapshotPath, 'utf-8'));
      if (sanitized.removedFields.length > 0) {
        atomicWriteFileSync(snapshotPath, sanitized.json);
      }
      return sanitized.json;
    }),
  );

  ipcMain.handle(
    Ch.Invoke.PROJECT_CLEAR_RECOVERY,
    wrapHandler(Ch.Invoke.PROJECT_CLEAR_RECOVERY, async () => {
      const snapshotPath = recoveryPath();
      if (existsSync(snapshotPath)) unlinkSync(snapshotPath);
    }),
  );

  ipcMain.handle(
    Ch.Invoke.PROJECT_LOAD_FROM_PATH,
    wrapHandler(
      Ch.Invoke.PROJECT_LOAD_FROM_PATH,
      async (_event, filePath: string): Promise<ProjectLoadResult | null> => {
        return existsSync(filePath) ? readProject(filePath) : null;
      },
    ),
  );
}
