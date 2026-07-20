import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';
import { describe, expect, it, vi } from 'vitest';

const menuMocks = vi.hoisted(() => ({
  updateRecentProjectsMenu: vi.fn(),
}));

vi.mock('../app-menu', () => menuMocks);

vi.mock('electron', () => ({
  app: {
    addRecentDocument: vi.fn(),
    clearRecentDocuments: vi.fn(),
    getPath: vi.fn(() => '/virtual/user-data'),
  },
  dialog: {},
  ipcMain: { handle: vi.fn() },
}));

import {
  areSameProjectPath,
  atomicWriteFileSync,
  checkMediaPaths,
  deleteRecentProject,
  duplicateRecentProject,
  projectJsonForPath,
  renameRecentProject,
  sanitizeProjectJsonForDisk,
  saveRecentProjects,
  searchMediaFolder,
} from './project-handlers';

const TOKENS = {
  gemini: 'AIzaSyMainBoundaryRegression1234567890',
  pexels: 'pexels-main-boundary-regression-123456',
  fal: 'fal-main:boundary-regression-secret-123456',
};

describe('project IPC disk boundary', () => {
  it('refreshes the native Open Recent menu after writing recent-project metadata', () => {
    const directory = mkdtempSync(join(tmpdir(), 'batchclip-recents-'));
    const recentsPath = join(directory, 'recent-projects.json');
    const entries = [
      {
        path: '/projects/founder.batchclip',
        name: 'Founder Cut',
        lastOpened: 1_700_000_000_000,
        clipCount: 3,
        sourceCount: 1,
      },
    ];
    vi.mocked(app.getPath).mockReturnValue(directory);
    menuMocks.updateRecentProjectsMenu.mockClear();

    try {
      saveRecentProjects(entries);

      expect(JSON.parse(readFileSync(recentsPath, 'utf8'))).toEqual(entries);
      expect(menuMocks.updateRecentProjectsMenu).toHaveBeenCalledWith(entries);
    } finally {
      vi.mocked(app.getPath).mockReturnValue('/virtual/user-data');
      if (readdirSync(directory).includes('recent-projects.json')) unlinkSync(recentsPath);
      rmdirSync(directory);
    }
  });

  it('renames, duplicates, and deletes project files with contact-sheet metadata', () => {
    const directory = mkdtempSync(join(tmpdir(), 'batchclip-project-actions-'));
    const projectPath = join(directory, 'Original.batchclip');
    const sourcePath = join(directory, 'interview.mp4');
    const poster = 'data:image/png;base64,U09VUkNF';
    const selectedFrame = 'data:image/png;base64,U0VMRUNURUQ=';
    vi.mocked(app.getPath).mockReturnValue(directory);
    writeFileSync(sourcePath, 'video');
    writeFileSync(
      projectPath,
      JSON.stringify({
        version: 4,
        identity: { id: 'original-id', displayName: 'Original' },
        sources: [
          {
            id: 'source-1',
            name: 'interview.mp4',
            path: sourcePath,
            origin: 'file',
            thumbnail: poster,
          },
        ],
        clips: {
          'source-1': [
            {
              id: 'clip-1',
              status: 'approved',
              thumbnail: selectedFrame,
            },
          ],
        },
        stitchedClips: {},
        longformPlans: {},
        settings: { outputMode: 'short' },
        workspace: { stage: 'ready' },
      }),
    );
    saveRecentProjects([
      {
        path: projectPath,
        name: 'Original',
        lastOpened: Date.now(),
        clipCount: 1,
        sourceCount: 1,
      },
    ]);

    try {
      const renamed = renameRecentProject(projectPath, 'Launch Selects');
      expect(renamed.entry).toMatchObject({
        name: 'Launch Selects',
        sourceName: 'interview.mp4',
        selectedCount: 1,
        clipCount: 1,
        stage: 'ready',
        missingMedia: false,
        poster: selectedFrame,
        selectedFrames: [selectedFrame],
      });
      expect(existsSync(projectPath)).toBe(false);
      expect(existsSync(renamed.entry.path)).toBe(true);

      const duplicate = duplicateRecentProject(renamed.entry.path);
      expect(duplicate.name).toBe('Launch Selects Copy');
      expect(existsSync(duplicate.path)).toBe(true);
      const duplicatedJson = JSON.parse(readFileSync(duplicate.path, 'utf8'));
      expect(duplicatedJson.identity.id).not.toBe('original-id');
      expect(duplicatedJson.identity.filePath).toBe(duplicate.path);

      deleteRecentProject(duplicate.path);
      expect(existsSync(duplicate.path)).toBe(false);
    } finally {
      vi.mocked(app.getPath).mockReturnValue('/virtual/user-data');
      for (const filename of readdirSync(directory)) unlinkSync(join(directory, filename));
      rmdirSync(directory);
    }
  });

  it('limits destructive file actions to BatchClip projects tracked in Recents', () => {
    const directory = mkdtempSync(join(tmpdir(), 'batchclip-untracked-project-'));
    const untrackedPath = join(directory, 'untracked.batchclip');
    writeFileSync(untrackedPath, JSON.stringify({ identity: { displayName: 'Untracked' } }));

    try {
      expect(() => renameRecentProject(untrackedPath, 'Renamed')).toThrow(/shown in Recents/);
      expect(() => deleteRecentProject(untrackedPath)).toThrow(/shown in Recents/);
      expect(existsSync(untrackedPath)).toBe(true);
    } finally {
      unlinkSync(untrackedPath);
      rmdirSync(directory);
    }
  });

  it('strips known and future credential fields before any project or recovery write', () => {
    const input = JSON.stringify({
      version: 1,
      settings: {
        geminiApiKey: TOKENS.gemini,
        pexelsApiKey: TOKENS.pexels,
        falApiKey: TOKENS.fal,
        minScore: 8,
      },
      nested: { apiKey: 'future-provider-secret', keep: true },
    });

    const cleaned = sanitizeProjectJsonForDisk(input, true);

    expect(cleaned.removedFields).toEqual([
      'settings.geminiApiKey',
      'settings.pexelsApiKey',
      'settings.falApiKey',
      'nested.apiKey',
    ]);
    for (const token of [...Object.values(TOKENS), 'future-provider-secret']) {
      expect(cleaned.json).not.toContain(token);
    }
    expect(JSON.parse(cleaned.json)).toEqual({
      version: 1,
      settings: { minScore: 8 },
      nested: { keep: true },
    });
  });

  it('keeps recovery identity out of the normal project file during autosave', () => {
    const projectJson = projectJsonForPath(
      JSON.stringify({
        version: 3,
        identity: { displayName: 'Founder Launch Cut', filePath: null },
        recovery: { id: 'snapshot-2', savedAt: 123, stage: 'ready' },
        sources: [],
        transcriptions: {},
        clips: {},
        settings: {},
      }),
      '/projects/founder-launch.batchclip',
      false,
    );

    expect(JSON.parse(projectJson)).toMatchObject({
      identity: {
        displayName: 'Founder Launch Cut',
        filePath: '/projects/founder-launch.batchclip',
      },
    });
    expect(JSON.parse(projectJson)).not.toHaveProperty('recovery');
  });

  it('atomically replaces a project without leaving a temp file behind', () => {
    const directory = mkdtempSync(join(tmpdir(), 'batchclip-atomic-'));
    const projectPath = join(directory, 'creator-cut.batchclip');
    try {
      writeFileSync(projectPath, 'old project', 'utf-8');

      atomicWriteFileSync(projectPath, 'complete new project');

      expect(readFileSync(projectPath, 'utf-8')).toBe('complete new project');
      expect(readdirSync(directory)).toEqual(['creator-cut.batchclip']);
    } finally {
      if (readdirSync(directory).includes('creator-cut.batchclip')) unlinkSync(projectPath);
      rmdirSync(directory);
    }
  });

  it('detects offline media and rebases matching filenames from one folder search', () => {
    const directory = mkdtempSync(join(tmpdir(), 'batchclip-media-'));
    const nested = join(directory, 'camera-a');
    const foundPath = join(nested, 'founder-interview.mp4');
    mkdirSync(nested);
    writeFileSync(foundPath, 'fixture', 'utf-8');

    try {
      expect(checkMediaPaths([foundPath, join(directory, 'missing.mp4')])).toEqual([
        { path: foundPath, available: true },
        { path: join(directory, 'missing.mp4'), available: false },
      ]);

      const result = searchMediaFolder(directory, [
        {
          id: 'source-1',
          path: '/old-drive/shoot/camera-a/founder-interview.mp4',
          name: 'founder-interview.mp4',
        },
        { id: 'source-2', path: '/old-drive/shoot/missing.mp4', name: 'missing.mp4' },
      ]);

      expect(result.matches).toEqual({ 'source-1': foundPath });
      expect(result.scannedFiles).toBe(1);
      expect(result.truncated).toBe(false);
    } finally {
      unlinkSync(foundPath);
      rmdirSync(nested);
      rmdirSync(directory);
    }
  });

  it('protects the original file on case-insensitive desktop filesystems', () => {
    expect(
      areSameProjectPath(
        '/Users/Creator/Project.batchclip',
        '/users/creator/project.batchclip',
        'darwin',
      ),
    ).toBe(true);
    expect(
      areSameProjectPath(
        'C:\\Creators\\Project.batchclip',
        'c:\\creators\\project.batchclip',
        'win32',
      ),
    ).toBe(true);
    expect(
      areSameProjectPath(
        '/home/creator/Project.batchclip',
        '/home/creator/project.batchclip',
        'linux',
      ),
    ).toBe(false);
  });
});
