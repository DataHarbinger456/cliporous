import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DISPLAY_PREFERENCES,
  getDisplayPreferences,
  setDisplayPreferences,
} from '@/services/display-preferences';
import { useStore } from '@/store';
import SettingsWindow from './SettingsWindow';

const secretValues: Record<string, string> = {
  gemini: 'saved-gemini-key',
  pexels: '',
  fal: '',
  outputDirectory: '',
  autosaveIntervalMs: '60000',
};

const validateGeminiKey = vi.fn();
const validatePexelsKey = vi.fn();
const getPythonStatus = vi.fn();
const startPythonSetup = vi.fn();

beforeEach(() => {
  validateGeminiKey.mockReset();
  validatePexelsKey.mockReset();
  getPythonStatus.mockReset().mockResolvedValue({
    ready: true,
    stage: 'ready',
    storagePath: '/virtual/BatchClip/python-env',
    freeDiskBytes: 20 * 1024 ** 3,
    networkOnline: true,
    venvPath: '/virtual/BatchClip/python-env/venv',
    embeddedPythonAvailable: false,
  });
  setDisplayPreferences({ ...DEFAULT_DISPLAY_PREFERENCES });
  startPythonSetup.mockReset().mockResolvedValue({ started: true });
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: new Proxy(
      {
        secrets: {
          get: vi.fn((name: string) => Promise.resolve(secretValues[name] ?? null)),
          set: vi.fn(() => Promise.resolve()),
        },
        validateGeminiKey,
        validatePexelsKey,
        getPythonStatus,
        startPythonSetup,
        cancelPythonSetup: vi.fn(() => Promise.resolve({ canceled: true })),
        reportLifecycleState: vi.fn(() => Promise.resolve()),
        onLifecyclePrepare: vi.fn(() => () => {}),
      },
      {
        get(target, property) {
          if (property in target) return target[property as keyof typeof target];
          if (typeof property === 'string' && property.startsWith('on')) return () => () => {};
          return () => Promise.resolve(null);
        },
      },
    ),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Settings Connections', () => {
  it('hydrates configured, optional, and unavailable states without claiming a test passed', async () => {
    render(<SettingsWindow />);

    const gemini = await screen.findByRole('region', { name: 'Gemini' });
    const pexels = screen.getByRole('region', { name: 'Pexels' });
    const fal = screen.getByRole('region', { name: 'fal.ai' });

    expect(within(gemini).getByText('Configured, not tested')).toBeInTheDocument();
    expect(within(pexels).getByText('Not configured')).toBeInTheDocument();
    expect(within(fal).getByText('Optional and unavailable')).toBeInTheDocument();
    expect(
      within(fal).getByText(/Exports continue with Pexels stock footage or no B-roll/),
    ).toBeInTheDocument();
  });

  it('shows local-tool health and starts repair only from the Advanced action', async () => {
    render(<SettingsWindow />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Advanced' }), {
      button: 0,
      ctrlKey: false,
    });

    expect(await screen.findByText('Local tools are ready')).toBeInTheDocument();
    expect(screen.getByText('/virtual/BatchClip/python-env')).toBeInTheDocument();
    expect(startPythonSetup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Repair content tools' }));
    await waitFor(() => expect(startPythonSetup).toHaveBeenCalledTimes(1));
  });

  it('shows tested, degraded, invalid, and health-check failure feedback', async () => {
    validateGeminiKey
      .mockResolvedValueOnce({ valid: true })
      .mockResolvedValueOnce({
        valid: true,
        warning: 'Gemini accepted the key but quota is limited.',
      })
      .mockResolvedValueOnce({ valid: false, error: 'Invalid API key' });
    validatePexelsKey.mockResolvedValue({
      valid: false,
      error: 'Network error. Reconnect, then test Pexels again.',
    });

    render(<SettingsWindow />);
    const gemini = await screen.findByRole('region', { name: 'Gemini' });
    const pexels = screen.getByRole('region', { name: 'Pexels' });

    fireEvent.click(within(gemini).getByRole('button', { name: 'Test connection' }));
    expect(await within(gemini).findByText('Connected')).toBeInTheDocument();
    expect(validateGeminiKey).toHaveBeenCalledWith('saved-gemini-key');

    fireEvent.change(within(gemini).getByLabelText('Gemini API key'), {
      target: { value: 'limited-key' },
    });
    fireEvent.click(within(gemini).getByRole('button', { name: 'Test connection' }));
    expect(await within(gemini).findByText('Connected, degraded')).toBeInTheDocument();
    expect(within(gemini).getByText(/quota is limited/)).toBeInTheDocument();

    fireEvent.change(within(gemini).getByLabelText('Gemini API key'), {
      target: { value: 'bad-key' },
    });
    fireEvent.click(within(gemini).getByRole('button', { name: 'Test connection' }));
    expect(await within(gemini).findByText('Invalid')).toBeInTheDocument();
    expect(within(gemini).getByRole('alert')).toHaveTextContent(
      'Existing media and local work are safe',
    );

    fireEvent.change(within(pexels).getByLabelText('Pexels API key'), {
      target: { value: 'pexels-key' },
    });
    fireEvent.click(within(pexels).getByRole('button', { name: 'Test connection' }));
    expect(await within(pexels).findByText('Test failed')).toBeInTheDocument();
    expect(within(pexels).getByRole('alert')).toHaveTextContent('The key remains in this form');

    await waitFor(() => expect(validatePexelsKey).toHaveBeenCalledWith('pexels-key'));
  });

  it('keeps studio sounds opt-in and immediately persists studio alert preferences', async () => {
    useStore.getState().setEnableNotifications(true);
    render(<SettingsWindow />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Studio' }), {
      button: 0,
      ctrlKey: false,
    });

    const soundCues = await screen.findByRole('switch', { name: 'Studio sound cues' });
    expect(soundCues).not.toBeChecked();
    expect(getDisplayPreferences().soundEnabled).toBe(false);
    fireEvent.click(soundCues);
    expect(soundCues).toBeChecked();
    expect(getDisplayPreferences().soundEnabled).toBe(true);

    const notifications = screen.getByRole('switch', { name: 'Job notifications' });
    expect(notifications).toBeChecked();
    fireEvent.click(notifications);
    expect(notifications).not.toBeChecked();
    expect(useStore.getState().settings.enableNotifications).toBe(false);
  });

  it('keeps navigation, scrolling content, and Save reachable at the 400×480 resize minimum', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 480 });

    const { container } = render(<SettingsWindow />);
    await screen.findByRole('region', { name: 'Gemini' });

    expect(container.firstElementChild).toHaveClass('h-dvh', 'min-h-0');
    expect(screen.getByRole('tablist')).toHaveClass('grid-cols-2', 'min-[560px]:grid-cols-5');
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByRole('main')).toHaveClass('overflow-y-auto');
  });
});
