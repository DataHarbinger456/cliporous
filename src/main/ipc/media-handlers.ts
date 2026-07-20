import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ch } from '@shared/ipc-channels';
import { ipcMain } from 'electron';
import { generateBRollImage } from '../broll-image-gen';
import { imageToVideoClip } from '../broll-image-overlay';
import type { WordTimestamp as BRollWordTimestamp } from '../broll-keywords';
import { extractBRollKeywords } from '../broll-keywords';
import { fetchBRollClips } from '../broll-pexels';
import type {
  BRollDisplayMode,
  BRollSettings as BRollSettingsConfig,
  BRollTransition,
} from '../broll-placement';
import { buildBRollPlacements } from '../broll-placement';
import { type CaptionStyleInput, generateCaptions, type WordInput } from '../captions';
import { detectFaceCrops } from '../face-detection';
import { wrapHandler } from '../ipc-error-handler';
import { cancelPythonProcesses } from '../python';
import {
  cancelPythonSetup,
  checkPythonSetup,
  isPythonStampedReady,
  startPythonSetup,
} from '../python-setup';
import { formatTranscriptForAI, transcribeVideo } from '../transcription';
import { downloadYouTube } from '../youtube';

function requireLocalContentTools(): void {
  if (!isPythonStampedReady()) {
    throw new Error(
      'Local content tools are not ready. Finish setup or use Repair content tools in Settings.',
    );
  }
}

export function registerMediaHandlers(): void {
  // YouTube download
  ipcMain.handle(
    Ch.Invoke.YOUTUBE_DOWNLOAD,
    wrapHandler(Ch.Invoke.YOUTUBE_DOWNLOAD, async (event, url: string) => {
      requireLocalContentTools();
      const outputDir = join(tmpdir(), 'batchcontent-yt');
      return downloadYouTube(url, outputDir, (percent) => {
        event.sender.send(Ch.Send.YOUTUBE_PROGRESS, { percent });
      });
    }),
  );

  // Transcribe video
  ipcMain.handle(
    Ch.Invoke.TRANSCRIBE_VIDEO,
    wrapHandler(Ch.Invoke.TRANSCRIBE_VIDEO, async (event, videoPath: string) => {
      requireLocalContentTools();
      return transcribeVideo(videoPath, (progress) => {
        event.sender.send(Ch.Send.TRANSCRIBE_PROGRESS, progress);
      });
    }),
  );

  // Format transcript for AI scoring
  ipcMain.handle(
    Ch.Invoke.TRANSCRIBE_FORMAT_FOR_AI,
    wrapHandler(
      Ch.Invoke.TRANSCRIBE_FORMAT_FOR_AI,
      (_event, result: Parameters<typeof formatTranscriptForAI>[0]) => {
        return formatTranscriptForAI(result);
      },
    ),
  );

  // Face detection — smart 9:16 crop regions
  ipcMain.handle(
    Ch.Invoke.FACE_DETECT_CROPS,
    wrapHandler(
      Ch.Invoke.FACE_DETECT_CROPS,
      async (event, videoPath: string, segments: { start: number; end: number }[]) => {
        requireLocalContentTools();
        return detectFaceCrops(videoPath, segments, (progress) => {
          event.sender.send(Ch.Send.FACE_PROGRESS, progress);
        });
      },
    ),
  );

  // Captions — generate .ass subtitle file
  ipcMain.handle(
    Ch.Invoke.CAPTIONS_GENERATE,
    wrapHandler(
      Ch.Invoke.CAPTIONS_GENERATE,
      async (_event, words: WordInput[], style: CaptionStyleInput, outputPath?: string) => {
        return generateCaptions(words, style, outputPath);
      },
    ),
  );

  // B-Roll — extract keywords + fetch Pexels clips + compute placement schedule
  ipcMain.handle(
    Ch.Invoke.BROLL_GENERATE_PLACEMENTS,
    wrapHandler(
      Ch.Invoke.BROLL_GENERATE_PLACEMENTS,
      async (
        _event,
        geminiApiKey: string,
        pexelsApiKey: string,
        transcriptText: string,
        wordTimestamps: BRollWordTimestamp[],
        clipStart: number,
        clipEnd: number,
        settings: {
          intervalSeconds: number;
          clipDuration: number;
          displayMode: BRollDisplayMode;
          transition: BRollTransition;
          pipSize: number;
          pipPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
        },
      ) => {
        const brollSettings: BRollSettingsConfig = {
          enabled: true,
          pexelsApiKey,
          intervalSeconds: settings.intervalSeconds,
          clipDuration: settings.clipDuration,
          displayMode: settings.displayMode,
          transition: settings.transition,
          pipSize: settings.pipSize,
          pipPosition: settings.pipPosition,
        };

        const clipDuration = clipEnd - clipStart;

        const keywords = await extractBRollKeywords(
          transcriptText,
          wordTimestamps,
          clipStart,
          clipEnd,
          geminiApiKey,
        );

        if (keywords.length === 0) {
          console.log('[B-Roll] No keywords extracted — skipping B-Roll generation');
          return [];
        }

        const uniqueKeywords = Array.from(new Set(keywords.map((k) => k.keyword)));
        const downloadedClips = await fetchBRollClips(
          uniqueKeywords,
          pexelsApiKey,
          settings.clipDuration,
        );

        if (downloadedClips.size === 0) {
          console.log('[B-Roll] No clips downloaded — skipping B-Roll generation');
          return [];
        }

        const placements = buildBRollPlacements(
          clipDuration,
          keywords,
          downloadedClips,
          brollSettings,
        );

        console.log(
          `[B-Roll] Generated ${placements.length} placement(s) for clip at ${clipStart}–${clipEnd}s`,
        );
        return placements;
      },
    ),
  );

  // B-Roll — generate a single AI image
  ipcMain.handle(
    Ch.Invoke.BROLL_GENERATE_IMAGE,
    wrapHandler(
      Ch.Invoke.BROLL_GENERATE_IMAGE,
      async (
        _event,
        geminiApiKey: string,
        keyword: string,
        transcriptContext: string,
        styleCategory: string,
        duration: number,
      ) => {
        const imageResult = await generateBRollImage(
          keyword,
          transcriptContext,
          styleCategory,
          geminiApiKey,
        );
        if (!imageResult) return null;

        // Convert static image to video clip with Ken Burns effect
        const videoPath = await imageToVideoClip(imageResult.filePath, duration);
        return {
          ...imageResult,
          videoPath,
        };
      },
    ),
  );

  // B-Roll — regenerate an AI image with new prompt/style
  ipcMain.handle(
    Ch.Invoke.BROLL_REGENERATE_IMAGE,
    wrapHandler(
      Ch.Invoke.BROLL_REGENERATE_IMAGE,
      async (
        _event,
        geminiApiKey: string,
        keyword: string,
        transcriptContext: string,
        styleCategory: string,
        duration: number,
      ) => {
        // Same as generate — the cache key will differ if keyword/context/style differ
        const imageResult = await generateBRollImage(
          keyword,
          transcriptContext,
          styleCategory,
          geminiApiKey,
        );
        if (!imageResult) return null;

        const videoPath = await imageToVideoClip(imageResult.filePath, duration);
        return {
          ...imageResult,
          videoPath,
        };
      },
    ),
  );

  // Python setup — check status
  ipcMain.handle(
    Ch.Invoke.PYTHON_GET_STATUS,
    wrapHandler(Ch.Invoke.PYTHON_GET_STATUS, () => checkPythonSetup()),
  );

  // Python setup — explicit user-started installation or repair
  ipcMain.handle(
    Ch.Invoke.PYTHON_START_SETUP,
    wrapHandler(Ch.Invoke.PYTHON_START_SETUP, (event) => startPythonSetup(event.sender)),
  );

  ipcMain.handle(
    Ch.Invoke.PYTHON_CANCEL_SETUP,
    wrapHandler(Ch.Invoke.PYTHON_CANCEL_SETUP, () => cancelPythonSetup()),
  );

  // Python cancel — SIGTERM any in-flight transcribe.py / download.py /
  // face_detect.py so a cancelled job stops pinning CPU/GPU instead of running
  // out its multi-hour timeout. Returns the number of processes signalled.
  ipcMain.handle(
    Ch.Invoke.PYTHON_CANCEL,
    wrapHandler(Ch.Invoke.PYTHON_CANCEL, () => cancelPythonProcesses()),
  );
}
