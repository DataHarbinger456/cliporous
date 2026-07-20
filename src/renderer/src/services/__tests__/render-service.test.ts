/**
 * render-service.test.ts
 *
 * RF-011 regression: a per-clip caption-mode choice made in ClipDetail is
 * persisted onto the ClipCandidate (`overrides.captionMode`) and must reach the
 * render pipeline. Before the fix, `startApprovedRender` sent no per-clip
 * overrides at all, so the render path always fell back to the global PRESTYJ
 * caption style and silently ignored the user's selection.
 */

import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installApiStub, resetStore } from '@/components/__tests__/test-utils';
import { startApprovedRender } from '@/services/render-service';
import { useStore } from '@/store';
import type { ClipCandidate, SourceVideo } from '@/store/types';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
    warning: vi.fn(),
  }),
}));

const SOURCE: SourceVideo = {
  id: 'src-1',
  path: '/videos/talk.mp4',
  name: 'talk.mp4',
  duration: 600,
  width: 1920,
  height: 1080,
  origin: 'file',
};

function makeClip(overrides?: ClipCandidate['overrides']): ClipCandidate {
  return {
    id: 'c1',
    sourceId: SOURCE.id,
    startTime: 10,
    endTime: 40,
    duration: 30,
    text: 'sample',
    score: 85,
    hookText: 'A bold opening',
    reasoning: 'because',
    status: 'approved',
    ...(overrides ? { overrides } : {}),
  };
}

let startBatchRender: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetStore();
  const stub = installApiStub();
  startBatchRender = stub.startBatchRender;
  const store = useStore.getState();
  store.addSource(SOURCE);
  store.setActiveSource(SOURCE.id);
});

afterEach(() => {
  vi.clearAllMocks();
});

interface ForwardedJob {
  clipId: string;
  clipOverrides?: { captionMode?: string };
}
interface ForwardedOptions {
  jobs: ForwardedJob[];
  broll?: unknown;
}

function firstCallOptions(): ForwardedOptions {
  const call = startBatchRender.mock.calls[0];
  if (!call) throw new Error('startBatchRender was not called');
  return call[0] as ForwardedOptions;
}

describe('startApprovedRender — per-clip caption mode (RF-011)', () => {
  it('forwards the persisted caption mode into the render job', async () => {
    useStore.getState().setClips(SOURCE.id, [makeClip({ captionMode: 'standard' })]);

    const result = await startApprovedRender();
    expect(result.started).toBe(true);

    expect(startBatchRender).toHaveBeenCalledTimes(1);
    const options = firstCallOptions();
    const job = options.jobs.find((j) => j.clipId === 'c1');
    expect(job?.clipOverrides?.captionMode).toBe('standard');
  });

  it('omits caption-mode override when the clip has no explicit choice', async () => {
    useStore.getState().setClips(SOURCE.id, [makeClip()]);

    await startApprovedRender();

    const options = firstCallOptions();
    const job = options.jobs.find((j) => j.clipId === 'c1');
    expect(job).toBeDefined();
    // No override object → render path applies the global PRESTYJ default.
    expect(job?.clipOverrides?.captionMode).toBeUndefined();
  });
});

describe('startApprovedRender — B-roll without Pexels key (RF-017)', () => {
  it('warns and drops b-roll when enabled with no Pexels key', async () => {
    useStore.getState().setClips(SOURCE.id, [makeClip()]);
    useStore.setState((s) => {
      s.settings.broll.enabled = true;
      s.settings.pexelsApiKey = '';
    });

    const result = await startApprovedRender();
    expect(result.started).toBe(true);

    expect(toast.warning).toHaveBeenCalledWith(
      'B-roll is on but no Pexels key is set — rendering without b-roll. Add a key in Settings.',
    );
    // B-roll is dropped from the forwarded options.
    expect(firstCallOptions().broll).toBeUndefined();
  });

  it('does not warn when b-roll is enabled with a Pexels key', async () => {
    useStore.getState().setClips(SOURCE.id, [makeClip()]);
    useStore.setState((s) => {
      s.settings.broll.enabled = true;
      s.settings.pexelsApiKey = 'pexels-key-123';
    });

    await startApprovedRender();

    expect(toast.warning).not.toHaveBeenCalled();
    expect(firstCallOptions().broll).toBeDefined();
  });
});
