import type { MediaPathStatus } from '@shared/media';
import type { AppSettings, OutputMode, RenderProgress, RenderQualityPreset } from '@/store/types';

const RENDER_HISTORY_KEY = 'batchclip-render-history-v1';
const MAX_HISTORY_SAMPLES = 40;
const MIN_FREE_SPACE_BUFFER = 512 * 1024 * 1024;

export interface RenderHistorySample {
  encoder: string;
  hardware: boolean;
  quality: RenderQualityPreset;
  mediaSeconds: number;
  renderSeconds: number;
  completedAt: number;
}

export interface ExportEstimate {
  mediaSeconds: number;
  renderSecondsLow: number;
  renderSecondsHigh: number;
  sizeBytesLow: number;
  sizeBytesHigh: number;
  learnedFromLocalSamples: number;
}

export interface ExportPreflightIssue {
  id: string;
  severity: 'blocker' | 'warning';
  title: string;
  detail: string;
  action?: 'settings' | 'relink' | 'choose-destination';
}

export interface ExportPreflightResult {
  destination: string;
  disk: { free: number; total: number } | null;
  encoder: { encoder: string; isHardware: boolean } | null;
  media: MediaPathStatus[];
  estimate: ExportEstimate;
  resolution: '1080×1920' | '1920×1080';
  fps: 30;
  qualityLabel: string;
  clipCount: number;
  totalDurationSeconds: number;
  issues: ExportPreflightIssue[];
  checkedAt: number;
}

interface ExportPreflightInput {
  destination: string;
  sourcePaths: string[];
  queue: readonly RenderProgress[];
  settings: AppSettings;
  outputMode: OutputMode;
}

function safeHistory(): RenderHistorySample[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RENDER_HISTORY_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is RenderHistorySample => {
      if (!value || typeof value !== 'object') return false;
      const sample = value as Partial<RenderHistorySample>;
      return (
        typeof sample.encoder === 'string' &&
        typeof sample.hardware === 'boolean' &&
        typeof sample.quality === 'string' &&
        typeof sample.mediaSeconds === 'number' &&
        sample.mediaSeconds > 0 &&
        typeof sample.renderSeconds === 'number' &&
        sample.renderSeconds > 0 &&
        typeof sample.completedAt === 'number'
      );
    });
  } catch {
    return [];
  }
}

export function recordRenderHistory(sample: RenderHistorySample): void {
  try {
    const history = [sample, ...safeHistory()].slice(0, MAX_HISTORY_SAMPLES);
    localStorage.setItem(RENDER_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Estimates are optional. Storage failures must not interrupt completed media work.
  }
}

function qualitySpeedFactor(preset: RenderQualityPreset): number {
  if (preset === 'draft') return 0.7;
  if (preset === 'high') return 1.45;
  if (preset === 'custom') return 1.15;
  return 1;
}

function videoBitrateBitsPerSecond(settings: AppSettings, outputMode: OutputMode): number {
  const preset = settings.renderQuality.preset;
  const profileBase = outputMode === 'longform' ? 12_000_000 : 10_000_000;
  if (preset === 'draft') return profileBase * 0.55;
  if (preset === 'high') return profileBase * 1.65;
  if (preset === 'custom') {
    const crf = Math.max(12, Math.min(35, settings.renderQuality.customCrf));
    return profileBase * Math.max(0.45, Math.min(2, 1 + (20 - crf) * 0.075));
  }
  return profileBase;
}

export function estimateExport(
  queue: readonly RenderProgress[],
  settings: AppSettings,
  outputMode: OutputMode,
  encoder: { encoder: string; isHardware: boolean } | null,
  history = safeHistory(),
): ExportEstimate {
  const mediaSeconds = queue.reduce(
    (total, item) => total + Math.max(0, item.durationSeconds ?? 0),
    0,
  );
  const matching = history.filter(
    (sample) =>
      sample.quality === settings.renderQuality.preset &&
      (!encoder || sample.encoder === encoder.encoder),
  );
  const localFactors = matching
    .map((sample) => sample.renderSeconds / sample.mediaSeconds)
    .filter((factor) => Number.isFinite(factor) && factor > 0)
    .slice(0, 8);
  const baseFactor = encoder?.isHardware ? 0.9 : 1.8;
  const factor =
    localFactors.length > 0
      ? localFactors.reduce((sum, value) => sum + value, 0) / localFactors.length
      : baseFactor * qualitySpeedFactor(settings.renderQuality.preset);
  const uncertainty = localFactors.length >= 3 ? 0.2 : localFactors.length > 0 ? 0.35 : 0.55;
  const estimatedRenderSeconds = Math.max(1, mediaSeconds * factor);
  const bytes = (mediaSeconds * (videoBitrateBitsPerSecond(settings, outputMode) + 192_000)) / 8;

  return {
    mediaSeconds,
    renderSecondsLow: Math.max(1, Math.round(estimatedRenderSeconds * (1 - uncertainty))),
    renderSecondsHigh: Math.max(1, Math.round(estimatedRenderSeconds * (1 + uncertainty))),
    sizeBytesLow: Math.max(1, Math.round(bytes * 0.7)),
    sizeBytesHigh: Math.max(1, Math.round(bytes * 1.35)),
    learnedFromLocalSamples: localFactors.length,
  };
}

function qualityLabel(settings: AppSettings): string {
  const preset = settings.renderQuality.preset;
  if (preset === 'custom') return `Custom, CRF ${settings.renderQuality.customCrf}`;
  return preset === 'normal' ? 'Standard' : `${preset[0]?.toUpperCase()}${preset.slice(1)}`;
}

export async function runExportPreflight({
  destination,
  sourcePaths,
  queue,
  settings,
  outputMode,
}: ExportPreflightInput): Promise<ExportPreflightResult> {
  const uniquePaths = Array.from(new Set(sourcePaths.filter(Boolean)));
  const [diskResult, encoderResult, mediaResult] = await Promise.allSettled([
    window.api.getDiskSpace(destination),
    window.api.getEncoder(),
    uniquePaths.length > 0 ? window.api.checkMediaPaths(uniquePaths) : Promise.resolve([]),
  ]);
  const disk = diskResult.status === 'fulfilled' ? diskResult.value : null;
  const encoder = encoderResult.status === 'fulfilled' ? encoderResult.value : null;
  const media = mediaResult.status === 'fulfilled' ? mediaResult.value : [];
  const estimate = estimateExport(queue, settings, outputMode, encoder);
  const issues: ExportPreflightIssue[] = [];

  if (!destination.trim()) {
    issues.push({
      id: 'destination-missing',
      severity: 'blocker',
      title: 'Choose an export destination',
      detail: 'BatchClip needs a writable folder before encoding can start.',
      action: 'choose-destination',
    });
  } else if (!disk) {
    issues.push({
      id: 'destination-unavailable',
      severity: 'blocker',
      title: 'Destination is unavailable',
      detail: 'The folder could not be checked. Choose an available local destination.',
      action: 'choose-destination',
    });
  }

  const requiredBytes = estimate.sizeBytesHigh + MIN_FREE_SPACE_BUFFER;
  if (disk && disk.free < requiredBytes) {
    issues.push({
      id: 'disk-space',
      severity: 'blocker',
      title: 'More free space is required',
      detail: `Keep at least ${formatBytes(requiredBytes)} free for the estimated output and temporary files.`,
      action: 'settings',
    });
  } else if (disk && disk.free < requiredBytes * 1.5) {
    issues.push({
      id: 'disk-space-tight',
      severity: 'warning',
      title: 'Free space is tight',
      detail: 'The export should fit, but clearing temporary files first leaves a safer margin.',
      action: 'settings',
    });
  }

  const missingMedia = media.filter((item) => !item.available);
  if (missingMedia.length > 0 || (mediaResult.status === 'rejected' && uniquePaths.length > 0)) {
    issues.push({
      id: 'missing-media',
      severity: 'blocker',
      title: 'Source media is offline',
      detail:
        missingMedia.length > 0
          ? `${missingMedia.length} source ${missingMedia.length === 1 ? 'file is' : 'files are'} unavailable. Relink before exporting.`
          : 'BatchClip could not verify the source files. Relink or retry the media check.',
      action: 'relink',
    });
  }

  if (!encoder) {
    issues.push({
      id: 'encoder-check',
      severity: 'warning',
      title: 'Encoder could not be confirmed',
      detail: 'BatchClip will choose the safest available encoder when rendering starts.',
    });
  }

  if (settings.broll.enabled && !settings.pexelsApiKey) {
    issues.push({
      id: 'broll-key',
      severity: 'warning',
      title: 'Stock B-roll will be omitted',
      detail:
        'B-roll is enabled, but no Pexels key is connected. Captions, crop, and the speaker edit still render.',
      action: 'settings',
    });
  }

  const usesImageMoments = queue.some((item) => item.requiresVisualAssets);
  if (usesImageMoments && !settings.pexelsApiKey && !settings.geminiApiKey) {
    issues.push({
      id: 'visual-assets',
      severity: 'warning',
      title: 'Image moments may use the speaker shot',
      detail:
        'No stock or generated-image connection is available. Missing visual assets fall back to playable talking-head footage.',
      action: 'settings',
    });
  }

  return {
    destination,
    disk,
    encoder,
    media,
    estimate,
    resolution: outputMode === 'longform' ? '1920×1080' : '1080×1920',
    fps: 30,
    qualityLabel: qualityLabel(settings),
    clipCount: queue.filter((item) => item.status !== 'cancelled').length,
    totalDurationSeconds: estimate.mediaSeconds,
    issues,
    checkedAt: Date.now(),
  };
}

export function hashRenderOptions(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

export function creatorPreparationLabel(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('filler')) return 'Cleaning filler words and pauses';
  if (normalized.includes('caption') || normalized.includes('subtitle')) return 'Building captions';
  if (normalized.includes('b-roll') || normalized.includes('stock footage'))
    return 'Finding B-roll';
  if (normalized.includes('evidence') || normalized.includes('visual card'))
    return 'Preparing visual cards';
  if (normalized.includes('crop') || normalized.includes('face')) return 'Framing the speaker';
  if (normalized.includes('hook')) return 'Preparing title overlays';
  if (normalized.includes('overlay') || normalized.includes('shot style'))
    return 'Preparing overlays';
  if (normalized.includes('encod')) return 'Encoding finished media';
  return message.replace(/\s*…$/, '');
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
}

export function formatEstimateRange(low: number, high: number): string {
  const format = (seconds: number): string => {
    const rounded = Math.max(1, Math.round(seconds));
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const remainder = rounded % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${remainder}s`;
    return `${remainder}s`;
  };
  return `${format(low)}–${format(high)}`;
}
