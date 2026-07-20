import type { CreatorJob } from '@shared/jobs';
import {
  Check,
  ChevronRight,
  Ellipsis,
  FolderOpen,
  Keyboard,
  Moon,
  Save,
  SaveAll,
  Search,
  Settings,
  Sun,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { AiUsageIndicator } from '@/components/AiUsageIndicator';
import { BrandMark } from '@/components/BrandMark';
import { JobsHud } from '@/components/JobsHud';
import { ProjectIdentityStatus } from '@/components/ProjectIdentityStatus';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/hooks/useTheme';
import { isMac, modifierKeyLabel, shortcutLabel } from '@/lib/platform';
import {
  adjustUiZoom,
  setDisplayPreferences,
  useDisplayPreferences,
} from '@/services/display-preferences';
import { useStore } from '@/store';
import type { ScreenName } from '@/store/selectors';

interface StudioHeaderProps {
  activeScreen: ScreenName;
  stage: string;
  onNew: () => void;
  onOpen: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onSaveAs: () => void | Promise<void>;
  onOpenCommands: () => void;
  onShowShortcuts: () => void;
  onOpenJob: (job: CreatorJob) => void | Promise<void>;
}

type RailKey = 'source' | 'shape' | 'export';

const STAGE_RAIL: ReadonlyArray<{ key: RailKey; label: string; detail: string }> = [
  { key: 'source', label: 'Source', detail: 'Bring in a video' },
  { key: 'shape', label: 'Shape', detail: 'Find and refine clips' },
  { key: 'export', label: 'Export', detail: 'Render finished clips' },
];

export function StudioHeader({
  activeScreen,
  stage,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onOpenCommands,
  onShowShortcuts,
  onOpenJob,
}: StudioHeaderProps): React.JSX.Element {
  const saveStatus = useStore((state) => state.saveStatus);
  const displayPreferences = useDisplayPreferences();
  const highZoom = displayPreferences.uiZoom >= 1.5;
  const { theme, setTheme } = useTheme();
  const activeRail: RailKey =
    activeScreen === 'drop' ? 'source' : activeScreen === 'render' ? 'export' : 'shape';
  const activeIndex = STAGE_RAIL.findIndex((item) => item.key === activeRail);
  const stageName = stage.replace(/[-_]/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
  const showDetailedStage = !['idle', 'ready', 'done'].includes(stage);

  return (
    <header
      className={`filmstrip-rule relative grid w-full max-w-[100vw] min-h-16 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur-sm lg:flex lg:flex-nowrap lg:gap-x-5 lg:px-4 lg:py-0 ${isMac ? (highZoom ? 'pl-10' : 'pl-20 lg:pl-20') : ''} ${highZoom ? 'pr-24' : ''}`}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex min-w-0 items-center gap-2 lg:gap-3">
        <BrandMark
          showName={!highZoom}
          className={highZoom ? '' : 'max-[619px]:[&>span:last-child]:hidden'}
        />
        <ProjectIdentityStatus stage={stage} compact={highZoom} />
      </div>

      <ol
        aria-label="Studio progress"
        className="col-span-2 row-start-2 flex min-w-0 items-center gap-0.5 lg:col-auto lg:row-auto lg:flex-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {STAGE_RAIL.map((item, index) => {
          const isActive = item.key === activeRail;
          const isComplete = index < activeIndex;
          return (
            <li key={item.key} className="flex min-w-0 items-center">
              <div
                className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 ${
                  isActive
                    ? 'bg-primary/[0.12] text-foreground'
                    : isComplete
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/70'
                }`}
                aria-current={isActive ? 'step' : undefined}
                title={
                  isActive && showDetailedStage ? `${item.detail} · ${stageName}` : item.detail
                }
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                    isActive
                      ? 'border-primary/60 bg-primary text-primary-foreground'
                      : isComplete
                        ? 'border-primary/40 text-primary'
                        : 'border-[hsl(var(--border-strong))] text-muted-foreground'
                  }`}
                >
                  {isComplete ? <Check className="h-3 w-3" aria-hidden /> : index + 1}
                </span>
                <span
                  className={`${isActive ? 'inline' : 'hidden sm:inline'} truncate text-xs font-medium`}
                >
                  {item.label}
                  {isActive && showDetailedStage && (
                    <span className="text-muted-foreground"> · {stageName}</span>
                  )}
                </span>
              </div>
              {index < STAGE_RAIL.length - 1 && (
                <ChevronRight
                  className="hidden h-3.5 w-3.5 shrink-0 text-[hsl(var(--border-strong))] sm:block"
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>

      <div
        className={
          highZoom
            ? 'absolute right-2 top-2 flex items-center gap-1'
            : 'col-start-2 row-start-1 flex min-w-max items-center gap-1 lg:col-auto lg:row-auto'
        }
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="hidden 2xl:block">
          <AiUsageIndicator />
        </div>
        <JobsHud onOpenJob={onOpenJob} compact={highZoom} />
        {!highZoom && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSave}
            disabled={saveStatus === 'saving'}
            aria-label="Save project"
            title={`Save project (${shortcutLabel(modifierKeyLabel, 'S')})`}
          >
            <Save aria-hidden />
            <span className="hidden min-[540px]:inline">Save</span>
          </Button>
        )}
        {!highZoom && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenCommands}
            aria-label="Open creator commands"
            title={`Creator commands (${shortcutLabel(modifierKeyLabel, 'K')})`}
          >
            <Search aria-hidden />
            <span className="hidden min-[700px]:inline">Commands</span>
            <kbd className="ml-1 hidden rounded border border-border px-1 py-0.5 font-mono text-[9px] text-muted-foreground xl:inline">
              {shortcutLabel(modifierKeyLabel, 'K')}
            </kbd>
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label="More studio actions"
              title="More studio actions"
            >
              <Ellipsis aria-hidden />
              {!highZoom && (
                <span className="hidden min-[820px]:inline lg:hidden xl:inline">More</span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Project</DropdownMenuLabel>
            <DropdownMenuItem onSelect={onNew}>New Project</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void onOpen()}>
              <FolderOpen /> Open Project
              <DropdownMenuShortcut>{shortcutLabel(modifierKeyLabel, 'O')}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={saveStatus === 'saving'} onSelect={() => void onSave()}>
              <Save /> Save Project
              <DropdownMenuShortcut>{shortcutLabel(modifierKeyLabel, 'S')}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={saveStatus === 'saving'} onSelect={() => void onSaveAs()}>
              <SaveAll /> Save Project As
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenCommands}>
              <Search /> Creator Commands
              <DropdownMenuShortcut>{shortcutLabel(modifierKeyLabel, 'K')}</DropdownMenuShortcut>
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Display</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={displayPreferences.gridDensity}
              onValueChange={(gridDensity) =>
                setDisplayPreferences({ gridDensity: gridDensity as 'comfortable' | 'compact' })
              }
            >
              <DropdownMenuRadioItem value="comfortable">Comfortable grid</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="compact">Compact grid</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuRadioGroup
              value={displayPreferences.inspectorWidth}
              onValueChange={(inspectorWidth) =>
                setDisplayPreferences({
                  inspectorWidth: inspectorWidth as 'narrow' | 'standard' | 'wide',
                })
              }
            >
              <DropdownMenuRadioItem value="narrow">Narrow inspector</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="standard">Standard inspector</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="wide">Wide inspector</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuCheckboxItem
              checked={displayPreferences.activityFeedExpanded}
              onCheckedChange={(activityFeedExpanded) =>
                setDisplayPreferences({ activityFeedExpanded: Boolean(activityFeedExpanded) })
              }
            >
              Expand activity feed
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={displayPreferences.soundEnabled}
              onCheckedChange={(soundEnabled) =>
                setDisplayPreferences({ soundEnabled: Boolean(soundEnabled) })
              }
            >
              {displayPreferences.soundEnabled ? <Volume2 /> : <VolumeX />}
              Studio sound cues
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem onSelect={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun /> : <Moon />}
              {theme === 'dark' ? 'Use Light Theme' : 'Use Dark Theme'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => adjustUiZoom('in')}>
              <ZoomIn /> Zoom In
              <DropdownMenuShortcut>
                {Math.round(displayPreferences.uiZoom * 100)}%
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => adjustUiZoom('out')}>
              <ZoomOut /> Zoom Out
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => adjustUiZoom('reset')}>
              Reset Zoom
              <DropdownMenuShortcut>{shortcutLabel(modifierKeyLabel, '0')}</DropdownMenuShortcut>
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void window.api.openSettingsWindow()}>
              <Settings /> Settings
              <DropdownMenuShortcut>{shortcutLabel(modifierKeyLabel, ',')}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onShowShortcuts}>
              <Keyboard /> Keyboard Shortcuts
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="sr-only" aria-live="polite">
          Current stage: {stageName}
        </span>
      </div>
    </header>
  );
}
