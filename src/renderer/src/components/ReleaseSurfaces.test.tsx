import type { AppUpdateState } from '@shared/updater';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installApiStub, resetStore } from '@/components/__tests__/test-utils';
import { ReleaseSurfaces } from './ReleaseSurfaces';

const LAST_VERSION_STORAGE_KEY = 'batchclip.release.last-version.v1';

beforeEach(() => {
  localStorage.clear();
  resetStore();
});

afterEach(cleanup);

describe('release surfaces', () => {
  it('records a first install without opening What’s New', async () => {
    installApiStub();
    render(<ReleaseSurfaces />);

    await waitFor(() => {
      expect(localStorage.getItem(LAST_VERSION_STORAGE_KEY)).toBe('0.1.0');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens creator-facing notes once after the installed version changes', async () => {
    localStorage.setItem(LAST_VERSION_STORAGE_KEY, '0.0.9');
    installApiStub();
    render(<ReleaseSurfaces />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'What’s new in your cut room' }),
    ).toBeInTheDocument();
    expect(screen.getByText('A more finished cut room')).toBeInTheDocument();
    expect(localStorage.getItem(LAST_VERSION_STORAGE_KEY)).toBe('0.1.0');
  });

  it('shows a non-blocking banner for an available signed update', async () => {
    let onUpdate: ((state: AppUpdateState) => void) | null = null;
    installApiStub({
      onUpdateState: vi.fn((callback: (state: AppUpdateState) => void) => {
        onUpdate = callback;
        return () => {};
      }),
    });
    render(<ReleaseSurfaces />);
    await waitFor(() => {
      expect(onUpdate).not.toBeNull();
      expect(localStorage.getItem(LAST_VERSION_STORAGE_KEY)).toBe('0.1.0');
    });

    act(() => {
      onUpdate?.({
        phase: 'available',
        currentVersion: '0.1.0',
        availableVersion: '0.2.0',
        progressPercent: null,
        message: 'A signed BatchClip update is ready to download.',
        manual: false,
      });
    });

    expect(await screen.findByText('BatchClip 0.2.0 is available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Dismiss update message' })).toBeEnabled();
  });
});
