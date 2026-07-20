import type { LongformEditPlan } from '@shared/types';
import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { MISSING_GEMINI_KEY_MESSAGE, resolveGeminiKey } from '../lib/gemini-key';
import { LONGFORM_RENDER_DEFAULTS } from '../services/render-defaults';
import type { SourceVideo } from '../store';
import { useStore } from '../store';
import { cancelActiveProcessingAndWait, trackActiveProcessingRun } from './usePipeline';

/**
 * useLongformPipeline — drives the Hormozi long-form (16:9) flow end-to-end:
 *
 *   1. resolve source path (local pass-through / YouTube download)
 *   2. transcribe (Python ASR sidecar)
 *   3. generate the AI long-form edit plan (Gemini)
 *   4. stop on the Cut Plan review screen before any render work begins
 *
 * Progress uses the shared pipeline stages. Reaching `ready` routes long-form
 * projects to editorial review, where the creator must explicitly approve the
 * active version before the render service can start.
 */
export function useLongformPipeline(): {
  processLongform: (source: SourceVideo) => Promise<void>;
  cancelLongform: () => Promise<void>;
} {
  const setPipeline = useStore((s) => s.setPipeline);
  const setTranscription = useStore((s) => s.setTranscription);
  const setLongformPlan = useStore((s) => s.setLongformPlan);
  const addError = useStore((s) => s.addError);
  const startProcessingJob = useStore((s) => s.startProcessingJob);
  const markStageCompleted = useStore((s) => s.markStageCompleted);

  const cancelledRef = useRef(false);

  const cancelLongform = useCallback(async (): Promise<void> => {
    await cancelActiveProcessingAndWait();
  }, []);

  const processLongform = useCallback(
    async (source: SourceVideo): Promise<void> => {
      cancelledRef.current = false;
      startProcessingJob(source);
      const finishTrackedRun = trackActiveProcessingRun(() => {
        cancelledRef.current = true;
      });

      const check = (): void => {
        if (cancelledRef.current) throw new Error('Processing cancelled');
      };

      try {
        if (!navigator.onLine) {
          const msg = 'No internet connection. Long-form editing requires Gemini access.';
          setPipeline({ stage: 'error', message: msg, percent: 0 });
          addError({ source: 'pipeline', message: msg });
          return;
        }

        const state = useStore.getState();
        const geminiApiKey = await resolveGeminiKey(state.settings.geminiApiKey);

        if (!geminiApiKey) {
          const msg = MISSING_GEMINI_KEY_MESSAGE;
          setPipeline({ stage: 'error', message: msg, percent: 0 });
          addError({ source: 'pipeline', message: msg });
          toast.error(msg);
          return;
        }

        // ── Step 1: Resolve source path ─────────────────────────────────
        setPipeline({ stage: 'downloading', message: 'Preparing source…', percent: 0 });
        let sourcePath = source.path;
        let duration = source.duration;
        if (source.origin === 'youtube' && source.youtubeUrl && !sourcePath) {
          const unsub = window.api.onYouTubeProgress(({ percent }) => {
            setPipeline({
              stage: 'downloading',
              message: `Downloading… ${Math.round(percent)}%`,
              percent: Math.round(percent),
            });
          });
          try {
            const result = await window.api.downloadYouTube(source.youtubeUrl);
            sourcePath = result.path;
            if (typeof result.duration === 'number' && result.duration > 0) {
              duration = result.duration;
            }
          } finally {
            unsub();
          }
        }
        check();
        markStageCompleted('downloading');
        if (!duration || duration <= 0) {
          try {
            const meta = await window.api.getMetadata(sourcePath);
            if (meta?.duration > 0) duration = meta.duration;
          } catch {
            /* duration backfilled from transcript below */
          }
        }

        // ── Step 2: Transcribe ──────────────────────────────────────────
        setPipeline({ stage: 'transcribing', message: 'Extracting audio…', percent: 5 });
        const stagePercents: Record<string, number> = {
          'extracting-audio': 10,
          'downloading-model': 20,
          'loading-model': 50,
          transcribing: 70,
        };
        const unsubT = window.api.onTranscribeProgress(({ stage, message, percent }) => {
          let p = stagePercents[stage] ?? 50;
          if (stage === 'downloading-model' && typeof percent === 'number') {
            p = Math.round(20 + (percent / 100) * 30);
          }
          if (stage === 'transcribing') {
            const m = message.match(/chunk\s+(\d+)\s*\/\s*(\d+)/i);
            if (m && Number(m[2]) > 0) {
              p = Math.round(70 + (Number(m[1]) / Number(m[2])) * 27);
            }
          }
          setPipeline({ stage: 'transcribing', message, percent: p });
        });
        let transcription: {
          text: string;
          words: Array<{ text: string; start: number; end: number }>;
          segments: Array<{ text: string; start: number; end: number }>;
        };
        try {
          transcription = await window.api.transcribeVideo(sourcePath);
        } finally {
          unsubT();
        }
        check();

        const formattedForAI = await window.api.formatTranscriptForAI(transcription);
        setTranscription(source.id, {
          text: transcription.text,
          words: transcription.words,
          segments: transcription.segments,
          formattedForAI,
        });
        markStageCompleted('transcribing');

        if (!duration || duration <= 0) {
          const lastWord = transcription.words[transcription.words.length - 1];
          duration = lastWord?.end ?? 0;
        }

        // ── Step 3: AI long-form edit plan ──────────────────────────────
        setPipeline({ stage: 'ai-editing', message: 'Designing the edit…', percent: 30 });
        const unsubE = window.api.onLongformEditProgress(({ window: w, total }) => {
          const p = total > 0 ? Math.round(30 + (w / total) * 30) : 30;
          setPipeline({
            stage: 'ai-editing',
            message: `Designing the edit… (window ${w}/${total})`,
            percent: p,
          });
        });
        let plan: Awaited<ReturnType<typeof window.api.generateLongformEditPlan>>;
        try {
          plan = await window.api.generateLongformEditPlan(
            geminiApiKey,
            transcription.words,
            duration,
          );
        } finally {
          unsubE();
        }
        check();

        // Persist the (expensive) plan keyed by source so a save/recovery can
        // re-render without re-calling Gemini. Store the same skin + palette
        // axes the render below uses so a restored project renders identically.
        const longformSkin = state.settings.longformSkin ?? LONGFORM_RENDER_DEFAULTS.longformSkinId;
        const longformPaletteId =
          state.settings.longformPaletteId ?? LONGFORM_RENDER_DEFAULTS.longformPaletteId;
        setLongformPlan(source.id, {
          // The IPC boundary types the result as the preload's loose mirror of
          // LongformEditPlan; the runtime payload is the full canonical shape
          // generated by the main process, so bridge it to the shared type.
          plan: plan as unknown as LongformEditPlan,
          skin: longformSkin,
          paletteId: longformPaletteId,
        });
        markStageCompleted('ai-editing');
        if (plan.blocks.length === 0 && plan.phrases.length === 0) {
          // Degenerate plan: Gemini found no structured moments. The render
          // below still proceeds (a plain speaker cut), but make that explicit
          // and distinct from a normal plan so the user doesn't think the
          // feature silently failed.
          // `cards` exists on the canonical plan but not the preload's loose
          // IPC mirror, so read it through the same bridge cast used above.
          const cardCount = (plan as unknown as LongformEditPlan).cards?.length ?? 0;
          const cardNote = cardCount > 0 ? ` (${cardCount} card${cardCount === 1 ? '' : 's'})` : '';
          toast.warning(`AI found no structured moments. The plan uses speaker video${cardNote}`);
        } else {
          toast.message(
            `Edit plan: ${plan.phrases.length} phrase${plan.phrases.length === 1 ? '' : 's'}, ` +
              `${plan.blocks.length} block${plan.blocks.length === 1 ? '' : 's'}`,
          );
        }

        // Stop before render. The persisted plan now belongs to the creator until
        // they accept, revise, regenerate, restore, or reject it.
        setPipeline({
          stage: 'ready',
          message: 'Cut Plan ready for review',
          percent: 100,
        });
      } catch (err) {
        if (cancelledRef.current) return;
        const message = err instanceof Error ? err.message : String(err);
        setPipeline({ stage: 'error', message, percent: 0 });
        const structured = addError({
          source: 'pipeline',
          message: `Long-form: ${message}`,
          failedStage: useStore.getState().pipeline.stage,
        });
        toast.error(structured.headline);
      } finally {
        finishTrackedRun();
      }
    },
    [
      setPipeline,
      setTranscription,
      setLongformPlan,
      addError,
      startProcessingJob,
      markStageCompleted,
    ],
  );

  return { processLongform, cancelLongform };
}
