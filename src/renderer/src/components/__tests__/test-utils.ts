/**
 * Shared test utilities for component tests.
 *
 * - `resetStore()` wipes the Zustand store back to its initial slice values
 *   so tests don't leak fixture state through the singleton instance.
 * - `installApiStub()` swaps `window.api` with a fully-stubbed bridge so the
 *   components under test can call IPC methods without crashing the suite.
 */

import { vi } from 'vitest';
import { useStore } from '@/store';

// ---------------------------------------------------------------------------
// Store reset
// ---------------------------------------------------------------------------

export function resetStore(): void {
  // The store exposes a `reset()` action that returns project state to its
  // empty defaults. We also reset auxiliary fields the tests touch directly.
  useStore.getState().reset();
  useStore.setState({
    sources: [],
    activeSourceId: null,
    transcriptions: {},
    creatorJobs: [],
    currentProcessingJobId: null,
    isDirty: false,
    pythonStatus: 'ready',
    pythonSetupDetails: {
      ready: true,
      stage: 'ready',
      storagePath: '/virtual/BatchClip/python-env',
      freeDiskBytes: 20 * 1024 ** 3,
      networkOnline: true,
      venvPath: '/virtual/BatchClip/python-env/venv',
      embeddedPythonAvailable: false,
    },
    pythonSetupError: null,
    pythonSetupProgress: null,
  });
}

// ---------------------------------------------------------------------------
// window.api stub
// ---------------------------------------------------------------------------

/**
 * Allow tests to override individual API methods. Returns the stub object
 * so individual mocks can be inspected via `vi.mocked(...)`.
 */
export function installApiStub(
  overrides: Record<string, unknown> = {},
): Record<string, ReturnType<typeof vi.fn>> {
  const noop = (): void => {};
  const unsubscribe = (): (() => void) => () => {};

  const stub: Record<string, unknown> = {
    platform: 'darwin',
    setUiZoom: vi.fn(noop),

    // Source / dialog
    openFiles: vi.fn(async () => []),
    openDirectory: vi.fn(async () => null),
    selectCreatorAsset: vi.fn(async () => null),
    checkCreatorAssets: vi.fn(async (paths: string[]) =>
      paths.map((path) => ({ path, exists: true })),
    ),
    getPathForFile: vi.fn((file: File) => `/virtual/${file.name}`),
    getMetadata: vi.fn(async () => ({ duration: 60, width: 1920, height: 1080 })),
    extractAudio: vi.fn(async () => '/virtual/audio.wav'),
    getThumbnail: vi.fn(async () => 'data:image/png;base64,'),
    getWaveform: vi.fn(async () => Array(100).fill(0)),

    // YouTube
    downloadYouTube: vi.fn(async () => ({ ok: true, path: '/virtual/yt.mp4' })),
    onYouTubeProgress: vi.fn(unsubscribe),

    // Transcription
    transcribeVideo: vi.fn(async () => ({ words: [], segments: [], language: 'en' })),
    formatTranscriptForAI: vi.fn(async () => ''),
    onTranscribeProgress: vi.fn(unsubscribe),

    // Project
    getRecentProjects: vi.fn(async () => []),
    addRecentProject: vi.fn(async () => undefined),
    removeRecentProject: vi.fn(async () => undefined),
    setRecentProjectPinned: vi.fn(async () => []),
    renameRecentProject: vi.fn(async () => null),
    duplicateRecentProject: vi.fn(async () => null),
    deleteRecentProject: vi.fn(async () => undefined),
    consumePendingProjectOpen: vi.fn(async () => null),
    saveProject: vi.fn(async () => '/virtual/project.batchclip'),
    loadProject: vi.fn(async () => null),
    loadProjectFromPath: vi.fn(async () => null),
    autoSaveProject: vi.fn(async () => '/virtual/recovery.batchclip'),
    loadRecovery: vi.fn(async () => null),
    clearRecovery: vi.fn(async () => undefined),
    cleanLegacyProject: vi.fn(async () => null),
    onProjectNewRequest: vi.fn(unsubscribe),
    onProjectSaveRequest: vi.fn(unsubscribe),
    onProjectSaveAsRequest: vi.fn(unsubscribe),
    onProjectOpenRequest: vi.fn(unsubscribe),
    onProjectOpenRecentRequest: vi.fn(unsubscribe),
    onWhatsNewRequest: vi.fn(unsubscribe),
    onUpdateCheckRequest: vi.fn(unsubscribe),
    onUiZoomRequest: vi.fn(unsubscribe),

    // Long-form planning
    generateLongformEditPlan: vi.fn(async () => ({
      phrases: [],
      blocks: [],
      cards: [],
      reasoning: 'Test plan',
      generatedAt: Date.now(),
    })),
    onLongformEditProgress: vi.fn(unsubscribe),

    // Native Edit menu
    setHistoryMenuState: vi.fn(async () => undefined),
    onEditUndoRequest: vi.fn(unsubscribe),
    onEditRedoRequest: vi.fn(unsubscribe),

    // Render
    startBatchRender: vi.fn(async () => ({ started: true })),
    cancelRender: vi.fn(async () => undefined),
    stopRenderAfterCurrent: vi.fn(async () => undefined),
    cancelQueuedRenderJob: vi.fn(async () => undefined),
    renderSingleClip: vi.fn(async () => ({ ok: true })),
    renderPreview: vi.fn(async () => ({ previewPath: '/virtual/preview.mp4' })),
    cleanupPreview: vi.fn(async () => undefined),
    onRenderClipStart: vi.fn(unsubscribe),
    onRenderClipPrepare: vi.fn(unsubscribe),
    onRenderClipProgress: vi.fn(unsubscribe),
    onRenderClipDone: vi.fn(unsubscribe),
    onRenderClipError: vi.fn(unsubscribe),
    onRenderClipCancelled: vi.fn(unsubscribe),
    onRenderBatchDone: vi.fn(unsubscribe),
    onRenderCancelled: vi.fn(unsubscribe),
    onSegmentFallback: vi.fn(unsubscribe),
    openOutputFolder: vi.fn(async () => ''),
    getDefaultOutputDirectory: vi.fn(async () => '/default/output/BatchClip'),
    getDiskSpace: vi.fn(async () => ({ free: 20 * 1024 ** 3, total: 100 * 1024 ** 3 })),
    getEncoder: vi.fn(async () => ({ encoder: 'libx264', isHardware: false })),
    getTempSize: vi.fn(async () => ({ bytes: 0, count: 0 })),
    cleanupTemp: vi.fn(async () => ({ deleted: 0, freed: 0 })),
    getCacheSize: vi.fn(async () => ({ bytes: 0 })),
    setAutoCleanup: vi.fn(async () => undefined),
    getLogSize: vi.fn(async () => 0),
    openLogFolder: vi.fn(async () => undefined),
    logToMain: vi.fn(noop),
    checkMediaPaths: vi.fn(async (paths: string[]) =>
      paths.map((path) => ({ path, available: true })),
    ),

    // Local content-tool setup
    getPythonStatus: vi.fn(async () => ({
      ready: true,
      stage: 'ready',
      storagePath: '/virtual/BatchClip/python-env',
      freeDiskBytes: 20 * 1024 ** 3,
      networkOnline: true,
      venvPath: '/virtual/BatchClip/python-env/venv',
      embeddedPythonAvailable: false,
    })),
    startPythonSetup: vi.fn(async () => ({ started: true })),
    cancelPythonSetup: vi.fn(async () => ({ canceled: true })),
    onPythonSetupProgress: vi.fn(unsubscribe),
    onPythonSetupDone: vi.fn(unsubscribe),

    // Shell / native job feedback
    showItemInFolder: vi.fn(async () => undefined),
    sendNotification: vi.fn(async () => undefined),
    setNativeProgress: vi.fn(async () => undefined),
    setPowerSaveActive: vi.fn(async () => undefined),
    onNotificationClicked: vi.fn(unsubscribe),
    openSettingsWindow: vi.fn(async () => undefined),
    getUpdateState: vi.fn(async () => ({
      phase: 'idle',
      currentVersion: '0.1.0',
      availableVersion: null,
      progressPercent: null,
      message: null,
      manual: false,
    })),
    checkForUpdates: vi.fn(async () => ({
      phase: 'idle',
      currentVersion: '0.1.0',
      availableVersion: null,
      progressPercent: null,
      message: 'BatchClip is up to date.',
      manual: true,
    })),
    downloadUpdate: vi.fn(async () => undefined),
    installUpdate: vi.fn(async () => false),
    onUpdateState: vi.fn(unsubscribe),
    setBadge: vi.fn(noop),
  };

  // `secrets` is a namespace object on the bridge, not a bare fn. Assign it
  // after the map so the shape matches the preload API the components call.
  (stub as Record<string, unknown>).secrets = {
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
    has: vi.fn(async () => false),
    clear: vi.fn(async () => undefined),
  };

  Object.assign(stub, overrides);

  const g = globalThis as unknown as { window?: { api?: unknown } };
  if (!g.window) {
    g.window = { api: stub } as unknown as Window & typeof globalThis;
  }
  (window as unknown as { api: Record<string, unknown> }).api = stub;

  return stub as Record<string, ReturnType<typeof vi.fn>>;
}
