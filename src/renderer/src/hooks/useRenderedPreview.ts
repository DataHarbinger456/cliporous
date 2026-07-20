import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type RenderPreviewConfig = Parameters<typeof window.api.renderPreview>[0];

export type RenderedPreviewState =
  | { status: 'idle'; previewPath: null; cached: false; error: null }
  | {
      status: 'preparing';
      phase: 'queued' | 'rendering';
      previewPath: null;
      cached: false;
      error: null;
    }
  | { status: 'ready'; previewPath: string; cached: boolean; error: null }
  | { status: 'failed'; previewPath: null; cached: false; error: string };

interface PreviewCacheEntry {
  clipId: string;
  key: string;
  previewPath: string;
}

const previewCache = new Map<string, PreviewCacheEntry>();
const desiredKeyByClip = new Map<string, string>();
const inFlightByKey = new Map<string, Promise<string | null>>();

const IDLE_STATE: RenderedPreviewState = {
  status: 'idle',
  previewPath: null,
  cached: false,
  error: null,
};

function cleanupPath(previewPath: string): void {
  void window.api.cleanupPreview(previewPath).catch(() => {
    // Temp cleanup is best effort and must never block continued editing.
  });
}

function stablePreviewValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stablePreviewValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stablePreviewValue(nested)]),
    );
  }
  return value;
}

/** Stable, inspectable cache key for one clip and every setting the preview renderer receives. */
export function renderedPreviewCacheKey(clipId: string, config: RenderPreviewConfig): string {
  return `${clipId}:${JSON.stringify(stablePreviewValue(config))}`;
}

function removeOtherClipEntries(clipId: string, keepKey: string): void {
  previewCache.forEach((entry, key) => {
    if (entry.clipId === clipId && key !== keepKey) {
      previewCache.delete(key);
      cleanupPath(entry.previewPath);
    }
  });
}

async function renderAndCache(
  clipId: string,
  key: string,
  config: RenderPreviewConfig,
): Promise<string | null> {
  const existingRequest = inFlightByKey.get(key);
  if (existingRequest) return existingRequest;

  const request = window.api
    .renderPreview(config)
    .then(({ previewPath }) => {
      if (desiredKeyByClip.get(clipId) !== key) {
        cleanupPath(previewPath);
        return null;
      }
      removeOtherClipEntries(clipId, key);
      previewCache.set(key, { clipId, key, previewPath });
      return previewPath;
    })
    .finally(() => {
      inFlightByKey.delete(key);
    });

  inFlightByKey.set(key, request);
  return request;
}

/** Clean preview files owned by one clip, used when an inspector closes. */
export function clearRenderedPreviewCache(clipId: string): void {
  desiredKeyByClip.delete(clipId);
  previewCache.forEach((entry, key) => {
    if (entry.clipId === clipId) {
      previewCache.delete(key);
      cleanupPath(entry.previewPath);
    }
  });
}

/** Test/teardown helper for clearing every cached temp preview owned by this renderer. */
export function clearAllRenderedPreviewCaches(): void {
  desiredKeyByClip.clear();
  previewCache.forEach((entry) => {
    cleanupPath(entry.previewPath);
  });
  previewCache.clear();
}

interface UseRenderedPreviewOptions {
  clipId: string | null;
  config: RenderPreviewConfig | null;
  enabled: boolean;
  debounceMs?: number;
}

export interface UseRenderedPreviewResult {
  state: RenderedPreviewState;
  retry: () => void;
}

/**
 * Debounces real preview renders, serves exact cache hits synchronously, and
 * discards/cleans results from edits that became stale while FFmpeg was running.
 */
export function useRenderedPreview({
  clipId,
  config,
  enabled,
  debounceMs = 500,
}: UseRenderedPreviewOptions): UseRenderedPreviewResult {
  const [retryVersion, setRetryVersion] = useState(0);
  const key = useMemo(
    () => (clipId && config ? renderedPreviewCacheKey(clipId, config) : null),
    [clipId, config],
  );
  const requestKey = key ? `${key}:request-${retryVersion}` : null;
  const [state, setState] = useState<RenderedPreviewState>(() => {
    if (!enabled || !key) return IDLE_STATE;
    const cached = previewCache.get(key);
    return cached
      ? { status: 'ready', previewPath: cached.previewPath, cached: true, error: null }
      : {
          status: 'preparing',
          phase: 'queued',
          previewPath: null,
          cached: false,
          error: null,
        };
  });
  const requestVersionRef = useRef(0);

  useLayoutEffect(() => {
    const requestVersion = ++requestVersionRef.current;
    if (!enabled || !clipId || !config || !key || !requestKey) {
      setState(IDLE_STATE);
      return;
    }

    desiredKeyByClip.set(clipId, key);
    const cached = previewCache.get(key);
    if (cached) {
      setState({
        status: 'ready',
        previewPath: cached.previewPath,
        cached: true,
        error: null,
      });
      return;
    }

    let cancelled = false;
    setState({
      status: 'preparing',
      phase: 'queued',
      previewPath: null,
      cached: false,
      error: null,
    });

    const timer = window.setTimeout(() => {
      if (cancelled || requestVersionRef.current !== requestVersion) return;
      setState({
        status: 'preparing',
        phase: 'rendering',
        previewPath: null,
        cached: false,
        error: null,
      });
      void renderAndCache(clipId, key, config)
        .then((previewPath) => {
          if (
            cancelled ||
            requestVersionRef.current !== requestVersion ||
            desiredKeyByClip.get(clipId) !== key ||
            !previewPath
          ) {
            return;
          }
          setState({ status: 'ready', previewPath, cached: false, error: null });
        })
        .catch((error: unknown) => {
          if (cancelled || requestVersionRef.current !== requestVersion) return;
          setState({
            status: 'failed',
            previewPath: null,
            cached: false,
            error: error instanceof Error ? error.message : 'Preview rendering failed',
          });
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clipId, config, debounceMs, enabled, key, requestKey]);

  const retry = useCallback(() => {
    if (clipId) clearRenderedPreviewCache(clipId);
    setRetryVersion((version) => version + 1);
  }, [clipId]);

  return { state, retry };
}
