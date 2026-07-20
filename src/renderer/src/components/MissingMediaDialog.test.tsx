import { createStructuredError } from '@shared/errors';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '@/store';

const mediaMocks = vi.hoisted(() => ({
  locateMissingSource: vi.fn<(sourceId: string) => Promise<boolean>>(),
  refreshMissingMediaStatuses: vi.fn<() => Promise<void>>(),
  searchFolderForMissingMedia: vi.fn(),
}));

vi.mock('@/services/media-relink-service', () => mediaMocks);
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { MissingMediaDialog } from './MissingMediaDialog';

const OFFLINE_SOURCE = {
  id: 'source-offline',
  path: '/old-drive/founder-interview.mp4',
  name: 'founder-interview.mp4',
  duration: 600,
  width: 1920,
  height: 1080,
  origin: 'file' as const,
  mediaStatus: 'offline' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  useStore.getState().reset();
  useStore.setState({
    sources: [OFFLINE_SOURCE],
    activeSourceId: OFFLINE_SOURCE.id,
    transcriptions: {
      [OFFLINE_SOURCE.id]: { text: 'Safe transcript', words: [], segments: [], formattedForAI: '' },
    },
    clips: { [OFFLINE_SOURCE.id]: [] },
  });
  mediaMocks.locateMissingSource.mockResolvedValue(true);
  mediaMocks.refreshMissingMediaStatuses.mockResolvedValue();
  mediaMocks.searchFolderForMissingMedia.mockResolvedValue({
    matched: 1,
    missing: 0,
    folderPath: '/new-drive',
    truncated: false,
  });
});

afterEach(cleanup);

describe('MissingMediaDialog', () => {
  it('offers Locate and Search folder while keeping project artifacts safe', async () => {
    render(<MissingMediaDialog />);

    expect(
      await screen.findByRole('heading', { name: 'Source media is offline' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/transcript, clips, decisions, brief, and plan are safe/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Locate' }));
    await waitFor(() =>
      expect(mediaMocks.locateMissingSource).toHaveBeenCalledWith(OFFLINE_SOURCE.id),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Search folder' }));
    await waitFor(() => expect(mediaMocks.searchFolderForMissingMedia).toHaveBeenCalledOnce());
    expect(useStore.getState().transcriptions[OFFLINE_SOURCE.id]?.text).toBe('Safe transcript');
  });

  it('keeps a persistent Manage media entry point after Keep offline', async () => {
    render(<MissingMediaDialog />);

    fireEvent.click(await screen.findByRole('button', { name: 'Keep offline' }));
    const manageButton = await screen.findByRole('button', { name: 'Manage media' });
    fireEvent.click(manageButton);

    expect(
      await screen.findByRole('heading', { name: 'Source media is offline' }),
    ).toBeInTheDocument();
  });

  it('confirms Remove and deletes project artifacts without touching the disk file', async () => {
    useStore.setState((state) => ({
      workspace: {
        ...state.workspace,
        selectedClipId: OFFLINE_SOURCE.id,
        previewPlayheadByClip: { [OFFLINE_SOURCE.id]: 42 },
      },
      renderProgress: [{ clipId: OFFLINE_SOURCE.id, percent: 100, status: 'done' }],
      renderErrors: {
        [OFFLINE_SOURCE.id]: createStructuredError({
          source: 'render',
          message: 'Old failure',
        }),
      },
      clipRenderTimes: {
        [OFFLINE_SOURCE.id]: { started: 1, completed: 2, duration: 1 },
      },
    }));
    render(<MissingMediaDialog />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(
      screen.getByRole('heading', { name: 'Remove founder-interview.mp4?' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/media file on disk is not deleted/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove source' }));
    await waitFor(() => expect(useStore.getState().sources).toEqual([]));
    const state = useStore.getState();
    expect(state.transcriptions[OFFLINE_SOURCE.id]).toBeUndefined();
    expect(state.workspace.selectedClipId).toBeNull();
    expect(state.workspace.previewPlayheadByClip).not.toHaveProperty(OFFLINE_SOURCE.id);
    expect(state.renderProgress).toEqual([]);
    expect(state.renderErrors).not.toHaveProperty(OFFLINE_SOURCE.id);
    expect(state.clipRenderTimes).not.toHaveProperty(OFFLINE_SOURCE.id);
  });
});
