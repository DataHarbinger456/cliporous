import type { LucideIcon } from 'lucide-react';
import {
  Check,
  CircleUserRound,
  FileDown,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderOutput,
  Keyboard,
  LayoutTemplate,
  Moon,
  NotebookPen,
  Save,
  SaveAll,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CreativeBriefDialog } from '@/components/CreativeBriefDialog';
import { CreatorProfileDialog } from '@/components/CreatorProfileDialog';
import { TemplateEditor } from '@/components/TemplateEditor';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useTheme } from '@/hooks/useTheme';
import { modifierKeyLabel, openLogsLabel, shortcutLabel } from '@/lib/platform';
import { cn } from '@/lib/utils';
import {
  adjustUiZoom,
  setDisplayPreferences,
  useDisplayPreferences,
} from '@/services/display-preferences';
import { prepareApprovedRender } from '@/services/render-service';
import { useStore } from '@/store';
import type { PipelineStage } from '@/store/types';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNew: () => void;
  onOpen: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onSaveAs: () => void | Promise<void>;
  onShowShortcuts: () => void;
}

interface CreatorCommand {
  id: string;
  group: 'Project' | 'Navigate' | 'Review' | 'Studio' | 'View';
  label: string;
  description: string;
  keywords?: string;
  icon: LucideIcon;
  shortcut?: string;
  enabled?: boolean;
  disabledReason?: string;
  run: () => void | Promise<void>;
}

const ACTIVE_WORK_STAGES = new Set<PipelineStage>([
  'downloading',
  'transcribing',
  'scoring',
  'stitching',
  'optimizing-loops',
  'detecting-faces',
  'ai-editing',
  'segmenting',
  'rendering',
]);

function commandMatches(command: CreatorCommand, query: string): boolean {
  if (!query) return true;
  const haystack =
    `${command.label} ${command.description} ${command.keywords ?? ''}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}

export function CommandPalette({
  open,
  onOpenChange,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onShowShortcuts,
}: CommandPaletteProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [briefOpen, setBriefOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const commandRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && document.activeElement instanceof HTMLElement) {
    previouslyFocused.current = document.activeElement;
  }
  wasOpen.current = open;
  const { theme, setTheme } = useTheme();
  const displayPreferences = useDisplayPreferences();
  const highZoom = displayPreferences.uiZoom >= 1.5;

  const activeSourceId = useStore((state) => state.activeSourceId);
  const stage = useStore((state) => state.pipeline.stage);
  const clipsBySource = useStore((state) => state.clips);
  const stitchedBySource = useStore((state) => state.stitchedClips);
  const selectedClipId = useStore((state) => state.workspace.selectedClipId);
  const selectedClipIds = useStore((state) => state.selectedClipIds);
  const saveStatus = useStore((state) => state.saveStatus);
  const isRendering = useStore((state) => state.isRendering);
  const singleRenderStatus = useStore((state) => state.singleRenderStatus);
  const outputDirectory = useStore((state) => state.settings.outputDirectory);
  const setPipeline = useStore((state) => state.setPipeline);
  const setWorkspaceSelectedClip = useStore((state) => state.setWorkspaceSelectedClip);
  const updateClipStatus = useStore((state) => state.updateClipStatus);
  const updateStitchedClipStatus = useStore((state) => state.updateStitchedClipStatus);

  const activeClips = activeSourceId ? (clipsBySource[activeSourceId] ?? []) : [];
  const activeStitchedClips = activeSourceId ? (stitchedBySource[activeSourceId] ?? []) : [];
  const hasReviewClips = activeClips.length + activeStitchedClips.length > 0;
  const approvedClipIds = [
    ...activeClips.filter((clip) => clip.status === 'approved').map((clip) => clip.id),
    ...activeStitchedClips.filter((clip) => clip.status === 'approved').map((clip) => clip.id),
  ];
  const selectedRenderIds =
    selectedClipIds.size > 0 ? Array.from(selectedClipIds) : selectedClipId ? [selectedClipId] : [];
  const sourceUnavailable = useStore((state) => {
    const source = state.sources.find((item) => item.id === state.activeSourceId);
    return source?.mediaStatus === 'offline' || source?.mediaStatus === 'checking';
  });
  const activeWork =
    ACTIVE_WORK_STAGES.has(stage) || isRendering || singleRenderStatus === 'rendering';

  const jumpTo = (nextStage: PipelineStage): void => {
    setWorkspaceSelectedClip(null);
    setPipeline({ stage: nextStage, message: '', percent: nextStage === 'done' ? 100 : 0 });
  };

  const updateSelectedStatus = (status: 'approved' | 'rejected'): void => {
    if (!activeSourceId || !selectedClipId) return;
    if (activeClips.some((clip) => clip.id === selectedClipId)) {
      updateClipStatus(activeSourceId, selectedClipId, status);
    } else if (activeStitchedClips.some((clip) => clip.id === selectedClipId)) {
      updateStitchedClipStatus(activeSourceId, selectedClipId, status);
    }
    setWorkspaceSelectedClip(null);
    toast.success(status === 'approved' ? 'Clip approved' : 'Clip rejected');
  };

  const runRender = async (clipIds: string[], label: string): Promise<void> => {
    try {
      await prepareApprovedRender({ clipIds });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Couldn't ${label.toLowerCase()}`);
    }
  };

  const commands: CreatorCommand[] = [
    {
      id: 'new-project',
      group: 'Project',
      label: 'New Project',
      description: 'Start a clean creator cut.',
      icon: FilePlus2,
      shortcut: shortcutLabel(modifierKeyLabel, 'N'),
      run: onNew,
    },
    {
      id: 'open-project',
      group: 'Project',
      label: 'Open Project',
      description: 'Choose a saved .batchclip project.',
      icon: FolderOpen,
      shortcut: shortcutLabel(modifierKeyLabel, 'O'),
      run: onOpen,
    },
    {
      id: 'save-project',
      group: 'Project',
      label: 'Save Project',
      description: 'Save changes to the current project file.',
      icon: Save,
      shortcut: shortcutLabel(modifierKeyLabel, 'S'),
      enabled: saveStatus !== 'saving',
      disabledReason: 'A save is already in progress.',
      run: onSave,
    },
    {
      id: 'save-project-as',
      group: 'Project',
      label: 'Save Project As',
      description: 'Choose a new project file and location.',
      icon: SaveAll,
      shortcut: shortcutLabel(modifierKeyLabel, 'Shift', 'S'),
      enabled: saveStatus !== 'saving',
      disabledReason: 'A save is already in progress.',
      run: onSaveAs,
    },
    {
      id: 'go-source',
      group: 'Navigate',
      label: 'Go to Source',
      description: 'Return to footage intake without clearing the project.',
      keywords: 'jump import video',
      icon: FileDown,
      enabled: !activeWork,
      disabledReason: 'Finish or cancel the active job first.',
      run: () => jumpTo('idle'),
    },
    {
      id: 'go-review',
      group: 'Navigate',
      label: 'Go to Review',
      description: 'Review and shape generated clips.',
      keywords: 'jump shape clips selects',
      icon: SlidersHorizontal,
      enabled: hasReviewClips && !activeWork,
      disabledReason: activeWork
        ? 'Finish or cancel the active job first.'
        : 'Analyze a source to create clips first.',
      run: () => jumpTo('ready'),
    },
    {
      id: 'go-export',
      group: 'Navigate',
      label: 'Go to Export',
      description: 'Open the render queue and finished outputs.',
      keywords: 'jump render output',
      icon: FolderOutput,
      enabled: (approvedClipIds.length > 0 || stage === 'done') && !activeWork,
      disabledReason: activeWork
        ? 'Finish or cancel the active job first.'
        : 'Approve at least one clip first.',
      run: () => jumpTo('done'),
    },
    {
      id: 'approve-selected',
      group: 'Review',
      label: 'Approve Selected Clip',
      description: 'Mark the open clip as ready to render.',
      icon: Check,
      enabled: Boolean(selectedClipId) && !activeWork,
      disabledReason: activeWork ? 'Review is locked during active work.' : 'Open a clip first.',
      run: () => updateSelectedStatus('approved'),
    },
    {
      id: 'reject-selected',
      group: 'Review',
      label: 'Reject Selected Clip',
      description: 'Remove the open clip from approved exports.',
      icon: X,
      enabled: Boolean(selectedClipId) && !activeWork,
      disabledReason: activeWork ? 'Review is locked during active work.' : 'Open a clip first.',
      run: () => updateSelectedStatus('rejected'),
    },
    {
      id: 'render-selected',
      group: 'Review',
      label: 'Render Selected',
      description: 'Render the current selection without changing review decisions.',
      icon: FileDown,
      enabled: selectedRenderIds.length > 0 && !activeWork && !sourceUnavailable,
      disabledReason: sourceUnavailable
        ? 'Relink the source media first.'
        : activeWork
          ? 'A job is already running.'
          : 'Select or open at least one clip first.',
      run: () => runRender(selectedRenderIds, 'Render selected clips'),
    },
    {
      id: 'render-approved',
      group: 'Review',
      label: 'Render Approved',
      description: `${approvedClipIds.length} approved ${approvedClipIds.length === 1 ? 'clip' : 'clips'} ready.`,
      icon: FolderOutput,
      enabled: approvedClipIds.length > 0 && !activeWork && !sourceUnavailable,
      disabledReason: sourceUnavailable
        ? 'Relink the source media first.'
        : activeWork
          ? 'A job is already running.'
          : 'Approve at least one clip first.',
      run: () => runRender(approvedClipIds, 'Render approved clips'),
    },
    {
      id: 'creative-brief',
      group: 'Studio',
      label: 'Creative Brief',
      description: 'Set audience, goal, tone, guardrails, and notes for this project.',
      icon: NotebookPen,
      run: () => setBriefOpen(true),
    },
    {
      id: 'creator-profile',
      group: 'Studio',
      label: 'Creator Profile',
      description:
        'Inspect reusable brand defaults, project overrides, and remembered preferences.',
      icon: CircleUserRound,
      run: () => setProfileOpen(true),
    },
    {
      id: 'template',
      group: 'Studio',
      label: 'Template',
      description: 'Position hook titles and captions inside platform safe zones.',
      icon: LayoutTemplate,
      run: () => setTemplateOpen(true),
    },
    {
      id: 'settings',
      group: 'Studio',
      label: 'Settings',
      description: 'Connections, output, rendering, and studio preferences.',
      icon: Settings,
      shortcut: shortcutLabel(modifierKeyLabel, ','),
      run: () => window.api.openSettingsWindow(),
    },
    {
      id: 'output-folder',
      group: 'Studio',
      label: 'Open Output Folder',
      description: outputDirectory ?? 'Open the default BatchClip output folder.',
      icon: FolderOutput,
      run: async () => {
        await window.api.openOutputFolder(outputDirectory ?? undefined);
      },
    },
    {
      id: 'logs',
      group: 'Studio',
      label: openLogsLabel(),
      description: 'Open creator diagnostics and session logs.',
      icon: FileText,
      run: () => window.api.openLogFolder(),
    },
    {
      id: 'theme',
      group: 'View',
      label: theme === 'dark' ? 'Use Light Theme' : 'Use Dark Theme',
      description: 'Switch the studio appearance across windows.',
      icon: theme === 'dark' ? Sun : Moon,
      run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    },
    {
      id: 'sound',
      group: 'View',
      label: displayPreferences.soundEnabled
        ? 'Mute Studio Sound Cues'
        : 'Enable Studio Sound Cues',
      description: 'Keep finite export and attention cues on for future sessions.',
      icon: displayPreferences.soundEnabled ? VolumeX : Volume2,
      run: () => setDisplayPreferences({ soundEnabled: !displayPreferences.soundEnabled }),
    },
    {
      id: 'zoom-in',
      group: 'View',
      label: 'Zoom In',
      description: `Increase UI zoom from ${Math.round(displayPreferences.uiZoom * 100)}%.`,
      icon: ZoomIn,
      shortcut: shortcutLabel(modifierKeyLabel, '+'),
      enabled: displayPreferences.uiZoom < 2,
      disabledReason: 'UI zoom is already at 200%.',
      run: () => {
        adjustUiZoom('in');
      },
    },
    {
      id: 'zoom-out',
      group: 'View',
      label: 'Zoom Out',
      description: `Decrease UI zoom from ${Math.round(displayPreferences.uiZoom * 100)}%.`,
      icon: ZoomOut,
      shortcut: shortcutLabel(modifierKeyLabel, '−'),
      enabled: displayPreferences.uiZoom > 0.5,
      disabledReason: 'UI zoom is already at 50%.',
      run: () => {
        adjustUiZoom('out');
      },
    },
    {
      id: 'shortcuts',
      group: 'View',
      label: 'Keyboard Shortcuts',
      description: 'Show every global creator shortcut.',
      icon: Keyboard,
      shortcut: shortcutLabel(modifierKeyLabel, '/'),
      run: onShowShortcuts,
    },
  ];

  const filteredCommands = commands.filter((command) => commandMatches(command, query.trim()));
  const groupedCommands = filteredCommands.reduce<Map<CreatorCommand['group'], CreatorCommand[]>>(
    (groups, command) => {
      const entries = groups.get(command.group) ?? [];
      entries.push(command);
      groups.set(command.group, entries);
      return groups;
    },
    new Map(),
  );

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const runCommand = (command: CreatorCommand): void => {
    if (command.enabled === false) return;
    onOpenChange(false);
    void Promise.resolve(command.run()).catch((error) => {
      toast.error(error instanceof Error ? error.message : `Couldn't run ${command.label}`);
    });
  };

  const focusCommand = (index: number): void => {
    if (filteredCommands.length === 0) return;
    const wrapped = (index + filteredCommands.length) % filteredCommands.length;
    commandRefs.current[wrapped]?.focus();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            previouslyFocused.current?.focus();
          }}
          className={cn('gap-0 overflow-hidden p-0 sm:max-w-2xl', highZoom && 'flex flex-col')}
          style={
            highZoom
              ? {
                  top: '0.5rem',
                  left: '0.5rem',
                  width: 'calc(100% - 1rem)',
                  height: 'calc(100% - 1rem)',
                  maxWidth: 'none',
                  transform: 'none',
                }
              : undefined
          }
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Creator commands</DialogTitle>
            <DialogDescription>
              Search project, review, studio, and display actions.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 border-b border-border px-4 pr-12 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  focusCommand(0);
                }
              }}
              aria-label="Search creator commands"
              placeholder="Search creator commands…"
              className="command-search-input h-12 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
              Esc
            </kbd>
          </div>

          <div
            className={cn(
              'max-h-[min(560px,calc(100vh-8rem))] overflow-y-auto p-2',
              highZoom && 'min-h-0 max-h-none flex-1',
            )}
          >
            {filteredCommands.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center gap-1 px-6 text-center">
                <p className="text-sm font-medium">No matching commands</p>
                <p className="text-xs text-muted-foreground">
                  Try a project, review, or view action.
                </p>
              </div>
            ) : (
              Array.from(groupedCommands.entries()).map(([group, entries]) => (
                <section key={group} aria-labelledby={`command-group-${group}`} className="py-1">
                  <h3
                    id={`command-group-${group}`}
                    className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    {group}
                  </h3>
                  <div className="grid gap-0.5">
                    {entries.map((command) => {
                      const index = filteredCommands.indexOf(command);
                      const Icon = command.icon;
                      const unavailable = command.enabled === false;
                      return (
                        <button
                          key={command.id}
                          ref={(node) => {
                            commandRefs.current[index] = node;
                          }}
                          type="button"
                          aria-disabled={unavailable}
                          onClick={() => runCommand(command)}
                          onKeyDown={(event) => {
                            if (event.key === 'ArrowDown') {
                              event.preventDefault();
                              focusCommand(index + 1);
                            } else if (event.key === 'ArrowUp') {
                              event.preventDefault();
                              focusCommand(index - 1);
                            } else if (event.key === 'Home') {
                              event.preventDefault();
                              focusCommand(0);
                            } else if (event.key === 'End') {
                              event.preventDefault();
                              focusCommand(filteredCommands.length - 1);
                            }
                          }}
                          className={cn(
                            'flex min-h-12 w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            unavailable
                              ? 'cursor-not-allowed text-muted-foreground/75'
                              : 'hover:bg-accent/10 focus:bg-accent/10',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {command.label}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {unavailable ? command.disabledReason : command.description}
                            </span>
                          </span>
                          {command.shortcut && (
                            <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              {command.shortcut}
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CreativeBriefDialog open={briefOpen} onOpenChange={setBriefOpen} />
      <CreatorProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <TemplateEditor open={templateOpen} onOpenChange={setTemplateOpen} showTrigger={false} />
    </>
  );
}
