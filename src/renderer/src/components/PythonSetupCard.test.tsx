import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '@/store';
import { installApiStub, resetStore } from './__tests__/test-utils';
import { PythonSetupCard } from './PythonSetupCard';

const GIB = 1024 ** 3;

function setSetupState(
  state: 'not-setup' | 'repair-needed' | 'installing' | 'ready' | 'error',
  overrides: Partial<NonNullable<ReturnType<typeof useStore.getState>['pythonSetupDetails']>> = {},
): void {
  useStore.setState({
    pythonStatus: state,
    pythonSetupDetails: {
      ready: state === 'ready',
      stage: state === 'ready' ? 'ready' : state === 'repair-needed' ? 'incomplete' : 'not-setup',
      storagePath: '/Users/creator/Library/Application Support/BatchClip/python-env',
      freeDiskBytes: 18 * GIB,
      networkOnline: true,
      venvPath: null,
      embeddedPythonAvailable: false,
      ...overrides,
    },
    pythonSetupError: state === 'error' ? 'Download interrupted' : null,
    pythonSetupProgress:
      state === 'installing'
        ? {
            stage: 'downloading-model',
            message: 'Downloading the local speech model (40%)…',
            percent: 78,
          }
        : null,
  });
}

beforeEach(() => {
  resetStore();
});

describe('PythonSetupCard', () => {
  it('explains cost, location, disk, time, and offline behavior before any download starts', () => {
    const api = installApiStub();
    setSetupState('not-setup');

    render(<PythonSetupCard queuedSourceName="interview-final.mp4" />);

    expect(screen.getByRole('heading', { name: 'Set up local content tools' })).toBeInTheDocument();
    expect(screen.getByText('2–3 GB download')).toBeInTheDocument();
    expect(screen.getByText('6 GB free space required')).toBeInTheDocument();
    expect(screen.getByText(/10–30 minutes/)).toBeInTheDocument();
    expect(screen.getByText(/Application Support\/BatchClip\/python-env/)).toBeInTheDocument();
    expect(screen.getByText(/Transcription and face tracking work offline/)).toBeInTheDocument();
    expect(screen.getByText('Your video is queued')).toBeInTheDocument();
    expect(api.startPythonSetup).not.toHaveBeenCalled();
  });

  it('starts only from the explicit download action', async () => {
    const api = installApiStub();
    setSetupState('not-setup');
    render(<PythonSetupCard />);

    fireEvent.click(screen.getByRole('button', { name: 'Download local tools' }));

    await waitFor(() => expect(api.startPythonSetup).toHaveBeenCalledTimes(1));
    expect(useStore.getState().pythonStatus).toBe('installing');
  });

  it('blocks setup while offline and names the recovery action', () => {
    const api = installApiStub();
    setSetupState('not-setup', { networkOnline: false });
    render(<PythonSetupCard />);

    expect(screen.getByText('Internet connection needed')).toBeInTheDocument();
    expect(screen.getByText('Reconnect to start the download.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download local tools' })).toBeDisabled();
    expect(api.startPythonSetup).not.toHaveBeenCalled();
  });

  it('shows honest model progress and supports cancel', async () => {
    const api = installApiStub();
    setSetupState('installing');
    render(<PythonSetupCard />);

    expect(screen.getByText('Downloading the speech model')).toBeInTheDocument();
    expect(screen.getByText('Overall 78%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel setup' }));

    await waitFor(() => expect(api.cancelPythonSetup).toHaveBeenCalledTimes(1));
    expect(useStore.getState().pythonStatus).toBe('cancelling');
  });

  it('keeps failed setup retryable without risking project files', async () => {
    const api = installApiStub();
    setSetupState('error');
    render(<PythonSetupCard />);

    expect(screen.getByText('Content tools could not be installed')).toBeInTheDocument();
    expect(
      screen.getByText(/projects and source media have not been changed/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check connection and space' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry setup' }));

    await waitFor(() => expect(api.startPythonSetup).toHaveBeenCalledTimes(1));
  });

  it('offers repair in Settings without implying projects will be changed', () => {
    installApiStub();
    setSetupState('ready');
    render(<PythonSetupCard context="settings" />);

    expect(screen.getByText('Local tools are ready')).toBeInTheDocument();
    expect(screen.getByText(/Projects and source media stay untouched/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Repair content tools' })).toBeEnabled();
  });
});
