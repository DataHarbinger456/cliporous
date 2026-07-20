import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecoverySnapshot } from '@/services';
import { useStore } from '@/store';

const serviceMocks = vi.hoisted(() => ({
  autoSaveProject: vi.fn<(options?: { recoveryOnly?: boolean }) => Promise<void>>(),
  clearRecovery: vi.fn<() => Promise<void>>(),
  loadRecovery: vi.fn<() => Promise<RecoverySnapshot | null>>(),
  restoreProject: vi.fn(),
}));

vi.mock('@/services', () => serviceMocks);
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn() },
}));

import { RecoveryPrompt } from './RecoveryPrompt';

const SNAPSHOT: RecoverySnapshot = {
  id: 'snapshot-founder-002',
  savedAt: new Date('2026-07-16T14:30:00Z').getTime(),
  stage: 'detecting-faces',
  projectName: 'Founder Launch Cut',
  sourceName: 'founder-interview.mp4',
  counts: { sources: 1, transcripts: 1, clips: 8, editPlans: 1 },
  json: '{"version":3}',
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useStore.setState({
    acknowledgedRecoverySnapshotId: null,
    lastSaveError: null,
  });
  serviceMocks.loadRecovery.mockResolvedValue(SNAPSHOT);
  serviceMocks.autoSaveProject.mockResolvedValue();
  serviceMocks.clearRecovery.mockResolvedValue();
  serviceMocks.restoreProject.mockReturnValue(true);
});

afterEach(cleanup);

describe('RecoveryPrompt', () => {
  it('shows the project identity, autosave stage, and recoverable asset counts', async () => {
    render(<RecoveryPrompt />);

    expect(
      await screen.findByRole('heading', { name: 'Continue “Founder Launch Cut”?' }),
    ).toBeInTheDocument();
    expect(screen.getByText('founder-interview.mp4')).toBeInTheDocument();
    expect(screen.getByText('Framing speakers')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Clips')).toBeInTheDocument();
    expect(screen.getByText('Cut plan')).toBeInTheDocument();
  });

  it('requires a concrete second confirmation before deleting the snapshot', async () => {
    render(<RecoveryPrompt />);
    fireEvent.click(await screen.findByRole('button', { name: 'Discard recovery…' }));

    expect(
      screen.getByRole('heading', { name: 'Discard recovery for “Founder Launch Cut”?' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/permanently deletes the autosave/i)).toHaveTextContent(
      '1 source, 1 transcript, 8 clips, and 1 cut plan',
    );
    expect(serviceMocks.clearRecovery).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Discard recovery' }));
    await waitFor(() => expect(serviceMocks.clearRecovery).toHaveBeenCalledOnce());
    expect(useStore.getState().acknowledgedRecoverySnapshotId).toBe(SNAPSHOT.id);
  });

  it('keeps the recovery available and retryable when restore fails', async () => {
    serviceMocks.restoreProject.mockImplementation(() => {
      throw new Error('Project schema could not be restored');
    });
    render(<RecoveryPrompt />);

    fireEvent.click(await screen.findByRole('button', { name: 'Restore project' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your recovery file is still safe');
    expect(screen.getByRole('button', { name: 'Restore project' })).toBeEnabled();
    expect(serviceMocks.clearRecovery).not.toHaveBeenCalled();
    expect(serviceMocks.autoSaveProject).not.toHaveBeenCalled();
    expect(useStore.getState().acknowledgedRecoverySnapshotId).toBeNull();
  });

  it('keeps a failed discard on screen because the autosave still exists', async () => {
    serviceMocks.clearRecovery.mockRejectedValueOnce(new Error('Recovery file is locked'));
    render(<RecoveryPrompt />);
    fireEvent.click(await screen.findByRole('button', { name: 'Discard recovery…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard recovery' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Recovery was not discarded');
    expect(screen.getByRole('button', { name: 'Discard recovery' })).toBeEnabled();
    expect(useStore.getState().acknowledgedRecoverySnapshotId).toBeNull();
  });

  it('does not reopen a snapshot with the same acknowledged identity', async () => {
    useStore.setState({ acknowledgedRecoverySnapshotId: SNAPSHOT.id });
    render(<RecoveryPrompt />);

    await waitFor(() => expect(serviceMocks.loadRecovery).toHaveBeenCalledOnce());
    expect(screen.queryByRole('heading', { name: 'Continue “Founder Launch Cut”?' })).toBeNull();
  });

  it('does not hide a newer crash snapshot after an older one was acknowledged', async () => {
    useStore.setState({ acknowledgedRecoverySnapshotId: 'snapshot-founder-001' });
    render(<RecoveryPrompt />);

    expect(
      await screen.findByRole('heading', { name: 'Continue “Founder Launch Cut”?' }),
    ).toBeInTheDocument();
    expect(serviceMocks.loadRecovery).toHaveBeenCalledOnce();
  });

  it('refreshes crash protection after restore instead of deleting the safety copy', async () => {
    render(<RecoveryPrompt />);
    fireEvent.click(await screen.findByRole('button', { name: 'Restore project' }));

    await waitFor(() =>
      expect(serviceMocks.autoSaveProject).toHaveBeenCalledWith({ recoveryOnly: true }),
    );
    expect(serviceMocks.restoreProject).toHaveBeenCalledWith(SNAPSHOT.json, undefined, {
      recovered: true,
    });
    expect(serviceMocks.clearRecovery).not.toHaveBeenCalled();
    expect(useStore.getState().acknowledgedRecoverySnapshotId).toBe(SNAPSHOT.id);
  });
});
