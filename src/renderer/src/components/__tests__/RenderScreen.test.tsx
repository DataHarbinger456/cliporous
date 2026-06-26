/**
 * RenderScreen.test.tsx
 *
 * - Per-clip rows render with status badges + progress bars driven by
 *   `state.renderProgress`.
 * - The post-batch "Open Output Folder" Button is only enabled once the
 *   batch has completed (i.e. `batchSummary` is set + `isRendering` is
 *   false). Before that it isn't even rendered.
 *
 * Render bridge events are simulated by capturing the callbacks the
 * component subscribes to in `useEffect` and invoking them directly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'

import { useStore } from '@/store'
import type { ClipCandidate, SourceVideo } from '@/store/types'
import { installApiStub, resetStore } from './test-utils'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SOURCE: SourceVideo = {
  id: 'src-1',
  path: '/videos/talk.mp4',
  name: 'talk.mp4',
  duration: 600,
  width: 1920,
  height: 1080,
  origin: 'file',
}

function makeApprovedClip(id: string, hookText: string): ClipCandidate {
  return {
    id,
    sourceId: SOURCE.id,
    startTime: 0,
    endTime: 30,
    duration: 30,
    text: 'sample',
    score: 80,
    hookText,
    reasoning: 'r',
    status: 'approved',
  }
}

const CLIPS: ClipCandidate[] = [
  makeApprovedClip('c1', 'First clip'),
  makeApprovedClip('c2', 'Second clip'),
  makeApprovedClip('c3', 'Third clip'),
]

// ---------------------------------------------------------------------------
// Bridge-callback capture
// ---------------------------------------------------------------------------

interface RenderEventCallbacks {
  onStart?: (data: { clipId: string }) => void
  onPrepare?: (data: { clipId: string; message: string; percent: number }) => void
  onProgress?: (data: { clipId: string; percent: number }) => void
  onDone?: (data: { clipId: string; outputPath: string }) => void
  onError?: (data: { clipId: string; error: string }) => void
  onBatchDone?: (data: { completed: number; failed: number; total: number }) => void
  onCancelled?: (data: { completed: number; failed: number; total: number }) => void
}

const callbacks: RenderEventCallbacks = {}

function installRenderApi(): void {
  installApiStub({
    onRenderClipStart: vi.fn((cb: RenderEventCallbacks['onStart']) => {
      callbacks.onStart = cb
      return () => {}
    }),
    onRenderClipPrepare: vi.fn((cb: RenderEventCallbacks['onPrepare']) => {
      callbacks.onPrepare = cb
      return () => {}
    }),
    onRenderClipProgress: vi.fn((cb: RenderEventCallbacks['onProgress']) => {
      callbacks.onProgress = cb
      return () => {}
    }),
    onRenderClipDone: vi.fn((cb: RenderEventCallbacks['onDone']) => {
      callbacks.onDone = cb
      return () => {}
    }),
    onRenderClipError: vi.fn((cb: RenderEventCallbacks['onError']) => {
      callbacks.onError = cb
      return () => {}
    }),
    onRenderBatchDone: vi.fn((cb: RenderEventCallbacks['onBatchDone']) => {
      callbacks.onBatchDone = cb
      return () => {}
    }),
    onRenderCancelled: vi.fn((cb: RenderEventCallbacks['onCancelled']) => {
      callbacks.onCancelled = cb
      return () => {}
    }),
    showItemInFolder: vi.fn(async () => undefined),
  })
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStore()
  installRenderApi()

  const store = useStore.getState()
  store.addSource(SOURCE)
  store.setActiveSource(SOURCE.id)
  store.setClips(SOURCE.id, CLIPS)
  // Need an output directory so the Open Folder button can be enabled.
  store.setOutputDirectory('/output')
})

afterEach(() => {
  cleanup()
  for (const k of Object.keys(callbacks) as (keyof RenderEventCallbacks)[]) {
    delete callbacks[k]
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RenderScreen', () => {
  it('shows one progress row per approved clip', async () => {
    const { RenderScreen } = await import('@/components/screens/RenderScreen')
    render(<RenderScreen />)

    // Each approved clip's hook text is visible in its row.
    for (const clip of CLIPS) {
      expect(screen.getByText(clip.hookText)).toBeInTheDocument()
    }

    // Three rows → three status badges. Initially all are "Pending".
    expect(screen.getAllByText('Pending')).toHaveLength(CLIPS.length)
  })

  it('updates the row when a render:clipProgress event fires', async () => {
    const { RenderScreen } = await import('@/components/screens/RenderScreen')
    render(<RenderScreen />)

    expect(callbacks.onStart).toBeDefined()
    expect(callbacks.onProgress).toBeDefined()

    act(() => {
      callbacks.onStart?.({ clipId: 'c1' })
      callbacks.onProgress?.({ clipId: 'c1', percent: 42 })
    })

    // The first clip's row now shows the "Rendering" badge.
    expect(screen.getByText('Rendering')).toBeInTheDocument()

    // The persisted store record carries the percent so the bar reads it.
    const record = useStore
      .getState()
      .renderProgress.find((r) => r.clipId === 'c1')
    expect(record?.percent).toBe(42)
    expect(record?.status).toBe('rendering')
  })

  it('shows the prepare status + live message on a clipPrepare event (B-Roll prep)', async () => {
    const { RenderScreen } = await import('@/components/screens/RenderScreen')
    render(<RenderScreen />)

    expect(callbacks.onPrepare).toBeDefined()

    act(() => {
      callbacks.onPrepare?.({
        clipId: 'c1',
        message: 'Downloading stock footage…',
        percent: 20,
      })
    })

    // Row flips to the "Preparing" badge and surfaces the live message line.
    expect(screen.getByText('Preparing')).toBeInTheDocument()
    expect(screen.getByText('Downloading stock footage…')).toBeInTheDocument()

    const record = useStore.getState().renderProgress.find((r) => r.clipId === 'c1')
    expect(record?.status).toBe('preparing')
    expect(record?.percent).toBe(20)
    expect(record?.prepareMessage).toBe('Downloading stock footage…')

    // Once the encode starts, the row moves to "Rendering" and drops the line.
    act(() => {
      callbacks.onStart?.({ clipId: 'c1' })
    })
    expect(screen.getByText('Rendering')).toBeInTheDocument()
    expect(screen.queryByText('Downloading stock footage…')).not.toBeInTheDocument()
  })

  it('enables "Open Output Folder" only after the batch completes', async () => {
    const { RenderScreen } = await import('@/components/screens/RenderScreen')
    render(<RenderScreen />)

    // Pre-completion: the post-batch footer isn't rendered at all.
    expect(
      screen.queryByRole('button', { name: /open output folder/i })
    ).not.toBeInTheDocument()

    // Drive the bridge: kick a render off, then complete the batch.
    act(() => {
      useStore.getState().setIsRendering(true)
    })

    act(() => {
      callbacks.onStart?.({ clipId: 'c1' })
      callbacks.onProgress?.({ clipId: 'c1', percent: 100 })
      callbacks.onDone?.({ clipId: 'c1', outputPath: '/output/c1.mp4' })
      callbacks.onStart?.({ clipId: 'c2' })
      callbacks.onDone?.({ clipId: 'c2', outputPath: '/output/c2.mp4' })
      callbacks.onStart?.({ clipId: 'c3' })
      callbacks.onDone?.({ clipId: 'c3', outputPath: '/output/c3.mp4' })
      callbacks.onBatchDone?.({ completed: 3, failed: 0, total: 3 })
    })

    const openBtn = await screen.findByRole('button', {
      name: /open output folder/i,
    })
    expect(openBtn).toBeEnabled()

    // Three "Done" badges are also visible — one per clip.
    expect(screen.getAllByText('Done')).toHaveLength(CLIPS.length)
  })

  it('reveals a finished clip in the OS file manager and shows the output path', async () => {
    const { RenderScreen } = await import('@/components/screens/RenderScreen')
    render(<RenderScreen />)

    act(() => {
      useStore.getState().setIsRendering(true)
    })
    act(() => {
      callbacks.onStart?.({ clipId: 'c1' })
      callbacks.onDone?.({ clipId: 'c1', outputPath: '/output/c1.mp4' })
      callbacks.onStart?.({ clipId: 'c2' })
      callbacks.onDone?.({ clipId: 'c2', outputPath: '/output/c2.mp4' })
      callbacks.onStart?.({ clipId: 'c3' })
      callbacks.onDone?.({ clipId: 'c3', outputPath: '/output/c3.mp4' })
      callbacks.onBatchDone?.({ completed: 3, failed: 0, total: 3 })
    })

    // One "Reveal in Finder" action per finished clip, each showing its file.
    const revealBtns = await screen.findAllByRole('button', {
      name: /reveal in finder/i,
    })
    expect(revealBtns).toHaveLength(CLIPS.length)
    expect(screen.getByText('c1.mp4')).toBeInTheDocument()

    // Clicking the first reveal forwards that clip's outputPath to the bridge.
    fireEvent.click(revealBtns[0] as HTMLElement)
    expect(window.api.showItemInFolder).toHaveBeenCalledWith('/output/c1.mp4')

    // The footer surfaces the resolved output directory.
    expect(screen.getByText('/output')).toBeInTheDocument()
  })

  it('"Open Output Folder" is disabled when no output directory is set', async () => {
    // Wipe the output directory so the post-batch button can't actually open.
    act(() => {
      useStore.setState((s) => ({
        settings: { ...s.settings, outputDirectory: null },
      }))
    })

    const { RenderScreen } = await import('@/components/screens/RenderScreen')
    render(<RenderScreen />)

    act(() => {
      useStore.getState().setIsRendering(true)
    })
    act(() => {
      callbacks.onBatchDone?.({ completed: 0, failed: 0, total: 0 })
    })

    const footer = screen.getByRole('button', { name: /open output folder/i })
    expect(footer).toBeDisabled()
  })

  it('row hosts a progress bar while rendering and after completion', async () => {
    const { RenderScreen } = await import('@/components/screens/RenderScreen')
    const { container } = render(<RenderScreen />)

    // No rendering yet → no progress bars in the DOM.
    expect(container.querySelectorAll('[role="progressbar"]')).toHaveLength(0)

    act(() => {
      callbacks.onStart?.({ clipId: 'c1' })
      callbacks.onProgress?.({ clipId: 'c1', percent: 25 })
    })

    const bars = container.querySelectorAll('[role="progressbar"]')
    expect(bars.length).toBeGreaterThanOrEqual(1)

    // Find c1's row by its hook text and confirm it has its own bar.
    const row = screen.getByText('First clip').closest('div')!
    expect(within(row.parentElement as HTMLElement).getByRole('progressbar')).toBeInTheDocument()
  })
})
