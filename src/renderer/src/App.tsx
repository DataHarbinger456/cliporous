import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Clapperboard, FolderOpen, Save, Settings, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AiUsageIndicator } from '@/components/AiUsageIndicator';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorLog } from '@/components/ErrorLog';
import { ClipGrid } from '@/components/screens/ClipGrid';
import { DropScreen } from '@/components/screens/DropScreen';
import { ProcessingScreen } from '@/components/screens/ProcessingScreen';
import { RenderScreen } from '@/components/screens/RenderScreen';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Toaster } from '@/components/ui/sonner';
import type { KeyboardShortcutCallbacks } from '@/hooks';
import { useAutosave, useKeyboardShortcuts, usePythonSetup } from '@/hooks';
import { clearRecovery, loadProject, loadRecovery, saveProject } from '@/services';
import { useStore } from '@/store';
import { selectIsLongformOnly, selectScreen } from '@/store/selectors';
import { listenForSettingsChanges } from '@/store/settings-sync';

// ---------------------------------------------------------------------------
// Autosave toast — small bottom-right card that fades in when useAutosave
// reports a fresh save (justSaved=true for ~2s).
// ---------------------------------------------------------------------------

function AutosaveToast(): React.JSX.Element {
  const { justSaved } = useAutosave();
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence>
      {justSaved && (
        <motion.div
          key="autosave-toast"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="pointer-events-none fixed right-4 bottom-4 z-50"
        >
          <Card className="flex items-center gap-2 px-3 py-1.5 text-xs shadow-md">
            <span className="indicator-success h-2 w-2 rounded-full" aria-hidden="true" />
            <span className="text-muted-foreground">Autosaved</span>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Header — orientation + actions
// ---------------------------------------------------------------------------

type AppScreen = 'drop' | 'processing' | 'clips' | 'render';
type RailKey = 'source' | 'shape' | 'export';

const STAGE_RAIL: readonly { key: RailKey; label: string; detail: string }[] = [
  { key: 'source', label: 'Source', detail: 'Bring in a video' },
  { key: 'shape', label: 'Shape', detail: 'Find and refine clips' },
  { key: 'export', label: 'Export', detail: 'Render finished clips' },
];

function Header({
  activeScreen,
  stage,
}: {
  activeScreen: AppScreen;
  stage: string;
}): React.JSX.Element {
  const isDirty = useStore((s) => s.isDirty);
  const hasSource = useStore((s) => s.activeSourceId !== null);

  const handleSave = async (): Promise<void> => {
    const result = await saveProject();
    if (result) toast.success('Project saved');
  };

  const handleOpen = async (): Promise<void> => {
    const ok = await loadProject();
    if (ok) toast.success('Project loaded');
  };

  const handleSettings = async (): Promise<void> => {
    try {
      await window.api.openSettingsWindow();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Couldn't open settings: ${msg}`);
    }
  };

  const activeRail: RailKey =
    activeScreen === 'drop' ? 'source' : activeScreen === 'render' ? 'export' : 'shape';
  const activeDetail = STAGE_RAIL.find((item) => item.key === activeRail)?.detail ?? 'Ready';
  const stageName = stage.replace(/[-_]/g, ' ');

  // The whole header is the window drag region. Interactive children opt back
  // out with app-region: no-drag.
  return (
    <header
      className="filmstrip-rule border-border flex min-h-16 shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b bg-background/95 px-4 pl-20 backdrop-blur-sm lg:flex-nowrap"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex min-w-max items-center gap-3">
        <span
          className="bg-primary/15 text-primary flex h-8 w-8 items-center justify-center rounded-md border border-primary/30"
          aria-hidden="true"
        >
          <Clapperboard className="h-4 w-4" />
        </span>
        <div className="leading-none">
          <div className="text-foreground text-sm font-semibold tracking-tight">BatchClip</div>
          <div className="text-muted-foreground mt-1 text-[10px] font-medium uppercase tracking-[0.16em]">
            Clip studio
          </div>
        </div>
        {isDirty && (
          <span
            className="indicator-signal h-1.5 w-1.5 rounded-full"
            role="status"
            aria-label="Unsaved changes"
            title="Unsaved changes"
          />
        )}
      </div>

      <nav
        aria-label="Studio stages"
        className="flex min-w-0 flex-1 items-center gap-1 max-[640px]:order-3 max-[640px]:basis-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {STAGE_RAIL.map((item, index) => {
          const isActive = item.key === activeRail;
          const isComplete =
            index < STAGE_RAIL.findIndex((stageItem) => stageItem.key === activeRail);
          return (
            <div key={item.key} className="flex min-w-0 items-center">
              <div
                className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 ${isActive ? 'bg-primary/[0.12] text-foreground' : isComplete ? 'text-muted-foreground' : 'text-muted-foreground/[0.65]'}`}
                aria-current={isActive ? 'step' : undefined}
                title={item.detail}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${isActive ? 'border-primary/60 bg-primary text-primary-foreground' : isComplete ? 'border-primary/40 text-primary' : 'border-[hsl(var(--border-strong))] text-muted-foreground'}`}
                >
                  {isComplete ? '✓' : index + 1}
                </span>
                <span
                  className={`${isActive ? 'inline' : 'hidden sm:inline'} truncate text-xs font-medium`}
                >
                  {item.label}
                </span>
              </div>
              {index < STAGE_RAIL.length - 1 && (
                <span
                  className="text-[hsl(var(--border-strong))] hidden px-1 text-xs sm:inline"
                  aria-hidden="true"
                >
                  →
                </span>
              )}
            </div>
          );
        })}
      </nav>

      <div
        className="flex min-w-max items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div
          className="mr-1 hidden items-center gap-1.5 rounded-md border border-border/[0.7] bg-card/[0.7] px-2 py-1.5 text-[11px] text-muted-foreground xl:flex"
          aria-live="polite"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${hasSource ? 'indicator-success' : 'bg-muted-foreground/60'}`}
            aria-hidden="true"
          />
          <span>{hasSource ? activeDetail : 'No source selected'}</span>
        </div>
        <AiUsageIndicator />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Button variant="ghost" size="sm" onClick={handleSave} aria-label="Save project">
          <Save />
          <span className="hidden sm:inline">Save</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleOpen} aria-label="Open project">
          <FolderOpen />
          <span className="hidden sm:inline">Open</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleSettings} aria-label="Open settings">
          <Settings />
          <span className="hidden sm:inline">Settings</span>
        </Button>
        <ThemeToggle />
        <span className="sr-only" aria-live="polite">
          Current stage: {stageName}
        </span>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Screen transition — the ENTIRE animation budget for the app.
// Single shared wrapper: fade + 8px y-shift, 150ms, easeOut.
// Keyed by pipeline.stage so transitions fire on stage change.
// No stagger, no parallax, no springs, no other framer-motion usage.
// ---------------------------------------------------------------------------

function ScreenFrame({
  motionKey,
  children,
}: {
  motionKey: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const yOffset = reduceMotion ? 0 : 8;
  return (
    <motion.div
      key={motionKey}
      initial={{ opacity: 0, y: yOffset }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -yOffset }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="flex h-full w-full flex-col"
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Recovery prompt — on first paint, check for an auto-saved payload from a
// previous session that wasn't shut down cleanly. Deferred 400ms (V1
// behavior) so the initial screen render isn't blocked by the modal.
// Only shown when the payload contains at least one clip.
// ---------------------------------------------------------------------------

function RecoveryPrompt(): React.JSX.Element | null {
  const acknowledgedRecovery = useStore((s) => s.acknowledgedRecovery);
  const acknowledgeRecovery = useStore((s) => s.acknowledgeRecovery);
  const [payload, setPayload] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (acknowledgedRecovery) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const data = await loadRecovery();
      if (cancelled) return;
      if (!data) {
        acknowledgeRecovery();
        return;
      }
      try {
        const project = JSON.parse(data) as {
          clips?: Record<string, unknown[]>;
          transcriptions?: Record<string, unknown>;
          longformPlans?: Record<string, unknown>;
        };
        const clips = project.clips ?? {};
        const hasClips = Object.values(clips).some((arr) => Array.isArray(arr) && arr.length > 0);
        // Long-form projects autosave only a transcription (+ optional edit
        // plan) and no short-form clips. Restore those too so the slow
        // transcription / expensive Gemini plan isn't silently discarded.
        const hasTranscriptions = Object.keys(project.transcriptions ?? {}).length > 0;
        if (!hasClips && !hasTranscriptions) {
          await clearRecovery();
          acknowledgeRecovery();
          return;
        }
        setPayload(data);
        setOpen(true);
      } catch {
        await clearRecovery();
        acknowledgeRecovery();
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [acknowledgedRecovery, acknowledgeRecovery]);

  const handleRestore = async (): Promise<void> => {
    if (!payload) return;
    try {
      const project = JSON.parse(payload);
      const sources = project.sources ?? [];
      const clips = project.clips ?? {};
      const stitchedClips = project.stitchedClips ?? {};
      const longformPlans = project.longformPlans ?? {};
      const hasClips = Object.values(clips).some((arr) => Array.isArray(arr) && arr.length > 0);
      const hasLongform = Object.keys(longformPlans).length > 0;
      // Long-form-only state (transcription + edit plan, no short-form clips)
      // is still restorable — surface the first source and jump to 'ready' so
      // the saved plan can render without re-calling Gemini.
      const ready = hasClips || hasLongform;
      const activeSourceId = ready && sources.length > 0 ? sources[0].id : null;
      useStore.setState({
        sources,
        transcriptions: project.transcriptions ?? {},
        clips,
        stitchedClips,
        longformPlans,
        activeSourceId,
        pipeline: ready
          ? { stage: 'ready', message: '', percent: 100 }
          : { stage: 'idle', message: '', percent: 0 },
        isDirty: false,
      });
      toast.success('Recovered your last session');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Recovery failed: ${msg}`);
    } finally {
      await clearRecovery();
      acknowledgeRecovery();
      setOpen(false);
    }
  };

  const handleDiscard = async (): Promise<void> => {
    await clearRecovery();
    acknowledgeRecovery();
    setOpen(false);
  };

  if (!payload) return null;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="text-warning" aria-hidden="true" />
            Recover unsaved work
          </AlertDialogTitle>
          <AlertDialogDescription>
            BatchClip didn&apos;t shut down cleanly last time. We saved your project — restore it
            now, or discard and start fresh.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleDiscard}>Discard</AlertDialogCancel>
          <AlertDialogAction onClick={handleRestore}>Restore</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Keyboard shortcut help — a small dialog opened with `?` that documents the
// four global shortcuts wired through useKeyboardShortcuts.
// ---------------------------------------------------------------------------

const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl';

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: [MOD_KEY, 'S'], label: 'Save project' },
  { keys: [MOD_KEY, 'O'], label: 'Open project' },
  { keys: [MOD_KEY, ','], label: 'Settings' },
  { keys: ['?'], label: 'Show this help' },
];

function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Speed up your workflow with these global shortcuts.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="bg-muted text-foreground border-border inline-flex min-w-6 items-center justify-center rounded border px-1.5 py-0.5 font-mono text-xs"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App(): React.JSX.Element {
  const stage = useStore((s) => s.pipeline.stage);
  const activeSourceId = useStore((s) => s.activeSourceId);
  const hydrateSecretsFromMain = useStore((s) => s.hydrateSecretsFromMain);
  const [helpOpen, setHelpOpen] = useState(false);

  // Global keyboard shortcuts. Mounted once at the App root; the hook attaches
  // a single window keydown listener and re-binds when the callbacks change.
  const shortcutCallbacks = useMemo<KeyboardShortcutCallbacks>(
    () => ({
      onSave: async () => {
        const result = await saveProject();
        if (result) toast.success('Project saved');
      },
      onLoad: async () => {
        const ok = await loadProject();
        if (ok) toast.success('Project loaded');
      },
      onOpenSettings: async () => {
        try {
          await window.api.openSettingsWindow();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(`Couldn't open settings: ${msg}`);
        }
      },
      onShowHelp: () => setHelpOpen((prev) => !prev),
    }),
    [],
  );
  useKeyboardShortcuts(shortcutCallbacks);

  // Wire python:setupProgress / python:setupDone listeners into the store so
  // DropScreen can render the first-run install card. Mounted once at the App
  // root — the hook is idempotent.
  usePythonSetup();

  // Hydrate API keys from the main-process safeStorage on first paint.
  // The Settings window writes via window.api.secrets.set(...) and the main
  // window's Zustand state is empty until this runs. Without this the
  // pipeline's scoring step fails with "API key required".
  useEffect(() => {
    void hydrateSecretsFromMain();
    // Re-hydrate whenever the Settings window saves, so freshly entered keys /
    // output dir take effect in the main store immediately — independent of
    // BroadcastChannel availability or mount timing.
    return listenForSettingsChanges(() => void hydrateSecretsFromMain());
  }, [hydrateSecretsFromMain]);

  const isLongformOnly = useStore(selectIsLongformOnly);
  const screen = useMemo(
    () => selectScreen(stage, activeSourceId !== null, isLongformOnly),
    [stage, activeSourceId, isLongformOnly],
  );

  return (
    <ErrorBoundary>
      <div className="studio-shell bg-background text-foreground flex h-screen w-full flex-col">
        <Header activeScreen={screen} stage={stage} />
        <main className="relative flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <ScreenFrame key={stage} motionKey={stage}>
              {screen === 'drop' && <DropScreen />}
              {screen === 'processing' && <ProcessingScreen />}
              {screen === 'clips' && <ClipGrid />}
              {screen === 'render' && <RenderScreen />}
            </ScreenFrame>
          </AnimatePresence>
        </main>
        <ErrorLog />
      </div>
      <AutosaveToast />
      <Toaster />
      <RecoveryPrompt />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </ErrorBoundary>
  );
}
