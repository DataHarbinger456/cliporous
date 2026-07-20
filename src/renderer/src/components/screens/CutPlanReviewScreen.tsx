import { getPaletteById } from '@shared/palettes';
import type { LongformPlanItemType } from '@shared/types';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  FileText,
  History,
  LayoutPanelTop,
  Loader2,
  Lock,
  MessageSquareText,
  Palette,
  Pencil,
  Quote,
  RefreshCw,
  Trash2,
  Unlock,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CutPlanItemEditor } from '@/components/CutPlanItemEditor';
import { CutPlanVersionDialog } from '@/components/CutPlanVersionDialog';
import { PalettePicker } from '@/components/PalettePicker';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MISSING_GEMINI_KEY_MESSAGE, resolveGeminiKey } from '@/lib/gemini-key';
import {
  buildLongformPlanItems,
  buildLongformSections,
  estimateLongformRenderSeconds,
  formatTimecode,
  humanizeLongformKind,
  type LongformPlanItemRef,
  type LongformPlanItemUpdate,
  type LongformPlanItemView,
  longformItemKey,
  mergePreservedLongformItems,
  type PreservedLongformItem,
  planItemFromRef,
  removeLongformPlanItem,
  updateLongformPlanItem,
} from '@/lib/longform-plan';
import { cn } from '@/lib/utils';
import { prepareLongformRender } from '@/services/longform-render-service';
import { useStore } from '@/store';
import { getLongformVersions } from '@/store/longform-slice';

const ITEM_ICONS: Record<LongformPlanItemType, typeof Quote> = {
  phrase: Quote,
  block: LayoutPanelTop,
  card: FileText,
};

function planStatusLabel(status: 'draft' | 'accepted' | 'rejected'): string {
  if (status === 'accepted') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  return 'Needs review';
}

function PlanTimeline({
  duration,
  items,
}: {
  duration: number;
  items: LongformPlanItemView[];
}): React.JSX.Element {
  const safeDuration = Math.max(1, duration);
  const colors: Record<LongformPlanItemType, string> = {
    phrase: 'bg-info',
    block: 'bg-primary',
    card: 'bg-warning',
  };
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Editorial timeline</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Every marker uses absolute source time. Full-frame blocks replace the speaker; phrases
            and cards overlay it.
          </p>
        </div>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          0:00 / {formatTimecode(duration)}
        </span>
      </div>
      <div className="relative mt-4 h-8 rounded border border-border bg-muted/55" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        {items.map((item) => {
          const left = Math.max(0, Math.min(100, (item.startTime / safeDuration) * 100));
          const width = Math.max(
            0.45,
            Math.min(100 - left, ((item.endTime - item.startTime) / safeDuration) * 100),
          );
          return (
            <span
              key={item.key}
              title={`${item.kind}: ${formatTimecode(item.startTime)} to ${formatTimecode(item.endTime)}`}
              className={cn(
                'absolute top-1/2 h-3 -translate-y-1/2 rounded-sm opacity-85',
                colors[item.type],
              )}
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {(['phrase', 'block', 'card'] as const).map((type) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-sm', colors[type])} aria-hidden />
            {type === 'phrase'
              ? 'Phrase overlay'
              : type === 'block'
                ? 'Content block'
                : 'Evidence card'}
          </span>
        ))}
      </div>
    </Card>
  );
}

interface BeatCardProps {
  item: LongformPlanItemView;
  preserved: boolean;
  onEdit: () => void;
  onFeedback: () => void;
  onTogglePreserve: () => void;
}

function BeatCard({
  item,
  preserved,
  onEdit,
  onFeedback,
  onTogglePreserve,
}: BeatCardProps): React.JSX.Element {
  const Icon = ITEM_ICONS[item.type];
  return (
    <li className="grid gap-3 border-t border-border/70 py-3 first:border-0 first:pt-0 sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:items-start">
      <div className="font-mono text-xs tabular-nums text-muted-foreground">
        <span className="block text-foreground">{formatTimecode(item.startTime)}</span>
        <span>{formatTimecode(item.endTime)}</span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span className="text-xs font-medium text-muted-foreground">{item.kind}</span>
          {preserved && (
            <Badge variant="outline" className="gap-1 border-primary/35 bg-primary/10 text-primary">
              <Lock className="h-3 w-3" aria-hidden />
              Preserve
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm font-semibold leading-snug">{item.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
        <blockquote className="mt-2 border-l-2 border-border pl-2 text-xs leading-relaxed text-muted-foreground">
          <span className="sr-only">Transcript source: </span>
          {item.sourceText || 'No transcript excerpt is available for this timing.'}
        </blockquote>
      </div>
      <div className="flex flex-wrap gap-1 sm:justify-end">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil />
          Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={onFeedback}>
          <MessageSquareText />
          Feedback
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onTogglePreserve}
          aria-pressed={preserved}
          title={
            preserved
              ? 'Allow regeneration to change this beat'
              : 'Keep this beat during regeneration'
          }
        >
          {preserved ? <Unlock /> : <Lock />}
          {preserved ? 'Release' : 'Preserve'}
        </Button>
      </div>
    </li>
  );
}

export function CutPlanReviewScreen(): React.JSX.Element {
  const activeSourceId = useStore((state) => state.activeSourceId);
  const source = useStore((state) =>
    state.sources.find((candidate) => candidate.id === state.activeSourceId),
  );
  const record = useStore((state) =>
    state.activeSourceId ? state.longformPlans[state.activeSourceId] : undefined,
  );
  const transcription = useStore((state) =>
    state.activeSourceId ? state.transcriptions[state.activeSourceId] : undefined,
  );
  const settings = useStore((state) => state.settings);
  const addVersion = useStore((state) => state.addLongformPlanVersion);
  const restoreVersion = useStore((state) => state.restoreLongformPlanVersion);
  const acceptPlan = useStore((state) => state.acceptLongformPlan);
  const rejectPlan = useStore((state) => state.rejectLongformPlan);
  const addFeedback = useStore((state) => state.addLongformPlanFeedback);
  const markFeedbackApplied = useStore((state) => state.markLongformFeedbackApplied);
  const setPreservedItems = useStore((state) => state.setLongformPreservedItems);

  const [feedbackTarget, setFeedbackTarget] = useState<LongformPlanItemView | null | undefined>(
    undefined,
  );
  const [feedbackText, setFeedbackText] = useState('');
  const [editingItem, setEditingItem] = useState<LongformPlanItemView | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerationProgress, setRegenerationProgress] = useState('');
  const feedbackInputRef = useRef<HTMLTextAreaElement>(null);

  const words = transcription?.words ?? [];
  const plan = record?.plan;
  const versions = useMemo(() => (record ? getLongformVersions(record) : []), [record]);
  const items = useMemo(() => (plan ? buildLongformPlanItems(plan, words) : []), [plan, words]);
  const sections = useMemo(
    () => (plan && source ? buildLongformSections(plan, words, source.duration) : []),
    [plan, source, words],
  );
  const preservedItems = record?.preservedItems ?? [];
  const preservedKeys = useMemo(
    () => new Set(preservedItems.map((item) => item.key)),
    [preservedItems],
  );
  const pendingFeedback = (record?.feedback ?? []).filter((entry) => entry.status === 'pending');
  const invalidItems = items.filter(
    (item) =>
      item.endTime <= item.startTime ||
      item.startTime < 0 ||
      item.endTime > (source?.duration ?? 0),
  );
  const palette = getPaletteById(settings.longformPaletteId, settings.customPalettes);
  const status = record?.status ?? 'draft';
  const feedbackMode = feedbackTarget !== undefined;

  useEffect(() => {
    if (feedbackMode) feedbackInputRef.current?.focus();
  }, [feedbackMode]);

  if (!source || !record || !plan || !activeSourceId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-warning" aria-hidden />
          <h1 className="mt-3 text-base font-semibold">Cut Plan unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The source or generated plan is missing. Return to Source and run long-form analysis
            again.
          </p>
        </Card>
      </div>
    );
  }

  const createUserVersion = (
    nextPlan: typeof plan,
    note: string,
    nextPreserved: PreservedLongformItem[],
  ): void => {
    setPreservedItems(activeSourceId, nextPreserved);
    addVersion(activeSourceId, nextPlan, 'user-edited', note);
  };

  const saveItemEdit = (item: LongformPlanItemView, update: LongformPlanItemUpdate): void => {
    const ref: LongformPlanItemRef = { type: item.type, index: item.index };
    const nextPlan = updateLongformPlanItem(plan, ref, update);
    const edited = planItemFromRef(nextPlan, ref);
    const nextPreserved = preservedItems.filter((entry) => entry.key !== item.key);
    if (edited) {
      nextPreserved.push({
        key: longformItemKey(item.type, edited),
        type: item.type,
        item: structuredClone(edited),
      });
    }
    createUserVersion(
      nextPlan,
      `Edited ${item.kind} at ${formatTimecode(item.startTime)}`,
      nextPreserved,
    );
    toast.success('Cut Plan edit saved');
  };

  const removeItem = (item: LongformPlanItemView): void => {
    const nextPlan = removeLongformPlanItem(plan, { type: item.type, index: item.index });
    createUserVersion(
      nextPlan,
      `Removed ${item.kind} at ${formatTimecode(item.startTime)}`,
      preservedItems.filter((entry) => entry.key !== item.key),
    );
    toast.success('Beat removed. Restore an earlier version to undo.');
  };

  const togglePreserve = (item: LongformPlanItemView): void => {
    if (preservedKeys.has(item.key)) {
      setPreservedItems(
        activeSourceId,
        preservedItems.filter((entry) => entry.key !== item.key),
      );
      return;
    }
    const raw = planItemFromRef(plan, { type: item.type, index: item.index });
    if (!raw) return;
    setPreservedItems(activeSourceId, [
      ...preservedItems,
      { key: item.key, type: item.type, item: structuredClone(raw) },
    ]);
  };

  const toggleSectionPreserve = (sectionItems: LongformPlanItemView[]): void => {
    const allPreserved =
      sectionItems.length > 0 && sectionItems.every((item) => preservedKeys.has(item.key));
    if (allPreserved) {
      const sectionKeys = new Set(sectionItems.map((item) => item.key));
      setPreservedItems(
        activeSourceId,
        preservedItems.filter((entry) => !sectionKeys.has(entry.key)),
      );
      return;
    }
    const next = [...preservedItems];
    const existing = new Set(next.map((item) => item.key));
    for (const item of sectionItems) {
      if (existing.has(item.key)) continue;
      const raw = planItemFromRef(plan, { type: item.type, index: item.index });
      if (raw) next.push({ key: item.key, type: item.type, item: structuredClone(raw) });
    }
    setPreservedItems(activeSourceId, next);
  };

  const sendFeedback = (): void => {
    const message = feedbackText.trim();
    if (!message) return;
    addFeedback(activeSourceId, {
      targetKey: feedbackTarget?.key ?? null,
      targetLabel: feedbackTarget
        ? `${feedbackTarget.kind} at ${formatTimecode(feedbackTarget.startTime)}`
        : 'Whole plan',
      message,
    });
    setFeedbackText('');
    setFeedbackTarget(undefined);
    toast.success('Feedback saved. Regenerate when you are ready to apply it.');
  };

  const regenerate = async (): Promise<void> => {
    if (!navigator.onLine) {
      toast.error('Connect to the internet to regenerate this Cut Plan');
      return;
    }
    if (!transcription?.words.length) {
      toast.error('The saved transcript is required to regenerate');
      return;
    }
    const apiKey = await resolveGeminiKey(settings.geminiApiKey);
    if (!apiKey) {
      toast.error(MISSING_GEMINI_KEY_MESSAGE);
      return;
    }

    setRegenerating(true);
    setRegenerationProgress('Preparing transcript');
    const offProgress = window.api.onLongformEditProgress(({ window: current, total }) => {
      setRegenerationProgress(`Reviewing transcript window ${current} of ${total}`);
    });
    try {
      const feedback = pendingFeedback.map((entry) => `${entry.targetLabel}: ${entry.message}`);
      const generated = await window.api.generateLongformEditPlan(
        apiKey,
        transcription.words,
        source.duration,
        feedback,
      );
      const merged = mergePreservedLongformItems(generated as typeof plan, preservedItems);
      addVersion(
        activeSourceId,
        merged,
        'regenerated',
        `${feedback.length} feedback note${feedback.length === 1 ? '' : 's'} applied; ${preservedItems.length} beat${preservedItems.length === 1 ? '' : 's'} preserved`,
      );
      markFeedbackApplied(activeSourceId);
      toast.success('New Cut Plan version ready');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Cut Plan regeneration failed');
    } finally {
      offProgress();
      setRegenerating(false);
      setRegenerationProgress('');
    }
  };

  const acceptAndContinue = async (): Promise<void> => {
    if (status !== 'accepted') {
      acceptPlan(activeSourceId, settings.longformSkin, settings.longformPaletteId);
    }
    await prepareLongformRender();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-background px-4 py-4 sm:px-6">
        <div className="mx-auto grid w-full max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                Cut Plan review
              </p>
              <Badge
                variant="outline"
                className={cn(
                  status === 'accepted' && 'border-success/40 bg-success/10 text-success',
                  status === 'rejected' &&
                    'border-destructive/40 bg-destructive/10 text-destructive',
                )}
              >
                {planStatusLabel(status)}
              </Badge>
            </div>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight" title={source.name}>
              {source.name}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Inspect the editorial structure, spoken evidence, timing, and visual treatment before
              render time is spent.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-4 lg:text-right">
            <div>
              <dt className="text-muted-foreground">Sections</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{sections.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Evidence beats</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{items.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Source</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                {formatTimecode(source.duration)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Render estimate</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                ~{formatTimecode(estimateLongformRenderSeconds(plan, source.duration))}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto grid w-full max-w-7xl gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <main className="min-w-0 space-y-4">
            <Card className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3 p-3 sm:grid-cols-[128px_minmax(0,1fr)] sm:gap-4 sm:p-4">
              <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
                {source.thumbnail ? (
                  <img
                    src={source.thumbnail}
                    alt="Source poster frame"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Video className="h-5 w-5" aria-hidden />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" title={source.path}>
                  {source.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {source.width}×{source.height} source · {formatTimecode(source.duration)} ·{' '}
                  {words.length.toLocaleString()} transcript words
                </p>
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {plan.reasoning || 'No model reasoning was saved with this version.'}
                </p>
              </div>
            </Card>

            <PlanTimeline duration={source.duration} items={items} />

            {invalidItems.length > 0 && (
              <div
                role="alert"
                className="flex gap-3 rounded-lg border border-warning/35 bg-warning/10 p-3 text-sm"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                <div>
                  <p className="font-medium">
                    {invalidItems.length} unsupported timing{' '}
                    {invalidItems.length === 1 ? 'item' : 'items'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Edit or remove beats that fall outside the source before approval.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {sections.map((section) => {
                const sectionPreserved =
                  section.items.length > 0 &&
                  section.items.every((item) => preservedKeys.has(item.key));
                return (
                  <Card key={section.id} className="overflow-hidden">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 bg-muted/35 px-4 py-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-primary">
                            {String(section.index + 1).padStart(2, '0')}
                          </span>
                          <h2 className="text-sm font-semibold">{section.title}</h2>
                        </div>
                        <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                          {formatTimecode(section.startTime)} to {formatTimecode(section.endTime)} ·{' '}
                          {section.items.length} planned{' '}
                          {section.items.length === 1 ? 'beat' : 'beats'}
                        </p>
                      </div>
                      {section.items.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleSectionPreserve(section.items)}
                          aria-pressed={sectionPreserved}
                        >
                          {sectionPreserved ? <Unlock /> : <Lock />}
                          {sectionPreserved ? 'Release section' : 'Preserve section'}
                        </Button>
                      )}
                    </div>
                    <div className="p-4">
                      {section.items.length > 0 ? (
                        <ul>
                          {section.items.map((item) => (
                            <BeatCard
                              key={item.key}
                              item={item}
                              preserved={preservedKeys.has(item.key)}
                              onEdit={() => setEditingItem(item)}
                              onFeedback={() => setFeedbackTarget(item)}
                              onTogglePreserve={() => togglePreserve(item)}
                            />
                          ))}
                        </ul>
                      ) : (
                        <div className="py-6 text-center">
                          <p className="text-sm font-medium">Speaker-only section</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            No visual beats were planned for this source range.
                          </p>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </main>

          <aside
            className="space-y-4 xl:sticky xl:top-0 xl:self-start"
            aria-label="Cut Plan controls"
          >
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" aria-hidden />
                <h2 className="text-sm font-semibold">Style and palette</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Applied to every full-frame content block.
              </p>
              <div className="mt-3 flex items-center gap-3 rounded-md border border-border bg-muted/35 p-3">
                <span className="flex gap-1" aria-hidden>
                  {[palette.background, palette.foreground, palette.accent].map((color) => (
                    <span
                      key={color}
                      className="h-5 w-5 rounded border border-border"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    {humanizeLongformKind(settings.longformSkin)}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{palette.name}</p>
                </div>
              </div>
              <details className="mt-3 group">
                <summary className="cursor-pointer rounded-md px-2 py-2 text-xs font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Change style and palette
                </summary>
                <PalettePicker
                  className="mt-3 border-t border-border pt-4"
                  disabled={regenerating}
                />
              </details>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" aria-hidden />
                  <h2 className="text-sm font-semibold">Version history</h2>
                </div>
                <Badge variant="secondary">{versions.length}</Badge>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Generated, edited, regenerated, and approved snapshots stay in this project.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => setVersionsOpen(true)}
              >
                <History />
                Compare and restore
              </Button>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4 text-primary" aria-hidden />
                  <h2 className="text-sm font-semibold">Focused feedback</h2>
                </div>
                <Badge variant={pendingFeedback.length > 0 ? 'default' : 'secondary'}>
                  {pendingFeedback.length} pending
                </Badge>
              </div>
              {pendingFeedback.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {pendingFeedback.slice(-3).map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded border border-border bg-muted/35 p-2 text-xs"
                    >
                      <p className="font-medium">{entry.targetLabel}</p>
                      <p className="mt-1 line-clamp-3 leading-relaxed text-muted-foreground">
                        {entry.message}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Target the whole plan or one beat. Notes stay saved if regeneration fails.
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => setFeedbackTarget(null)}
              >
                <MessageSquareText />
                Add plan feedback
              </Button>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-primary" aria-hidden />
                <h2 className="text-sm font-semibold">Render preflight</h2>
              </div>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Working estimate</dt>
                  <dd className="font-medium tabular-nums">
                    ~{formatTimecode(estimateLongformRenderSeconds(plan, source.duration))}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Known unsupported</dt>
                  <dd
                    className={cn(
                      'font-medium tabular-nums',
                      invalidItems.length > 0 && 'text-warning',
                    )}
                  >
                    {invalidItems.length}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Preserved beats</dt>
                  <dd className="font-medium tabular-nums">{preservedItems.length}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                The render may thin overlapping full-frame visuals. Every fallback will be
                reconciled against this approved version.
              </p>
            </Card>
          </aside>
        </div>
      </div>

      <footer className="shrink-0 border-t border-border bg-card/95 px-4 py-3 sm:px-6">
        <div className="mx-auto w-full max-w-7xl">
          {feedbackMode ? (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <label htmlFor="cut-plan-feedback" className="text-xs font-semibold">
                  Feedback for{' '}
                  {feedbackTarget
                    ? `${feedbackTarget.kind} at ${formatTimecode(feedbackTarget.startTime)}`
                    : 'the whole plan'}
                </label>
                <textarea
                  ref={feedbackInputRef}
                  id="cut-plan-feedback"
                  value={feedbackText}
                  onChange={(event) => setFeedbackText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setFeedbackTarget(undefined);
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      sendFeedback();
                    }
                  }}
                  rows={3}
                  maxLength={1200}
                  placeholder="Remove this block, change the wording, move the timing, replace the visual type, or preserve this section."
                  className="mt-1.5 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => setFeedbackTarget(undefined)}>
                  Cancel
                </Button>
                <Button onClick={sendFeedback} disabled={!feedbackText.trim()}>
                  <MessageSquareText />
                  Send feedback
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground lg:col-span-2">
                Cmd/Ctrl+Enter to send · Escape to cancel
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium">
                  {status === 'rejected'
                    ? 'This plan is rejected. Revise, regenerate, restore, or approve it when ready.'
                    : `${items.length} beats across ${sections.length} sections are ready for your decision.`}
                </p>
                {regenerating && (
                  <p
                    role="status"
                    className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    {regenerationProgress || 'Regenerating Cut Plan'}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setRejectOpen(true)}
                  disabled={regenerating}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 />
                  Reject
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setVersionsOpen(true)}
                  disabled={regenerating}
                >
                  <History />
                  Compare
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setFeedbackTarget(null)}
                  disabled={regenerating}
                >
                  <MessageSquareText />
                  Feedback
                </Button>
                <Button variant="outline" onClick={() => void regenerate()} disabled={regenerating}>
                  {regenerating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  Regenerate{pendingFeedback.length > 0 ? ` (${pendingFeedback.length})` : ''}
                </Button>
                <Button
                  onClick={() => void acceptAndContinue()}
                  disabled={regenerating || invalidItems.length > 0}
                >
                  {status === 'accepted' ? <ArrowRight /> : <Check />}
                  {status === 'accepted' ? 'Continue to render' : 'Accept and Continue'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </footer>

      <CutPlanItemEditor
        item={editingItem}
        open={editingItem !== null}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null);
        }}
        onSave={(update) => {
          if (editingItem) saveItemEdit(editingItem, update);
        }}
        onRemove={() => {
          if (editingItem) removeItem(editingItem);
        }}
      />
      <CutPlanVersionDialog
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        versions={versions}
        activeVersionId={record.activeVersionId ?? versions.at(-1)?.id}
        onRestore={(versionId) => {
          restoreVersion(activeSourceId, versionId);
          setPreservedItems(activeSourceId, []);
          toast.success('Saved Cut Plan version restored');
        }}
      />
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this Cut Plan?</AlertDialogTitle>
            <AlertDialogDescription>
              Rendering will not start. The transcript, feedback, edits, and all saved versions stay
              in this project so you can restore or regenerate later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                rejectPlan(activeSourceId);
                toast.success('Cut Plan rejected. Saved versions were kept.');
              }}
            >
              <X />
              Reject plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
