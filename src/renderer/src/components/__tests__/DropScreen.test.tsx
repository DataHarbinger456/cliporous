/**
 * DropScreen.test.tsx
 *
 * - File drop on the drop-zone Card dispatches the file pipeline:
 *     • a SourceVideo with `origin: 'file'` is added
 *     • that source becomes active
 *     • `usePipeline().processVideo` is invoked with the new source
 * - Pasting a URL + pressing Enter dispatches the YouTube branch:
 *     • SourceVideo has `origin: 'youtube'` and the URL stored
 *     • processVideo is invoked
 * - Recent projects fetched from `window.api.getRecentProjects()` render
 *   as clickable rows.
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '@/store';
import { installApiStub, resetStore } from './test-utils';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const processVideoMock = vi.fn(async () => undefined);

const processLongformMock = vi.fn(async () => undefined);

vi.mock('@/hooks', () => ({
  usePipeline: () => ({
    processVideo: processVideoMock,
    cancelProcessing: () => {},
    isProcessing: () => false,
  }),
  useLongformPipeline: () => ({
    processLongform: processLongformMock,
    cancelLongform: () => {},
  }),
  usePythonSetup: () => ({
    refresh: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
  }),
}));

vi.mock('@/services', () => ({
  createNewProject: vi.fn(),
  loadProject: vi.fn(async () => false),
  loadProjectFromPath: vi.fn(async () => false),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStore();
  installApiStub();
  processVideoMock.mockClear();
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a synthetic File object suitable for jsdom drag-and-drop. */
function makeVideoFile(name = 'clip.mp4'): File {
  return new File([new Uint8Array([0])], name, { type: 'video/mp4' });
}

/** Build a DataTransfer-like object jsdom accepts on drop events. */
function makeDataTransfer(files: File[]): DataTransfer {
  return {
    files: files as unknown as FileList,
    items: files.map((f) => ({
      kind: 'file',
      type: f.type,
      getAsFile: () => f,
    })) as unknown as DataTransferItemList,
    types: ['Files'],
    dropEffect: 'copy',
    effectAllowed: 'all',
    clearData: () => {},
    getData: () => '',
    setData: () => {},
    setDragImage: () => {},
  } as unknown as DataTransfer;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DropScreen', () => {
  it('accepts a file drop and dispatches the source action', async () => {
    // Short-form scoring is gated on a Gemini key — seed one so the happy path runs.
    useStore.setState((s) => ({ settings: { ...s.settings, geminiApiKey: 'test-key' } }));
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    const dropZone = screen.getByRole('button', {
      name: /drop a video file or paste a url/i,
    });

    const file = makeVideoFile('intro.mp4');
    const dataTransfer = makeDataTransfer([file]);

    fireEvent.drop(dropZone, { dataTransfer });

    await waitFor(() => {
      expect(processVideoMock).toHaveBeenCalledTimes(1);
    });

    // Source was added with origin 'file' and is now active.
    const state = useStore.getState();
    expect(state.sources).toHaveLength(1);
    expect(state.sources[0]).toMatchObject({
      origin: 'file',
      path: '/virtual/intro.mp4',
      name: 'intro.mp4',
    });
    expect(state.activeSourceId).toBe(state.sources.at(0)?.id);

    expect(processVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'file', path: '/virtual/intro.mp4' }),
    );
  });

  it('accepts a URL paste + Enter and dispatches the YouTube action', async () => {
    useStore.setState((s) => ({ settings: { ...s.settings, geminiApiKey: 'test-key' } }));
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    const input = screen.getByLabelText(/video url or file path/i);
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

    fireEvent.change(input, { target: { value: url } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(processVideoMock).toHaveBeenCalledTimes(1);
    });

    const state = useStore.getState();
    expect(state.sources).toHaveLength(1);
    expect(state.sources[0]).toMatchObject({
      origin: 'youtube',
      youtubeUrl: url,
      name: url,
    });
    expect(state.activeSourceId).toBe(state.sources.at(0)?.id);
  });

  it('queues a source chosen before setup and continues after setup succeeds', async () => {
    useStore.setState((state) => ({
      settings: { ...state.settings, geminiApiKey: 'test-key' },
      pythonStatus: 'checking',
    }));
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    const dropZone = screen.getByRole('button', {
      name: /drop a video file or paste a url/i,
    });
    fireEvent.drop(dropZone, {
      dataTransfer: makeDataTransfer([makeVideoFile('queued-interview.mp4')]),
    });

    await waitFor(() => expect(useStore.getState().sources).toHaveLength(1));
    expect(processVideoMock).not.toHaveBeenCalled();

    act(() => {
      useStore.setState({
        pythonStatus: 'not-setup',
        pythonSetupDetails: {
          ready: false,
          stage: 'not-setup',
          storagePath: '/virtual/BatchClip/python-env',
          freeDiskBytes: 20 * 1024 ** 3,
          networkOnline: true,
          venvPath: null,
          embeddedPythonAvailable: false,
        },
      });
    });
    expect(await screen.findByText('Your video is queued')).toBeInTheDocument();
    expect(
      screen.getByText(/queued-interview\.mp4 will continue automatically/),
    ).toBeInTheDocument();

    act(() => useStore.setState({ pythonStatus: 'ready' }));
    await waitFor(() => expect(processVideoMock).toHaveBeenCalledTimes(1));
  });

  it('blocks a keyless short-form drop and surfaces the missing-key gate', async () => {
    // No Gemini key in store and secrets.get returns null — the gate must fire.
    useStore.setState((s) => ({ settings: { ...s.settings, geminiApiKey: '' } }));
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    const dropZone = screen.getByRole('button', {
      name: /drop a video file or paste a url/i,
    });
    fireEvent.drop(dropZone, { dataTransfer: makeDataTransfer([makeVideoFile('intro.mp4')]) });

    expect(await screen.findByText(/gemini api key required/i)).toBeInTheDocument();
    expect(processVideoMock).not.toHaveBeenCalled();
    expect(useStore.getState().sources).toHaveLength(0);
  });

  it('allows a keyless local Promo Mode recording to start', async () => {
    useStore.setState((state) => ({
      settings: { ...state.settings, geminiApiKey: '' },
      processingConfig: { ...state.processingConfig, promoMode: true },
    }));
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    const dropZone = screen.getByRole('button', {
      name: /drop a video file or paste a url/i,
    });
    fireEvent.drop(dropZone, {
      dataTransfer: makeDataTransfer([makeVideoFile('scripted-promo.mp4')]),
    });

    await waitFor(() => expect(processVideoMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/gemini api key required/i)).not.toBeInTheDocument();
  });

  it('creates a named project with a chosen source and output mode', async () => {
    useStore.setState((state) => ({ settings: { ...state.settings, geminiApiKey: 'test-key' } }));
    installApiStub({ openFiles: vi.fn(async () => ['/virtual/creator-interview.mp4']) });

    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    fireEvent.click(screen.getByRole('button', { name: /new project/i }));
    fireEvent.change(screen.getByLabelText(/project name/i), {
      target: { value: 'Launch selects' },
    });
    fireEvent.click(screen.getByRole('button', { name: /choose video/i }));
    expect(await screen.findByText('/virtual/creator-interview.mp4')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/add creative brief/i));
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/audience/i), {
      target: { value: 'Independent creators' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() => expect(processVideoMock).toHaveBeenCalledTimes(1));
    expect(useStore.getState().currentProject.displayName).toBe('Launch selects');
    expect(useStore.getState().sources[0]?.name).toBe('creator-interview.mp4');
    expect(useStore.getState().creativeBrief.audience).toBe('Independent creators');
  });

  it('renders recent projects when present', async () => {
    installApiStub({
      getRecentProjects: vi.fn(async () => [
        {
          path: '/projects/alpha.batchclip',
          name: 'Alpha',
          lastOpened: Date.now() - 60_000,
          clipCount: 4,
          sourceCount: 1,
        },
        {
          path: '/projects/beta.batchclip',
          name: 'Beta',
          lastOpened: Date.now() - 3_600_000,
          clipCount: 12,
          sourceCount: 2,
        },
      ]),
    });

    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(await screen.findByText('Beta')).toBeInTheDocument();
    expect(screen.getByText(/4 clips/)).toBeInTheDocument();
    expect(screen.getByText(/12 clips/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: /search recent projects/i }), {
      target: { value: 'Alpha' },
    });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });

  it('shows a useful empty state when no recent projects exist', async () => {
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    expect(await screen.findByText('No saved projects yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /new project/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /open project/i }).length).toBeGreaterThan(0);
  });

  it('shows a recent-project error and recovers through retry', async () => {
    const getRecentProjects = vi
      .fn()
      .mockRejectedValueOnce(new Error('Recent index unavailable'))
      .mockResolvedValueOnce([
        {
          path: '/projects/recovered.batchclip',
          name: 'Recovered project',
          sourceName: 'interview.mp4',
          lastOpened: Date.now(),
          clipCount: 2,
          selectedCount: 1,
          sourceCount: 1,
          kind: 'short',
          stage: 'ready',
          missingMedia: false,
          pinned: false,
          poster: null,
          selectedFrames: [],
        },
      ]);
    installApiStub({ getRecentProjects });

    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    expect(await screen.findByText('Recent projects could not load')).toBeInTheDocument();
    expect(screen.getByText('Recent index unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('Recovered project')).toBeInTheDocument();
    expect(getRecentProjects).toHaveBeenCalledTimes(2);
  });
});
