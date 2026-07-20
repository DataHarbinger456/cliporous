import { createStructuredError } from '@shared/errors';
import { useCallback, useRef } from 'react';
import { buildCommittedCreativeGuidance } from '@/services/creative-brief';
import { buildCreatorProfileGuidance } from '@/services/creator-profiles';
import { MISSING_GEMINI_KEY_MESSAGE, resolveGeminiKey } from '../lib/gemini-key';
import type { PipelineStage, SourceVideo } from '../store';
import { useStore } from '../store';
import {
  clipMappingStage,
  downloadStage,
  faceDetectionStage,
  loopOptimizationStage,
  notificationStage,
  segmentingStage,
  stitchedFaceDetectionPass,
  stitchedSegmentingPass,
  stitchedThumbnailPass,
  stitchingStage,
  thumbnailStage,
  transcriptionStage,
} from './pipeline-stages';
import type { PipelineContext } from './pipeline-stages/types';

/** Ordered list of pipeline stages used to determine skip logic. */
const PIPELINE_STAGE_ORDER: PipelineStage[] = [
  'downloading',
  'transcribing',
  'scoring',
  'stitching',
  'optimizing-loops',
  'detecting-faces',
  'ai-editing',
  'segmenting',
];

interface ActiveProcessingRun {
  runId: symbol;
  cancel: () => void;
  settled: Promise<void>;
}

let activeProcessingRun: ActiveProcessingRun | null = null;

/** Register any short- or long-form processing chain with the shared cancel path. */
export function trackActiveProcessingRun(cancel: () => void): () => void {
  const runId = Symbol('processing-run');
  let resolveRun!: () => void;
  const settled = new Promise<void>((resolve) => {
    resolveRun = resolve;
  });
  activeProcessingRun = { runId, cancel, settled };
  return () => {
    resolveRun();
    if (activeProcessingRun?.runId === runId) activeProcessingRun = null;
  };
}

/** Request cancellation and wait until child processes and the async chain settle. */
export async function cancelActiveProcessingAndWait(): Promise<void> {
  const run = activeProcessingRun;
  run?.cancel();
  await Promise.all([window.api.cancelPython(), window.api.cancelRender()]);
  if (run) {
    let timeoutId: number | null = null;
    try {
      await Promise.race([
        run.settled,
        new Promise<never>((_resolve, reject) => {
          timeoutId = window.setTimeout(() => {
            reject(new Error('Processing did not confirm cancellation within 25 seconds.'));
          }, 25_000);
        }),
      ]);
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    }
  }
}

/** Stop the active chain without deleting the source or any completed artifact. */
export async function stopActiveProcessingAndKeepProgress(): Promise<boolean> {
  const state = useStore.getState();
  if (state.processingCancellation.status === 'cancelling') return false;
  const activeStage = state.pipeline.stage;
  state.setProcessingCancellation({ status: 'cancelling', error: null });
  try {
    await cancelActiveProcessingAndWait();
    if (PIPELINE_STAGE_ORDER.includes(activeStage)) {
      const message = 'Stopped safely. Resume from the last completed stage when you are ready.';
      const current = useStore.getState();
      current.setFailedPipelineStage(activeStage);
      current.pauseProcessingJob(activeStage, message);
      current.setPipeline({ stage: 'error', message, percent: current.pipeline.percent });
    }
    useStore.getState().setProcessingCancellation({ status: 'idle', error: null });
    return true;
  } catch (caught) {
    const current = useStore.getState();
    const error = createStructuredError({
      source: 'pipeline',
      error: caught,
      headline: "BatchClip couldn't stop processing yet",
      whatHappened: 'The current content operation is still running.',
      whatIsSafe: 'Completed clips and cached transcription have been kept.',
      whatToDoNext: 'Try stopping again. Keep BatchClip open until processing stops.',
      failedStage: activeStage,
      recoveryAction: 'retry',
      retryable: true,
    });
    current.addError(error);
    current.setProcessingCancellation({ status: 'failed', error });
    return false;
  }
}

export function usePipeline(): {
  processVideo: (source: SourceVideo, resumeFrom?: PipelineStage) => Promise<void>;
  cancelProcessing: () => Promise<boolean>;
  isProcessing: () => boolean;
} {
  const setPipeline = useStore((s) => s.setPipeline);
  const setTranscription = useStore((s) => s.setTranscription);
  const setClips = useStore((s) => s.setClips);
  const updateClipCrop = useStore((s) => s.updateClipCrop);
  const updateClipLoop = useStore((s) => s.updateClipLoop);
  const updateClipTrim = useStore((s) => s.updateClipTrim);
  const updateClipThumbnail = useStore((s) => s.updateClipThumbnail);
  const addError = useStore((s) => s.addError);
  const setClipPartInfo = useStore((s) => s.setClipPartInfo);
  const setClipSegments = useStore((s) => s.setClipSegments);
  const setStitchedClips = useStore((s) => s.setStitchedClips);
  const setStitchedClipSegments = useStore((s) => s.setStitchedClipSegments);
  const updateStitchedClipThumbnail = useStore((s) => s.updateStitchedClipThumbnail);
  const setStitchedClipFaceCrops = useStore((s) => s.setStitchedClipFaceCrops);
  const markStageCompleted = useStore((s) => s.markStageCompleted);
  const setFailedPipelineStage = useStore((s) => s.setFailedPipelineStage);
  const setCachedSourcePath = useStore((s) => s.setCachedSourcePath);
  const clearPipelineCache = useStore((s) => s.clearPipelineCache);
  const setProcessingCancellation = useStore((s) => s.setProcessingCancellation);
  const startProcessingJob = useStore((s) => s.startProcessingJob);
  const resumeProcessingJob = useStore((s) => s.resumeProcessingJob);

  const cancelledRef = useRef(false);

  const cancelProcessing = useCallback(
    async (): Promise<boolean> => stopActiveProcessingAndKeepProgress(),
    [],
  );

  const processVideo = useCallback(
    async (source: SourceVideo, resumeFrom?: PipelineStage): Promise<void> => {
      cancelledRef.current = false;
      setProcessingCancellation({ status: 'idle', error: null });
      const finishTrackedRun = trackActiveProcessingRun(() => {
        cancelledRef.current = true;
      });

      // Track the last active stage so we know which stage failed
      let currentStage: PipelineStage = 'idle';

      try {
        console.log('[usePipeline] processVideo START', { sourceId: source.id, resumeFrom });
        if (!resumeFrom) {
          clearPipelineCache();
          startProcessingJob(source);
        } else {
          const currentJobId = useStore.getState().currentProcessingJobId;
          if (currentJobId) resumeProcessingJob(currentJobId);
          else startProcessingJob(source);
        }

        const shouldSkip = (stage: PipelineStage): boolean => {
          if (!resumeFrom) return false;
          const resumeIdx = PIPELINE_STAGE_ORDER.indexOf(resumeFrom);
          const stageIdx = PIPELINE_STAGE_ORDER.indexOf(stage);
          return stageIdx < resumeIdx;
        };

        const check = (): void => {
          if (cancelledRef.current) throw new Error('Processing cancelled');
        };

        const latestState = useStore.getState();
        const promoMode = latestState.processingConfig.promoMode;

        // Promo Mode can process local scripted recordings without a network or
        // Gemini key because spoken markers replace AI scoring.
        if (!navigator.onLine && !(promoMode && source.origin === 'file')) {
          const msg = 'No internet connection. AI scoring requires an internet connection.';
          setPipeline({ stage: 'error', message: msg, percent: 0 });
          addError({ source: 'pipeline', message: msg, failedStage: 'scoring' });
          return;
        }

        // Fail before a long download/transcription when AI scoring needs a key.
        // Promo Mode intentionally bypasses this gate.
        const preflightKey = promoMode
          ? latestState.settings.geminiApiKey
          : await resolveGeminiKey(latestState.settings.geminiApiKey);
        check();
        if (!promoMode && !preflightKey) {
          currentStage = 'scoring';
          setFailedPipelineStage('scoring');
          setPipeline({ stage: 'error', message: MISSING_GEMINI_KEY_MESSAGE, percent: 0 });
          addError({
            source: 'pipeline',
            message: MISSING_GEMINI_KEY_MESSAGE,
            failedStage: 'scoring',
          });
          return;
        }

        // Intentionally reading latest state at execution time — settings and
        // processingConfig are read imperatively via getState() so the callback
        // doesn't need them in its dependency array.  This avoids unnecessary
        // re-creation of processVideo on every settings keystroke while ensuring
        // we always use the values that were current when the user clicked "Run".
        const currentState = useStore.getState();

        const ctx: PipelineContext = {
          source,
          check,
          setPipeline,
          addError,
          markStageCompleted,
          shouldSkip,
          getState: () => useStore.getState(),
          store: {
            setTranscription,
            setClips,
            updateClipCrop,
            updateClipLoop,
            updateClipTrim,
            updateClipThumbnail,
            setClipPartInfo,
            setCachedSourcePath,
            setClipSegments,
            setStitchedClips,
            setStitchedClipSegments,
            updateStitchedClipThumbnail,
            setStitchedClipFaceCrops,
          },
          geminiApiKey: currentState.settings.geminiApiKey,
          processingConfig: {
            targetDuration: currentState.processingConfig.targetDuration,
            minScore: currentState.settings.minScore,
            enablePerfectLoop: currentState.processingConfig.enablePerfectLoop,
            clipEndMode: currentState.processingConfig.clipEndMode,
            enableMultiPart: currentState.processingConfig.enableMultiPart,
            enableAiEdit: currentState.processingConfig.enableAiEdit,
            targetAudience: buildCommittedCreativeGuidance(
              currentState.creativeBrief,
              buildCreatorProfileGuidance(currentState.creatorProfile) ||
                currentState.processingConfig.targetAudience,
            ),
            promoMode: currentState.processingConfig.promoMode,
          },
        };

        // ── Step 1: Download (YouTube only) ──────────────────────────
        currentStage = 'downloading';
        const { sourcePath } = await downloadStage(ctx);

        // ── Step 2: Transcribe ───────────────────────────────────────
        currentStage = 'transcribing';
        const transcription = await transcriptionStage(ctx, sourcePath);

        // ── Step 3: Score + map to clips ─────────────────────────────
        currentStage = 'scoring';
        let clips = await clipMappingStage(ctx, transcription);

        // ── Step 3.1: Generate thumbnails ────────────────────────────
        await thumbnailStage(ctx, sourcePath, clips);

        // ── Step 3.5: Stitched clip generation (additive, never fatal) ──
        currentStage = 'stitching';
        const stitchedClips = await stitchingStage(ctx, transcription, clips);
        await stitchedThumbnailPass(ctx, sourcePath, stitchedClips);

        // ── Step 3.6: Clip boundary optimization ─────────────────────
        // Loop optimization is intentionally NOT applied to stitched clips —
        // every range was already curated by Gemini for cohesion.
        currentStage = 'optimizing-loops';
        clips = await loopOptimizationStage(ctx, transcription, clips);
        markStageCompleted('optimizing-loops');

        // ── Step 4: Face detection ───────────────────────────────────
        currentStage = 'detecting-faces';
        await faceDetectionStage(ctx, sourcePath, clips);
        await stitchedFaceDetectionPass(ctx, sourcePath, stitchedClips);
        markStageCompleted('detecting-faces');

        // ── Step 5: Segment & style ──────────────────────────────────
        currentStage = 'segmenting';
        await segmentingStage(ctx, clips);
        await stitchedSegmentingPass(ctx, stitchedClips);
        markStageCompleted('segmenting');

        // ── Done ─────────────────────────────────────────────────────
        notificationStage(ctx, clips);

        // Pipeline succeeded — clear the failed stage
        clearPipelineCache();
      } catch (err) {
        if (cancelledRef.current) return;
        const message = err instanceof Error ? err.message : String(err);
        if (currentStage !== 'idle') {
          setFailedPipelineStage(currentStage);
        }
        setPipeline({ stage: 'error', message, percent: 0 });
        addError({ source: 'pipeline', message, error: err, failedStage: currentStage });
      } finally {
        finishTrackedRun();
      }
    },
    // Only stable Zustand action references are listed here.  Reactive values
    // like settings and processingConfig are intentionally omitted — they are
    // read imperatively via useStore.getState() at the start of each run so the
    // callback always sees the latest values without re-creating on every edit.
    [
      setPipeline,
      setTranscription,
      setClips,
      updateClipCrop,
      updateClipLoop,
      updateClipTrim,
      updateClipThumbnail,
      addError,
      setClipPartInfo,
      setClipSegments,
      markStageCompleted,
      setFailedPipelineStage,
      setCachedSourcePath,
      clearPipelineCache,
      setStitchedClips,
      setStitchedClipSegments,
      updateStitchedClipThumbnail,
      setStitchedClipFaceCrops,
      setProcessingCancellation,
      startProcessingJob,
      resumeProcessingJob,
    ],
  );

  const isProcessing = useCallback((): boolean => {
    const stage = useStore.getState().pipeline.stage;
    return (
      stage === 'downloading' ||
      stage === 'transcribing' ||
      stage === 'scoring' ||
      stage === 'stitching' ||
      stage === 'optimizing-loops' ||
      stage === 'detecting-faces' ||
      stage === 'ai-editing' ||
      stage === 'segmenting'
    );
  }, []);

  return { processVideo, cancelProcessing, isProcessing };
}
