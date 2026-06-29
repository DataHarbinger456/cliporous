/**
 * RenderScreen — per-clip render progress list + post-render summary.
 *
 * Layout (per ux spec):
 *   • Top bar: "Render All" Button (disabled while running). Becomes
 *     a destructive "Cancel" Button while a batch is in flight.
 *   • Body: one shadcn <Card> row per approved clip with:
 *       — small thumbnail
 *       — hook text (line-clamped)
 *       — status <Badge> (pending / rendering / done / error)
 *       — per-row <Progress> bar visible while rendering
 *       — error message line under the bar when status === 'error'
 *   • Footer (after batch completes): "Open Output Folder" + "Back to Clips".
 *
 * The screen subscribes to the five render send-channels via the preload
 * bridge:
 *   render:clipStart  · render:clipProgress · render:clipDone
 *   render:clipError  · render:batchDone
 * Subscriptions are wired in a single useEffect; each `on…` returns its own
 * unsubscribe and we clean them up on unmount or when the screen unmounts
 * mid-batch.
 *
 * Pure UI: orchestration of building RenderClipJob[] + global render settings
 * is intentionally minimal here — we forward what the store already has.
 * Anything more elaborate (B-Roll, hook overlay config, etc.) belongs in a
 * dedicated render-service and is out of scope for this screen.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  FileSpreadsheet,
  FileVideo,
  Folder,
  FolderOpen,
  Loader2,
  Play,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

import { startApprovedRender } from '@/services/render-service'
import { LONGFORM_RENDER_DEFAULTS } from '@/services/render-defaults'
import { PalettePicker } from '@/components/PalettePicker'
import { TemplateEditor } from '@/components/TemplateEditor'
import { useStore } from '@/store'
import type { ClipCandidate, RenderProgress, SourceVideo } from '@/store/types'
import type { LongformPlanRecord } from '@/store/longform-slice'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RowStatus = RenderProgress['status'] // 'queued' | 'preparing' | 'rendering' | 'done' | 'error'

interface RowProgress {
  status: RowStatus
  percent: number
  error?: string
  /** Suggested action shown alongside the error summary (RF-022). */
  suggestion?: string
  /** Raw engine output (stderr tail), shown behind a "details" expander. */
  details?: string
  outputPath?: string
  /** Live status text shown during the prepare phase (B-Roll, filler removal, etc.) */
  prepareMessage?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a stable map of clipId → progress, defaulting unseen clips to queued. */
function buildProgressMap(
  approved: readonly ClipCandidate[],
  records: readonly RenderProgress[]
): Map<string, RowProgress> {
  const map = new Map<string, RowProgress>()
  for (const clip of approved) {
    map.set(clip.id, { status: 'queued', percent: 0 })
  }
  for (const r of records) {
    if (!map.has(r.clipId)) continue
    map.set(r.clipId, {
      status: r.status,
      percent: r.percent,
      error: r.error,
      suggestion: r.suggestion,
      details: r.details,
      outputPath: r.outputPath,
      prepareMessage: r.prepareMessage,
    })
  }
  return map
}

/** Pick a small poster image for the row. Custom thumbnail wins. */
function pickThumbnail(clip: ClipCandidate): string | undefined {
  return clip.customThumbnail ?? clip.thumbnail
}

/** Trailing path segment (filename) from a POSIX or Windows path. */
function basename(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] || filePath
}

/** Reveal a rendered file in the OS file manager (Finder / Explorer). */
async function revealInFolder(filePath: string): Promise<void> {
  try {
    await window.api.showItemInFolder(filePath)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    toast.error(`Couldn't reveal file: ${msg}`)
  }
}

// ---------------------------------------------------------------------------
// Status Badge — shadcn <Badge> only (no custom UI)
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: RowStatus }): React.JSX.Element {
  switch (status) {
    case 'queued':
      return (
        <Badge variant="outline" className="gap-1 font-normal">
          Pending
        </Badge>
      )
    case 'preparing':
    case 'rendering':
      return (
        <Badge variant="secondary" className="gap-1 font-normal">
          <Loader2 className="h-3 w-3 animate-spin" />
          {status === 'preparing' ? 'Preparing' : 'Rendering'}
        </Badge>
      )
    case 'done':
      return (
        <Badge variant="default" className="gap-1 font-normal">
          <Check className="h-3 w-3" />
          Done
        </Badge>
      )
    case 'error':
      return (
        <Badge variant="destructive" className="gap-1 font-normal">
          <AlertCircle className="h-3 w-3" />
          Error
        </Badge>
      )
  }
}

// ---------------------------------------------------------------------------
// Generic progress row — used by output modes without a ClipCandidate (e.g.
// the long-form 16:9 pipeline, which renders a single whole-video job).
// ---------------------------------------------------------------------------

/** Error summary + suggested action + raw-output "details" expander (RF-022). */
function RenderErrorDetails({ progress }: { progress: RowProgress }): React.JSX.Element | null {
  if (progress.status !== 'error' || !progress.error) return null
  return (
    <div className="mt-1.5">
      <p
        className="text-destructive line-clamp-2 text-xs font-medium"
        title={progress.error}
      >
        {progress.error}
      </p>
      {progress.suggestion && (
        <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
          {progress.suggestion}
        </p>
      )}
      {progress.details && progress.details !== progress.error && (
        <details className="group mt-1">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none text-xs underline-offset-2 group-open:underline">
            Details
          </summary>
          <pre className="text-muted-foreground bg-muted/40 mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded p-2 text-[11px] leading-snug">
            {progress.details}
          </pre>
        </details>
      )}
    </div>
  )
}

function GenericRow({
  label,
  progress,
  poster,
}: {
  label: string
  progress: RowProgress
  /** Optional poster frame (e.g. the long-form source thumbnail). */
  poster?: string
}): React.JSX.Element {
  const isActive = progress.status === 'rendering' || progress.status === 'preparing'
  const isDone = progress.status === 'done'
  const isError = progress.status === 'error'
  const showBar = isActive || isDone
  const barValue = isDone ? 100 : Math.max(0, Math.min(100, progress.percent))

  return (
    <Card className="flex items-center gap-3 p-3">
      <div className="bg-muted text-muted-foreground flex h-16 w-9 shrink-0 items-center justify-center overflow-hidden rounded">
        {poster ? (
          <img src={poster} alt="" draggable={false} className="h-full w-full object-cover" />
        ) : (
          <FileVideo className="h-4 w-4 opacity-60" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn('line-clamp-2 text-sm font-medium leading-snug', isError && 'text-destructive')}
            title={label}
          >
            {label}
          </p>
          <StatusBadge status={progress.status} />
        </div>
        {showBar && (
          <Progress
            value={barValue}
            className={cn('mt-2 h-1.5', isError && '[&>div]:bg-destructive')}
          />
        )}
        {progress.status === 'preparing' && progress.prepareMessage && (
          <p className="text-muted-foreground mt-1.5 line-clamp-1 text-xs" title={progress.prepareMessage}>
            {progress.prepareMessage}
          </p>
        )}
        <RenderErrorDetails progress={progress} />
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Single clip row
// ---------------------------------------------------------------------------

interface ClipRowProps {
  clip: ClipCandidate
  progress: RowProgress
}

function ClipRow({ clip, progress }: ClipRowProps): React.JSX.Element {
  const thumb = pickThumbnail(clip)
  const isActive = progress.status === 'rendering' || progress.status === 'preparing'
  const isDone = progress.status === 'done'
  const isError = progress.status === 'error'
  const showBar = isActive || isDone
  const barValue = isDone ? 100 : Math.max(0, Math.min(100, progress.percent))

  return (
    <Card className="flex items-center gap-3 p-3">
      {/* Thumbnail — small 9:16 tile */}
      <div className="bg-muted relative h-16 w-9 shrink-0 overflow-hidden rounded">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center">
            <Play className="h-3.5 w-3.5 opacity-50" />
          </div>
        )}
      </div>

      {/* Hook text + status + progress */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn(
              'line-clamp-2 text-sm font-medium leading-snug',
              isError && 'text-destructive'
            )}
            title={clip.hookText || undefined}
          >
            {clip.hookText || (
              <span className="text-muted-foreground italic">Untitled clip</span>
            )}
          </p>
          <StatusBadge status={progress.status} />
        </div>

        {showBar && (
          <Progress
            value={barValue}
            className={cn('mt-2 h-1.5', isError && '[&>div]:bg-destructive')}
          />
        )}

        {progress.status === 'preparing' && progress.prepareMessage && (
          <p
            className="text-muted-foreground mt-1.5 line-clamp-1 text-xs"
            title={progress.prepareMessage}
          >
            {progress.prepareMessage}
          </p>
        )}

        <RenderErrorDetails progress={progress} />

        {isDone && progress.outputPath && (
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1.5 px-2 text-xs"
              onClick={() => revealInFolder(progress.outputPath as string)}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Reveal in Finder
            </Button>
            <p
              className="text-muted-foreground min-w-0 truncate text-xs"
              title={progress.outputPath}
            >
              {basename(progress.outputPath)}
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Long-form re-render setup — shown when a restored long-form project (saved
// Gemini edit plan, no short-form clips) is opened. Lets the user change the
// skin/palette, then render straight from the persisted plan (no AI re-run).
// ---------------------------------------------------------------------------

function LongformSetup({
  record,
  source,
  disabled,
}: {
  record: LongformPlanRecord
  source: SourceVideo | null
  disabled: boolean
}): React.JSX.Element {
  const phrases = record.plan.phrases.length
  const blocks = record.plan.blocks.length
  return (
    <div className="space-y-4">
      <Card className="flex items-start gap-3 p-4">
        <div className="bg-muted text-muted-foreground flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded">
          {source?.thumbnail ? (
            <img src={source.thumbnail} alt="" draggable={false} className="h-full w-full object-cover" />
          ) : (
            <FileVideo className="h-4 w-4 opacity-60" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-foreground text-sm font-medium leading-snug">
            {source ? `Long-form edit · ${source.name}` : 'Long-form edit (16:9)'}
          </p>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Saved edit plan · {phrases} phrase{phrases === 1 ? '' : 's'}, {blocks} block
            {blocks === 1 ? '' : 's'}. Renders straight from the saved plan — no transcription or
            AI re-analysis.
          </p>
        </div>
      </Card>
      <Card className="p-4">
        <PalettePicker disabled={disabled} />
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RenderScreen
// ---------------------------------------------------------------------------

export function RenderScreen(): React.JSX.Element {
  // ── Store reads ────────────────────────────────────────────────────────
  const activeSourceId = useStore((s) => s.activeSourceId)
  const clipsBySource = useStore((s) => s.clips)
  const longformPlans = useStore((s) => s.longformPlans)
  const getLongformPlan = useStore((s) => s.getLongformPlan)
  const sources = useStore((s) => s.sources)
  const renderProgress = useStore((s) => s.renderProgress)
  const renderErrors = useStore((s) => s.renderErrors)
  const isRendering = useStore((s) => s.isRendering)
  const outputDirectory = useStore((s) => s.settings.outputDirectory)

  // ── Store writes ───────────────────────────────────────────────────────
  const setRenderProgress = useStore((s) => s.setRenderProgress)
  const setIsRendering = useStore((s) => s.setIsRendering)
  const setRenderError = useStore((s) => s.setRenderError)
  const clearRenderErrors = useStore((s) => s.clearRenderErrors)
  const setPipeline = useStore((s) => s.setPipeline)
  const setActiveSource = useStore((s) => s.setActiveSource)
  const addError = useStore((s) => s.addError)

  // ── Local state ────────────────────────────────────────────────────────
  // Tracks whether the most recent batch has finished — controls the
  // post-render footer (Open Folder / Back to Clips).
  const [batchSummary, setBatchSummary] = useState<{
    completed: number
    failed: number
    total: number
    manifestCsvPath?: string
  } | null>(null)

  // Active source metadata — drives the long-form row label + poster frame.
  const activeSource = useMemo(
    () => sources.find((s) => s.id === activeSourceId) ?? null,
    [sources, activeSourceId]
  )

  // Persisted long-form edit plan for the active source (RF-001). A restored
  // long-form project has this but no short-form clips; we re-render straight
  // from it without re-calling Gemini. Subscribe to `longformPlans` so the
  // lookup stays reactive while still reading through the store getter.
  const longformPlanRecord = useMemo(
    () => (activeSourceId ? getLongformPlan(activeSourceId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- longformPlans drives reactivity
    [activeSourceId, longformPlans, getLongformPlan]
  )

  // Seed the palette/skin picker with the axes the plan was saved with, so a
  // reopened project shows what it was rendered with. Seed once per source so
  // we don't clobber the user's in-session changes on every re-render.
  const seededSourceRef = useRef<string | null>(null)
  useEffect(() => {
    if (!longformPlanRecord || !activeSourceId) return
    if (seededSourceRef.current === activeSourceId) return
    seededSourceRef.current = activeSourceId
    const store = useStore.getState()
    store.setLongformSkin(longformPlanRecord.skin)
    store.setLongformPaletteId(longformPlanRecord.paletteId)
  }, [activeSourceId, longformPlanRecord])

  // ── Derived: approved clips for the active source ──────────────────────
  const approvedClips = useMemo<ClipCandidate[]>(() => {
    if (!activeSourceId) return []
    const list = clipsBySource[activeSourceId] ?? []
    return list.filter((c) => c.status === 'approved')
  }, [activeSourceId, clipsBySource])

  // Merge store renderProgress + renderErrors into a stable per-row view.
  const progressMap = useMemo(() => {
    const merged: RenderProgress[] = renderProgress.map((r) => ({
      ...r,
      error: r.error ?? renderErrors[r.clipId]
    }))
    return buildProgressMap(approvedClips, merged)
  }, [approvedClips, renderProgress, renderErrors])

  // ── Subscribe to render:* events ───────────────────────────────────────
  useEffect(() => {
    // Snapshot the current renderProgress array on each event via the store
    // getState — avoids a stale-closure dependency on a reactive `state` ref.
    const upsertProgress = (
      clipId: string,
      patch: Partial<RenderProgress>
    ): void => {
      const current = useStore.getState().renderProgress
      const idx = current.findIndex((r) => r.clipId === clipId)
      if (idx === -1) {
        const next: RenderProgress = {
          clipId,
          percent: patch.percent ?? 0,
          status: patch.status ?? 'queued',
          error: patch.error,
          suggestion: patch.suggestion,
          details: patch.details,
          outputPath: patch.outputPath,
          prepareMessage: patch.prepareMessage
        }
        setRenderProgress([...current, next])
      } else {
        const next = current.slice()
        next[idx] = { ...next[idx], ...patch }
        setRenderProgress(next)
      }
    }

    const offPrepare = window.api.onRenderClipPrepare((data) => {
      // Prep runs before the encode begins. Don't downgrade a row that has
      // already moved on to 'rendering'/'done' (events can race on retry).
      const current = useStore.getState().renderProgress
      const row = current.find((r) => r.clipId === data.clipId)
      if (row && (row.status === 'rendering' || row.status === 'done')) return
      upsertProgress(data.clipId, {
        status: 'preparing',
        percent: Math.max(0, Math.min(100, data.percent)),
        prepareMessage: data.message,
      })
    })

    const offStart = window.api.onRenderClipStart((data) => {
      // Note: a stale prepareMessage may remain on the row, but the UI only
      // renders it while status === 'preparing', so it's harmless once we
      // flip to 'rendering'.
      upsertProgress(data.clipId, { status: 'rendering', percent: 0 })
    })

    const offProgress = window.api.onRenderClipProgress((data) => {
      upsertProgress(data.clipId, {
        status: 'rendering',
        percent: Math.max(0, Math.min(100, data.percent))
      })
    })

    const offDone = window.api.onRenderClipDone((data) => {
      upsertProgress(data.clipId, {
        status: 'done',
        percent: 100,
        outputPath: data.outputPath
      })
    })

    const offError = window.api.onRenderClipError((data) => {
      setRenderError(data.clipId, data.error)
      upsertProgress(data.clipId, {
        status: 'error',
        error: data.error,
        suggestion: data.suggestion,
        details: data.details,
      })
      // Mirror render failures into the global error log so the bottom
      // <ErrorLog> panel reflects everything the main process reports. Include
      // the suggested action; keep the raw engine output (details) in the log
      // too so the developer-facing panel stays complete.
      addError({
        source: 'render',
        message: [
          `Clip ${data.clipId} failed: ${data.error}`,
          data.suggestion ? `Try: ${data.suggestion}` : '',
          data.details && data.details !== data.error ? data.details : '',
        ]
          .filter(Boolean)
          .join('\n'),
      })
    })

    const offBatchDone = window.api.onRenderBatchDone((data) => {
      setIsRendering(false)
      setPipeline({ stage: 'done', message: '', percent: 100 })
      setBatchSummary(data)
      if (data.failed === 0) {
        toast.success(`Rendered ${data.completed}/${data.total} clip${data.total === 1 ? '' : 's'}`)
      } else {
        toast.error(`${data.failed} of ${data.total} clip${data.total === 1 ? '' : 's'} failed`)
      }
    })

    const offCancelled = window.api.onRenderCancelled((data) => {
      setIsRendering(false)
      setPipeline({ stage: 'ready', message: '', percent: 0 })
      setBatchSummary(data)
      toast.message('Render cancelled')
    })

    return () => {
      offPrepare()
      offStart()
      offProgress()
      offDone()
      offError()
      offBatchDone()
      offCancelled()
    }
  }, [setRenderProgress, setRenderError, setIsRendering, setPipeline, addError])

  // ── Action: Render All ────────────────────────────────────────────────
  // Delegates to the shared render-service so the ClipGrid "Render Approved"
  // button and this "Render All" button stay in lockstep.
  const handleRenderAll = async (): Promise<void> => {
    setBatchSummary(null)
    await startApprovedRender()
  }

  // ── Action: Render long-form from the saved plan (RF-001) ─────────────
  // Re-runs the persisted Gemini edit plan via startBatchRender — no
  // transcription, no Gemini re-call. Uses the skin/palette currently picked
  // (seeded from the saved record, editable via PalettePicker above).
  const handleLongformRender = async (): Promise<void> => {
    if (!activeSource || !activeSourceId) return
    const state = useStore.getState()
    const record = state.getLongformPlan(activeSourceId)
    if (!record) {
      toast.error('No saved edit plan to render')
      return
    }

    // Zero-config floor — fall back to the app default output dir if unset.
    let outputDirectory = state.settings.outputDirectory
    if (!outputDirectory) {
      outputDirectory = (await window.api.getDefaultOutputDirectory().catch(() => null)) ?? null
      if (!outputDirectory) {
        toast.error('Couldn’t resolve a default output directory')
        return
      }
      const resolved = outputDirectory
      useStore.setState((s) => {
        s.settings.outputDirectory = resolved
      })
    }

    setBatchSummary(null)
    clearRenderErrors()
    setRenderProgress([{ clipId: activeSourceId, percent: 0, status: 'queued' }])
    setIsRendering(true)
    setPipeline({ stage: 'rendering', message: '', percent: 0 })

    try {
      await window.api.startBatchRender({
        outputDirectory,
        outputProfile: 'longform',
        // The persisted plan is the shared canonical shape; the preload mirror
        // is structurally identical, so bridge it across the IPC boundary.
        longformEditPlan: record.plan as unknown as NonNullable<
          Parameters<typeof window.api.startBatchRender>[0]['longformEditPlan']
        >,
        longformSkinId: state.settings.longformSkin,
        longformPaletteId: state.settings.longformPaletteId,
        customPalettes: state.settings.customPalettes ?? LONGFORM_RENDER_DEFAULTS.customPalettes,
        renderQuality: state.settings.renderQuality,
        developerMode: state.settings.developerMode,
        // Forwarded for in-render asset generation (e.g. pop-up cards); the plan
        // already exists, so no plan/transcription work is re-triggered.
        geminiApiKey: state.settings.geminiApiKey,
        sourceMeta: {
          name: activeSource.name,
          path: activeSource.path,
          duration: activeSource.duration,
        },
        jobs: [
          {
            clipId: activeSourceId,
            sourceVideoPath: activeSource.path,
            startTime: 0,
            endTime: activeSource.duration,
          },
        ],
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setIsRendering(false)
      setPipeline({ stage: 'error', message: msg, percent: 0 })
      toast.error(`Couldn't start render: ${msg}`)
      addError({ source: 'render', message: `Couldn't start render: ${msg}` })
    }
  }

  // ── Action: Render long-form again ────────────────────────────
  // Clears the finished batch so the LongformSetup surface (PalettePicker)
  // reappears, letting the user change skin/palette before another render.
  const handleLongformReset = (): void => {
    setBatchSummary(null)
    setRenderProgress([])
    clearRenderErrors()
    setPipeline({ stage: 'ready', message: '', percent: 0 })
  }

  // ── Action: Retry Failed ──────────────────────────────────────────────
  // Re-runs only the clips whose renderProgress status is 'error', so a
  // partial failure doesn't force a full re-encode of the successful clips.
  const handleRetryFailed = async (): Promise<void> => {
    const failedIds = useStore
      .getState()
      .renderProgress.filter((r) => r.status === 'error')
      .map((r) => r.clipId)
    if (failedIds.length === 0) return
    setBatchSummary(null)
    await startApprovedRender({ clipIds: failedIds })
  }

  // ── Action: Cancel ────────────────────────────────────────────────────
  const handleCancel = async (): Promise<void> => {
    try {
      await window.api.cancelRender()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Couldn't cancel: ${msg}`)
    }
  }

  // ── Action: Open Output Folder ────────────────────────────────────────
  const handleOpenFolder = async (): Promise<void> => {
    try {
      const result = await window.api.openOutputFolder(outputDirectory ?? undefined)
      // shell.openPath returns '' on success and an error string on failure.
      if (result) toast.error(`Couldn't open folder: ${result}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Couldn't open folder: ${msg}`)
    }
  }

  // ── Action: Open manifest.csv ────────────────────────────────
  // Opens the exported caption/hashtag sheet in the OS default app.
  const handleOpenCsv = async (): Promise<void> => {
    const csvPath = batchSummary?.manifestCsvPath
    if (!csvPath) return
    try {
      const result = await window.api.openPath(csvPath)
      // shell.openPath returns '' on success and an error string on failure.
      if (result) toast.error(`Couldn't open CSV: ${result}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Couldn't open CSV: ${msg}`)
    }
  }

  // ── Action: Back to Clips ─────────────────────────────────────────────
  const handleBackToClips = (): void => {
    setBatchSummary(null)
    setRenderProgress([])
    clearRenderErrors()
    setPipeline({ stage: 'ready', message: '', percent: 0 })
  }

  // ── Action: New video (long-form) ─────────────────────────────────────
  // Long-form has no clip grid to return to, so "Back to Clips" would strand
  // the user on ClipGrid's empty state. Reset to a clean slate → DropScreen.
  const handleNewVideo = (): void => {
    setBatchSummary(null)
    setRenderProgress([])
    clearRenderErrors()
    setActiveSource(null)
    setPipeline({ stage: 'idle', message: '', percent: 0 })
  }

  // ── Render ────────────────────────────────────────────────────────────
  const isComplete = batchSummary !== null && !isRendering
  // A restored long-form project (RF-001): persisted Gemini edit plan, no
  // short-form clips. Before a render is kicked off it shows the skin/palette
  // setup surface; afterwards it shares the long-form progress rows below.
  const showLongformSetup =
    longformPlanRecord !== null &&
    approvedClips.length === 0 &&
    renderProgress.length === 0 &&
    !isComplete
  // Long-form (16:9) renders a single whole-video job with no ClipCandidates,
  // so fall back to the live render-progress rows for the count + labels.
  const isLongform =
    approvedClips.length === 0 && (renderProgress.length > 0 || longformPlanRecord !== null)
  const totalCount = showLongformSetup
    ? 1
    : isLongform
      ? renderProgress.length
      : approvedClips.length
  const doneCount = renderProgress.filter((r) => r.status === 'done').length
  const failedCount = renderProgress.filter((r) => r.status === 'error').length
  const itemNoun = isLongform ? 'video' : 'clip'

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-6 py-6">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-foreground text-base font-semibold tracking-tight">
            Render
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
            {totalCount} {itemNoun}{totalCount === 1 ? '' : 's'}
            {isRendering && ` · ${doneCount} done`}
            {isRendering && failedCount > 0 && ` · ${failedCount} failed`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isLongform ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewVideo}
              disabled={isRendering}
              title={isRendering ? 'Cancel the render first' : 'Start a new video'}
            >
              <Plus />
              New video
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToClips}
              disabled={isRendering}
              title={isRendering ? 'Cancel the render first' : 'Back to clips'}
            >
              <ArrowLeft />
              Back to Clips
            </Button>
          )}
          {!isRendering && !showLongformSetup && <TemplateEditor />}
          {isRendering ? (
            <Button variant="destructive" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          ) : showLongformSetup ? (
            <Button size="sm" onClick={handleLongformRender} disabled={!activeSource}>
              <Play />
              Render
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleRenderAll}
              disabled={isComplete || totalCount === 0}
            >
              <Play />
              Render All
            </Button>
          )}
        </div>
      </div>

      {/* ── Inline batch error — surfaces the most recent failure even
           when the bottom <ErrorLog> is collapsed. ───────────────────── */}
      {failedCount > 0 && (
        <Alert variant="destructive" className="mb-3">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {failedCount} clip{failedCount === 1 ? '' : 's'} failed to render
          </AlertTitle>
          <AlertDescription className="break-words">
            See the error log at the bottom of the window for details.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Clip list ───────────────────────────────────────────────── */}
      <div className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1">
        {showLongformSetup && longformPlanRecord ? (
          // Restored long-form project (RF-001) — pick skin/palette, then render
          // straight from the saved plan (no Gemini re-call).
          <LongformSetup
            record={longformPlanRecord}
            source={activeSource}
            disabled={isRendering}
          />
        ) : approvedClips.length === 0 && renderProgress.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center p-6">
            <Card className="flex w-full max-w-sm flex-col items-center gap-3 px-6 py-10 text-center">
              <FileVideo
                className="text-muted-foreground h-10 w-10"
                strokeWidth={1.5}
                aria-hidden
              />
              <p className="text-foreground text-sm font-medium">
                No approved clips
              </p>
              <p className="text-muted-foreground text-xs">
                Approve clips on the previous screen, then come back to render.
              </p>
            </Card>
          </div>
        ) : approvedClips.length === 0 ? (
          // Output modes without ClipCandidates (long-form 16:9) — render the
          // raw progress rows reported by the render:* events.
          renderProgress.map((r) => (
            <GenericRow
              key={r.clipId}
              label={activeSource ? `Long-form edit · ${activeSource.name}` : 'Long-form edit (16:9)'}
              poster={activeSource?.thumbnail}
              progress={{
                status: r.status,
                percent: r.percent,
                error: r.error ?? renderErrors[r.clipId],
                suggestion: r.suggestion,
                details: r.details,
              }}
            />
          ))
        ) : (
          approvedClips.map((clip) => {
            const p = progressMap.get(clip.id) ?? { status: 'queued' as const, percent: 0 }
            return <ClipRow key={clip.id} clip={clip} progress={p} />
          })
        )}
      </div>

      {/* ── Post-batch footer ──────────────────────────────────────── */}
      {isComplete && (
        <div className="mt-4 shrink-0 space-y-3 border-t pt-4">
          {/* Manifest note — tells the user the caption/hashtag sheet exists
              and lets them open it in one click. */}
          {batchSummary?.manifestCsvPath && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
                <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  Captions &amp; hashtags exported to{' '}
                  <span className="text-foreground">manifest.csv</span>
                </span>
              </p>
              <Button size="sm" variant="outline" onClick={handleOpenCsv}>
                <FileSpreadsheet />
                Open CSV
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            {outputDirectory ? (
              <p className="text-muted-foreground min-w-0 truncate text-xs" title={outputDirectory}>
                Saved to <span className="text-foreground">{outputDirectory}</span>
              </p>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              {longformPlanRecord ? (
                // Long-form re-render (RF-001): "Render again" returns to the
                // skin/palette setup so the user can tweak axes, then render
                // straight from the saved plan again (no Gemini re-call).
                <Button size="sm" variant="outline" onClick={handleLongformReset}>
                  <RotateCcw />
                  Render again
                </Button>
              ) : (
                failedCount > 0 && (
                  <Button size="sm" variant="outline" onClick={handleRetryFailed}>
                    <RotateCcw />
                    Retry Failed ({failedCount})
                  </Button>
                )
              )}
              <Button size="sm" onClick={handleOpenFolder} disabled={!outputDirectory}>
                <Folder />
                Open Output Folder
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
