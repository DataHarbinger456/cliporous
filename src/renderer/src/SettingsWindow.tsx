/**
 * SettingsWindow — top-level component rendered into the dedicated Electron
 * settings BrowserWindow (route `#settings`, see `src/main/settings-window.ts`).
 *
 * Five creator-focused tabs:
 *   • Connections — encrypted provider health and degraded features
 *   • Output      — destination, naming, quality, and concurrency
 *   • Studio      — appearance, sound, notifications, zoom, and promo behavior
 *   • Storage     — temp/cache size, cleanup, autosave, and logs
 *   • Advanced    — local engine setup, developer details, privacy, and restart
 *
 * Secrets are persisted through the existing safeStorage-backed IPC bridge.
 * The footer Save button commits the form; connection tests use the current
 * unsaved value so a bad key is never written merely because it was tested.
 */

import {
  AUTOSAVE_MAX_MS,
  AUTOSAVE_MIN_MS,
  AUTOSAVE_STEP_MS,
  DEFAULT_AUTOSAVE_INTERVAL_MS,
} from '@shared/project';
import {
  Database,
  FileText,
  Folder,
  Gauge,
  Image as ImageIcon,
  Plug,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import * as React from 'react';
import { ConnectionCard, type ConnectionState } from '@/components/ConnectionCard';
import { PythonSetupCard } from '@/components/PythonSetupCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDesktopLifecycle } from '@/hooks/useDesktopLifecycle';
import { usePythonSetup } from '@/hooks/usePythonSetup';
import { useTheme } from '@/hooks/useTheme';
import { setDisplayPreferences, useDisplayPreferences } from '@/services/display-preferences';
import { useStore } from '@/store';
import { broadcastSettingsChange } from '@/store/settings-sync';

// ---------------------------------------------------------------------------
// Persisted secret keys — all stored via the safeStorage-backed secret store.
// API keys are sensitive; outputDirectory & autosaveIntervalMs ride the same
// channel for simplicity (it's a generic key/value store).
// ---------------------------------------------------------------------------

const SECRET_KEYS = {
  gemini: 'gemini',
  pexels: 'pexels',
  fal: 'fal',
  outputDirectory: 'outputDirectory',
  autosaveIntervalMs: 'autosaveIntervalMs',
} as const;

// Slider displays seconds while the shared persistence contract uses milliseconds.
const AUTOSAVE_MIN_SEC = AUTOSAVE_MIN_MS / 1000;
const AUTOSAVE_MAX_SEC = AUTOSAVE_MAX_MS / 1000;
const AUTOSAVE_STEP_SEC = AUTOSAVE_STEP_MS / 1000;
const AUTOSAVE_DEFAULT_SEC = DEFAULT_AUTOSAVE_INTERVAL_MS / 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAutosaveInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (rem === 0) return `${minutes}m`;
  return `${minutes}m ${rem}s`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

async function readSecret(name: string): Promise<string | null> {
  try {
    return await window.api.secrets.get(name);
  } catch {
    return null;
  }
}

async function writeSecret(name: string, value: string): Promise<void> {
  await window.api.secrets.set(name, value);
}

// ---------------------------------------------------------------------------
// SettingsWindow
// ---------------------------------------------------------------------------

interface FormState {
  gemini: string;
  pexels: string;
  fal: string;
  outputDirectory: string;
  autosaveIntervalSec: number;
}

const EMPTY_FORM: FormState = {
  gemini: '',
  pexels: '',
  fal: '',
  outputDirectory: '',
  autosaveIntervalSec: AUTOSAVE_DEFAULT_SEC,
};

function formsMatch(left: FormState, right: FormState): boolean {
  return (
    left.gemini === right.gemini &&
    left.pexels === right.pexels &&
    left.fal === right.fal &&
    left.outputDirectory === right.outputDirectory &&
    left.autosaveIntervalSec === right.autosaveIntervalSec
  );
}

type ProviderId = 'gemini' | 'pexels' | 'fal';

interface ProviderConnection {
  state: ConnectionState;
  feedback: string;
}

type ProviderConnections = Record<ProviderId, ProviderConnection>;

const LOADING_CONNECTIONS: ProviderConnections = {
  gemini: { state: 'loading', feedback: 'Reading the encrypted key from this machine.' },
  pexels: { state: 'loading', feedback: 'Reading the encrypted key from this machine.' },
  fal: { state: 'loading', feedback: 'Checking whether this optional integration is available.' },
};

function configuredConnection(provider: 'gemini' | 'pexels', value: string): ProviderConnection {
  if (!value.trim()) {
    return {
      state: 'not-configured',
      feedback:
        provider === 'gemini'
          ? 'Add a key to enable AI scoring, hooks, descriptions, and cut plans.'
          : 'Add a key to use stock footage from Pexels.',
    };
  }
  return {
    state: 'configured',
    feedback: 'A key is configured but has not been tested in this window.',
  };
}

function falConnection(value: string): ProviderConnection {
  return {
    state: 'unavailable',
    feedback: value.trim()
      ? 'A key is configured, but fal.ai generation is not implemented in this build.'
      : 'This optional integration is not implemented in this build. No key is needed.',
  };
}

function isConnectionFailure(message: string): boolean {
  return /network|unavailable|could not be reached|right now/i.test(message);
}

function savedConnection(
  provider: 'gemini' | 'pexels',
  connection: ProviderConnection,
): ProviderConnection {
  if (connection.state === 'connected') {
    return {
      state: 'connected',
      feedback:
        provider === 'gemini'
          ? 'Connected and saved. AI scoring, hooks, descriptions, and cut plans are ready.'
          : 'Connected and saved. Stock B-roll from Pexels is ready.',
    };
  }
  if (connection.state === 'degraded') {
    return {
      ...connection,
      feedback: `${connection.feedback.replace(' Save settings to keep this tested key.', '')} Key saved.`,
    };
  }
  return connection;
}
export default function SettingsWindow(): React.JSX.Element {
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const formRef = React.useRef<FormState>(EMPTY_FORM);
  const savedFormRef = React.useRef<FormState>(EMPTY_FORM);
  const { theme, setTheme } = useTheme();
  const displayPreferences = useDisplayPreferences();
  usePythonSetup();

  // Non-secret creator preferences commit immediately and sync across windows.
  const promo = useStore((s) => s.settings.promo);
  const renderQuality = useStore((s) => s.settings.renderQuality);
  const filenameTemplate = useStore((s) => s.settings.filenameTemplate);
  const renderConcurrency = useStore((s) => s.settings.renderConcurrency);
  const enableNotifications = useStore((s) => s.settings.enableNotifications);
  const developerMode = useStore((s) => s.settings.developerMode);
  const setPromoEnabled = useStore((s) => s.setPromoEnabled);
  const setPromoForceCta = useStore((s) => s.setPromoForceCta);
  const setRenderQuality = useStore((s) => s.setRenderQuality);
  const setFilenameTemplate = useStore((s) => s.setFilenameTemplate);
  const setRenderConcurrency = useStore((s) => s.setRenderConcurrency);
  const setEnableNotifications = useStore((s) => s.setEnableNotifications);
  const setDeveloperMode = useStore((s) => s.setDeveloperMode);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [connections, setConnections] = React.useState<ProviderConnections>(LOADING_CONNECTIONS);
  const [cleaningProject, setCleaningProject] = React.useState(false);
  const [cleanupStatus, setCleanupStatus] = React.useState<{
    kind: 'idle' | 'success' | 'error';
    message?: string;
  }>({ kind: 'idle' });
  const [status, setStatus] = React.useState<{
    kind: 'idle' | 'saved' | 'error';
    message?: string;
  }>({ kind: 'idle' });
  const [storage, setStorage] = React.useState({
    tempBytes: 0,
    tempCount: 0,
    cacheBytes: 0,
    logBytes: 0,
  });
  const [storageLoading, setStorageLoading] = React.useState(true);
  const [cleaningTemp, setCleaningTemp] = React.useState(false);
  const autoCleanup = displayPreferences.autoCleanupTemp;

  // Hydrate from main on mount
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [gemini, pexels, fal, outputDirectory, autosaveRaw] = await Promise.all([
        readSecret(SECRET_KEYS.gemini),
        readSecret(SECRET_KEYS.pexels),
        readSecret(SECRET_KEYS.fal),
        readSecret(SECRET_KEYS.outputDirectory),
        readSecret(SECRET_KEYS.autosaveIntervalMs),
      ]);
      if (cancelled) return;

      const parsedMs = autosaveRaw ? Number.parseInt(autosaveRaw, 10) : NaN;
      const autosaveSec = Number.isFinite(parsedMs)
        ? Math.min(AUTOSAVE_MAX_SEC, Math.max(AUTOSAVE_MIN_SEC, Math.round(parsedMs / 1000)))
        : AUTOSAVE_DEFAULT_SEC;

      const hydratedForm = {
        gemini: gemini ?? '',
        pexels: pexels ?? '',
        fal: fal ?? '',
        outputDirectory: outputDirectory ?? '',
        autosaveIntervalSec: autosaveSec,
      };
      formRef.current = hydratedForm;
      savedFormRef.current = hydratedForm;
      setForm(hydratedForm);
      setConnections({
        gemini: configuredConnection('gemini', hydratedForm.gemini),
        pexels: configuredConnection('pexels', hydratedForm.pexels),
        fal: falConnection(hydratedForm.fal),
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshStorage = React.useCallback(async (): Promise<void> => {
    setStorageLoading(true);
    try {
      const [temp, cache, logBytes] = await Promise.all([
        window.api.getTempSize(),
        window.api.getCacheSize(),
        window.api.getLogSize(),
      ]);
      setStorage({
        tempBytes: temp.bytes,
        tempCount: temp.count,
        cacheBytes: cache.bytes,
        logBytes,
      });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: `Couldn't read storage: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setStorageLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshStorage();
  }, [refreshStorage]);

  React.useEffect(() => {
    void window.api.setAutoCleanup(autoCleanup);
  }, [autoCleanup]);

  const handleAutoCleanup = (enabled: boolean): void => {
    setDisplayPreferences({ autoCleanupTemp: enabled });
    void window.api.setAutoCleanup(enabled);
  };

  const handleCleanupTemp = async (): Promise<void> => {
    setCleaningTemp(true);
    try {
      const result = await window.api.cleanupTemp();
      setStatus({
        kind: 'saved',
        message: `Removed ${result.deleted} temporary files and freed ${formatBytes(result.freed)}.`,
      });
      await refreshStorage();
    } catch (error) {
      setStatus({
        kind: 'error',
        message: `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setCleaningTemp(false);
    }
  };

  const update = <K extends keyof FormState>(field: K, value: FormState[K]): void => {
    const next = { ...formRef.current, [field]: value };
    formRef.current = next;
    setForm(next);
    if (field === 'gemini' || field === 'pexels' || field === 'fal') {
      const providerValue = String(value);
      setConnections((current) => ({
        ...current,
        [field]:
          field === 'fal'
            ? falConnection(providerValue)
            : configuredConnection(field, providerValue),
      }));
    }
    if (status.kind !== 'idle') setStatus({ kind: 'idle' });
  };

  const handleTestConnection = async (provider: 'gemini' | 'pexels'): Promise<void> => {
    const value = formRef.current[provider].trim();
    if (!value) {
      setConnections((current) => ({
        ...current,
        [provider]: configuredConnection(provider, ''),
      }));
      return;
    }

    setConnections((current) => ({
      ...current,
      [provider]: {
        state: 'testing',
        feedback: `Contacting ${provider === 'gemini' ? 'Gemini' : 'Pexels'} without saving or changing the key.`,
      },
    }));

    try {
      const result =
        provider === 'gemini'
          ? await window.api.validateGeminiKey(value)
          : await window.api.validatePexelsKey(value);
      const providerName = provider === 'gemini' ? 'Gemini' : 'Pexels';
      let next: ProviderConnection;
      if (result.valid && result.warning) {
        next = {
          state: 'degraded',
          feedback: `${result.warning} Save settings to keep this tested key.`,
        };
      } else if (result.valid) {
        next = {
          state: 'connected',
          feedback:
            provider === 'gemini'
              ? 'Connection test passed. Save settings to use this key for scoring and AI edits.'
              : 'Connection test passed. Save settings to use Pexels stock footage.',
        };
      } else {
        const error = result.error ?? `${providerName} rejected the connection test.`;
        next = {
          state: isConnectionFailure(error) ? 'failed' : 'invalid',
          feedback: isConnectionFailure(error)
            ? `${error} Reconnect and test again. The key remains in this form.`
            : `${error}. Replace the key, then test again. Existing media and local work are safe.`,
        };
      }
      setConnections((current) => ({ ...current, [provider]: next }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setConnections((current) => ({
        ...current,
        [provider]: {
          state: 'failed',
          feedback: `The connection test could not finish: ${message}. The key remains in this form; retry when the provider is reachable.`,
        },
      }));
    }
  };

  const handlePickFolder = async (): Promise<void> => {
    try {
      const dir = await window.api.openDirectory();
      if (dir) update('outputDirectory', dir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ kind: 'error', message: `Couldn't open folder picker: ${msg}` });
    }
  };

  const handleSave = async (): Promise<boolean> => {
    setSaving(true);
    setStatus({ kind: 'idle' });
    const values = formRef.current;
    try {
      await Promise.all([
        writeSecret(SECRET_KEYS.gemini, values.gemini.trim()),
        writeSecret(SECRET_KEYS.pexels, values.pexels.trim()),
        writeSecret(SECRET_KEYS.fal, values.fal.trim()),
        writeSecret(SECRET_KEYS.outputDirectory, values.outputDirectory.trim()),
        writeSecret(SECRET_KEYS.autosaveIntervalMs, String(values.autosaveIntervalSec * 1000)),
      ]);
      savedFormRef.current = values;
      setConnections((current) => ({
        ...current,
        gemini: savedConnection('gemini', current.gemini),
        pexels: savedConnection('pexels', current.pexels),
      }));
      broadcastSettingsChange();
      setStatus({ kind: 'saved', message: 'Settings saved' });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ kind: 'error', message: `Failed to save: ${msg}` });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleCleanLegacyProject = async (): Promise<void> => {
    if (cleaningProject) return;
    setCleaningProject(true);
    setCleanupStatus({ kind: 'idle' });
    try {
      const result = await window.api.cleanLegacyProject();
      if (!result) return;
      if (result.status === 'already-clean') {
        setCleanupStatus({ kind: 'success', message: 'This project file is already clean.' });
      } else {
        setCleanupStatus({
          kind: 'success',
          message: `Clean copy saved. Removed ${result.removedFieldCount} legacy credential ${
            result.removedFieldCount === 1 ? 'field' : 'fields'
          }.`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCleanupStatus({ kind: 'error', message: `Could not clean project: ${message}` });
    } finally {
      setCleaningProject(false);
    }
  };

  const getLifecycleSnapshot = React.useCallback(() => {
    return {
      windowKind: 'settings' as const,
      projectName: null,
      projectDirty: false,
      settingsDirty: !formsMatch(formRef.current, savedFormRef.current),
      processingStage: null,
      rendering: false,
    };
  }, []);

  useDesktopLifecycle({
    getSnapshot: getLifecycleSnapshot,
    onSave: handleSave,
  });

  const handleRestart = async (): Promise<void> => {
    try {
      await window.api.requestAppRestart('settings');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: 'error', message: `Could not restart: ${message}` });
    }
  };

  return (
    <div className="bg-background text-foreground flex h-dvh min-h-0 w-full flex-col">
      <header className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <Plug className="text-muted-foreground h-4 w-4" aria-hidden="true" />
        <span className="text-sm font-semibold tracking-tight">Settings</span>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-3 min-[480px]:p-4">
        <Tabs defaultValue="connections" className="flex min-h-full w-full flex-col">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 min-[560px]:grid-cols-5">
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="output">Output</TabsTrigger>
            <TabsTrigger value="studio">Studio</TabsTrigger>
            <TabsTrigger value="storage">Storage</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          {/* ---------------------------------------------------------------
              Connections
              --------------------------------------------------------------- */}
          <TabsContent value="connections" className="mt-4">
            <div className="mb-4 space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Connections</h2>
              <p className="text-muted-foreground text-sm">
                Test content services before a long analysis or export. Keys stay encrypted on this
                machine through the OS keychain.
              </p>
            </div>
            <div className="space-y-3">
              <ConnectionCard
                id="gemini-key"
                name="Gemini"
                description="Analyzes transcripts to rank moments and write creator-facing text."
                icon={Sparkles}
                required
                value={form.gemini}
                placeholder="AIza…"
                state={connections.gemini.state}
                feedback={connections.gemini.feedback}
                impact="Without it, clip scoring, AI hooks, descriptions, visual-search prompts, and long-form cut plans stop. Local transcription, manual review, and rendering still work."
                keyUrl="https://aistudio.google.com/apikey"
                onChange={(value) => update('gemini', value)}
                onTest={() => void handleTestConnection('gemini')}
              />
              <ConnectionCard
                id="pexels-key"
                name="Pexels"
                description="Finds licensed stock footage for B-roll suggestions."
                icon={ImageIcon}
                value={form.pexels}
                placeholder="Paste a Pexels API key"
                state={connections.pexels.state}
                feedback={connections.pexels.feedback}
                impact="Without it, stock B-roll is skipped. Clip analysis, captions, manual editing, and exports continue."
                keyUrl="https://www.pexels.com/api/"
                onChange={(value) => update('pexels', value)}
                onTest={() => void handleTestConnection('pexels')}
              />
              <ConnectionCard
                id="fal-key"
                name="fal.ai"
                description="Reserved for optional AI-generated B-roll imagery."
                icon={WandSparkles}
                value={form.fal}
                placeholder="Not needed in this build"
                state={connections.fal.state}
                feedback={connections.fal.feedback}
                impact="AI-generated fal.ai imagery is unavailable in this build. Exports continue with Pexels stock footage or no B-roll."
                onChange={(value) => update('fal', value)}
              />
            </div>
          </TabsContent>

          {/* ---------------------------------------------------------------
              Output
              --------------------------------------------------------------- */}
          <TabsContent value="output" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Output</CardTitle>
                <CardDescription>
                  Set the default destination, filenames, quality, and export concurrency.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="output-dir">Output directory</Label>
                  <div className="flex items-center gap-2 max-[460px]:flex-col max-[460px]:items-stretch">
                    <Input
                      id="output-dir"
                      value={form.outputDirectory}
                      placeholder="System Videos/BatchClip"
                      readOnly
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" onClick={handlePickFolder}>
                      <Folder aria-hidden="true" />
                      Choose…
                    </Button>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="filename-template">Filename pattern</Label>
                  <Input
                    id="filename-template"
                    value={filenameTemplate}
                    onChange={(event) => setFilenameTemplate(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use creator-safe names such as {'{source}-{index}-{hook}'}.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="quality-preset">Quality</Label>
                    <Select
                      value={renderQuality.preset}
                      onValueChange={(value) =>
                        setRenderQuality({ preset: value as typeof renderQuality.preset })
                      }
                    >
                      <SelectTrigger id="quality-preset">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="render-concurrency">Concurrent exports</Label>
                    <Select
                      value={String(renderConcurrency)}
                      onValueChange={(value) => setRenderConcurrency(Number(value))}
                    >
                      <SelectTrigger id="render-concurrency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map((count) => (
                          <SelectItem key={count} value={String(count)}>
                            {count}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground" role="status">
                  Output preferences save automatically. Credentials and folder changes use Save.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Studio preferences auto-save. */}
          <TabsContent value="studio" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Studio
                </CardTitle>
                <CardDescription>
                  Appearance, sound, notifications, zoom, and creator-facing promo behavior.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="theme-mode">Appearance</Label>
                    <p className="text-xs text-muted-foreground">
                      Choose the canvas and surface contrast across windows.
                    </p>
                  </div>
                  <Select
                    value={theme}
                    onValueChange={(value) => {
                      if (value === 'light' || value === 'dark') setTheme(value);
                    }}
                  >
                    <SelectTrigger id="theme-mode" className="w-32 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="studio-zoom">Interface zoom</Label>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {Math.round(displayPreferences.uiZoom * 100)}%
                    </span>
                  </div>
                  <Slider
                    id="studio-zoom"
                    min={50}
                    max={200}
                    step={5}
                    value={[Math.round(displayPreferences.uiZoom * 100)]}
                    onValueChange={(value) =>
                      setDisplayPreferences({ uiZoom: (value[0] ?? 100) / 100 })
                    }
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>50%</span>
                    <span>200%</span>
                  </div>
                </div>
                <Separator />
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="completion-sound">Studio sound cues</Label>
                    <p className="text-xs text-muted-foreground">
                      Play quiet cues for clip decisions, finished jobs, and problems. Off by
                      default.
                    </p>
                  </div>
                  <Switch
                    id="completion-sound"
                    checked={displayPreferences.soundEnabled}
                    onCheckedChange={(soundEnabled) => setDisplayPreferences({ soundEnabled })}
                  />
                </div>
                <Separator />
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="native-notifications">Job notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Show native alerts when clips or exports are ready.
                    </p>
                  </div>
                  <Switch
                    id="native-notifications"
                    checked={enableNotifications}
                    onCheckedChange={setEnableNotifications}
                  />
                </div>
                <Separator />
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="promo-enabled">Promo Mode</Label>
                    <p className="text-xs text-muted-foreground">
                      Use evidence pop-ups and CTA behavior for creator promo edits.
                    </p>
                  </div>
                  <Switch
                    id="promo-enabled"
                    checked={promo.enabled}
                    onCheckedChange={setPromoEnabled}
                  />
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="promo-force-cta">Force CTA</Label>
                    <p className="text-xs text-muted-foreground">
                      Add the configured call to action to every promo clip.
                    </p>
                  </div>
                  <Switch
                    id="promo-force-cta"
                    checked={promo.forceCta}
                    disabled={!promo.enabled}
                    onCheckedChange={setPromoForceCta}
                  />
                </div>
                <p className="text-xs text-muted-foreground" role="status">
                  Studio preferences save automatically.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="storage" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Database className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Storage
                </CardTitle>
                <CardDescription>
                  Inspect real local usage, control cleanup, and reach session logs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-2 sm:grid-cols-3" aria-busy={storageLoading}>
                  <div className="rounded-md border border-border p-3">
                    <dt className="text-xs text-muted-foreground">Temporary renders</dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums">
                      {storageLoading ? 'Checking…' : formatBytes(storage.tempBytes)}
                    </dd>
                    <dd className="text-xs text-muted-foreground">
                      {storageLoading ? '' : `${storage.tempCount} files`}
                    </dd>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <dt className="text-xs text-muted-foreground">Media cache</dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums">
                      {storageLoading ? 'Checking…' : formatBytes(storage.cacheBytes)}
                    </dd>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <dt className="text-xs text-muted-foreground">Session logs</dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums">
                      {storageLoading ? 'Checking…' : formatBytes(storage.logBytes)}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={cleaningTemp || storageLoading}
                    onClick={() => void handleCleanupTemp()}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    {cleaningTemp ? 'Cleaning…' : 'Clean temporary files'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void window.api.openLogFolder()}
                  >
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    Open logs
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={storageLoading}
                    onClick={() => void refreshStorage()}
                  >
                    Refresh sizes
                  </Button>
                </div>
                <Separator />
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="auto-cleanup">Clean temporary renders automatically</Label>
                    <p className="text-xs text-muted-foreground">
                      Runs at the next BatchClip launch. Completed exports and source videos are
                      never removed.
                    </p>
                  </div>
                  <Switch
                    id="auto-cleanup"
                    checked={autoCleanup}
                    onCheckedChange={handleAutoCleanup}
                  />
                </div>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="autosave-interval">Project autosave interval</Label>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {formatAutosaveInterval(form.autosaveIntervalSec)}
                    </span>
                  </div>
                  <Slider
                    id="autosave-interval"
                    min={AUTOSAVE_MIN_SEC}
                    max={AUTOSAVE_MAX_SEC}
                    step={AUTOSAVE_STEP_SEC}
                    value={[form.autosaveIntervalSec]}
                    onValueChange={(value) =>
                      update('autosaveIntervalSec', value[0] ?? AUTOSAVE_DEFAULT_SEC)
                    }
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatAutosaveInterval(AUTOSAVE_MIN_SEC)}</span>
                    <span>{formatAutosaveInterval(AUTOSAVE_MAX_SEC)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Save confirms the autosave interval. Cleanup preference saves immediately.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advanced" className="mt-4">
            <div className="space-y-4">
              <PythonSetupCard context="settings" />
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Advanced</CardTitle>
                  <CardDescription>
                    Developer details, privacy migration, and restart controls.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="developer-mode">Developer mode</Label>
                      <p className="text-xs text-muted-foreground">
                        Expose raw engine commands and technical render detail in diagnostics.
                      </p>
                    </div>
                    <Switch
                      id="developer-mode"
                      checked={developerMode}
                      onCheckedChange={setDeveloperMode}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-start justify-between gap-4 max-[460px]:flex-col">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Legacy project privacy</p>
                      <p className="text-xs text-muted-foreground">
                        Create a separate clean copy of an older .batchclip file with embedded
                        provider credentials removed. The original stays unchanged.
                      </p>
                      {cleanupStatus.message && (
                        <p
                          className={
                            cleanupStatus.kind === 'error'
                              ? 'text-xs text-destructive'
                              : 'status-success text-xs'
                          }
                          role={cleanupStatus.kind === 'error' ? 'alert' : 'status'}
                        >
                          {cleanupStatus.message}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 max-[460px]:w-full"
                      disabled={cleaningProject}
                      onClick={handleCleanLegacyProject}
                    >
                      <ShieldCheck aria-hidden="true" />
                      {cleaningProject ? 'Cleaning…' : 'Clean project…'}
                    </Button>
                  </div>
                  <Separator />
                  <div className="flex items-start justify-between gap-4 max-[460px]:flex-col">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Restart BatchClip</p>
                      <p className="text-xs text-muted-foreground">
                        Unsaved projects, settings, processing, and exports are checked before
                        restart.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 max-[460px]:w-full"
                      onClick={() => void handleRestart()}
                    >
                      <RotateCcw aria-hidden="true" />
                      Restart…
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground" role="status">
                    Advanced non-secret preferences save automatically.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-border flex shrink-0 items-center justify-between gap-3 border-t px-3 py-3 min-[480px]:px-4">
        <span
          className={`min-w-0 truncate ${
            status.kind === 'saved'
              ? 'status-success text-sm'
              : status.kind === 'error'
                ? 'text-destructive text-sm'
                : 'text-muted-foreground text-sm'
          }`}
          role={status.kind === 'error' ? 'alert' : undefined}
        >
          {status.message ?? (loading ? 'Loading…' : '')}
        </span>
        <Button onClick={handleSave} disabled={saving || loading}>
          <Save />
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </footer>
    </div>
  );
}
