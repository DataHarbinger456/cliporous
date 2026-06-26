/**
 * ClipGrid.test.tsx
 *
 * - Renders one ClipCard per ClipCandidate from a fixture set seeded into
 *   the store via setActiveSource + setClips.
 * - Clicking a card opens the ClipDetail Sheet — verified by the SheetTitle
 *   showing the clip's hook text.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

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

const startApprovedRender = vi.fn(async () => ({ started: true }) as const)
vi.mock('@/services/render-service', () => ({
  startApprovedRender: () => startApprovedRender(),
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

function makeClip(overrides: Partial<ClipCandidate> & { id: string }): ClipCandidate {
  return {
    sourceId: SOURCE.id,
    startTime: 0,
    endTime: 30,
    duration: 30,
    text: 'sample text',
    score: 80,
    hookText: `Hook ${overrides.id}`,
    reasoning: 'because',
    status: 'pending',
    ...overrides,
  }
}

const CLIPS: ClipCandidate[] = [
  makeClip({ id: 'c1', score: 90, hookText: 'First hook line' }),
  makeClip({ id: 'c2', score: 80, hookText: 'Second hook line' }),
  makeClip({ id: 'c3', score: 70, hookText: 'Third hook line' }),
  makeClip({ id: 'c4', score: 60, hookText: 'Fourth hook line' }),
]

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStore()
  installApiStub()

  const store = useStore.getState()
  store.addSource(SOURCE)
  store.setActiveSource(SOURCE.id)
  store.setClips(SOURCE.id, CLIPS)
  // Force `pipeline.stage` to 'ready' so the loading skeleton doesn't show.
  store.setPipeline({ stage: 'ready', message: '', percent: 0 })
})

afterEach(() => {
  cleanup()
  startApprovedRender.mockClear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClipGrid', () => {
  it('renders one card per clip in the fixture set', async () => {
    const { ClipGrid } = await import('@/components/ClipGrid')
    render(<ClipGrid />)

    // Each ClipCard is a role="button" with an aria-label that begins
    // with "Clip:". Score markup ensures they don't collide with footer
    // pills (which have their own aria-labels).
    const cards = screen.getAllByRole('button', { name: /^Clip:/ })
    expect(cards).toHaveLength(CLIPS.length)

    // Hook text from each fixture clip is present on the page.
    for (const clip of CLIPS) {
      expect(screen.getByText(clip.hookText)).toBeInTheDocument()
    }

    // The clip-count label reflects the fixture size.
    expect(screen.getByText(`${CLIPS.length} clips`)).toBeInTheDocument()
  })

  it('confirms before Render All when any clip is rejected, then renders on accept', async () => {
    // Reject one clip — committing it via Render All is destructive.
    useStore.getState().updateClipStatus(SOURCE.id, 'c3', 'rejected')

    const { ClipGrid } = await import('@/components/ClipGrid')
    render(<ClipGrid />)

    fireEvent.click(screen.getByRole('button', { name: /Render All/ }))

    // Render must NOT start yet — a confirmation dialog is shown instead,
    // surfacing both the total committed and the rejected count.
    expect(startApprovedRender).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/Render all 4 clips\?/)).toBeInTheDocument()
    expect(within(dialog).getByText(/including 1 you rejected/)).toBeInTheDocument()

    // Accepting commits every clip and starts the render.
    fireEvent.click(within(dialog).getByRole('button', { name: /Render all 4/ }))
    expect(startApprovedRender).toHaveBeenCalledTimes(1)
    const statuses = useStore.getState().clips[SOURCE.id].map((c) => c.status)
    expect(statuses.every((s) => s === 'approved')).toBe(true)
  })

  it('cancelling the Render All confirmation preserves rejected status and renders nothing', async () => {
    useStore.getState().updateClipStatus(SOURCE.id, 'c3', 'rejected')

    const { ClipGrid } = await import('@/components/ClipGrid')
    render(<ClipGrid />)

    fireEvent.click(screen.getByRole('button', { name: /Render All/ }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Cancel/ }))

    expect(startApprovedRender).not.toHaveBeenCalled()
    const c3 = useStore.getState().clips[SOURCE.id].find((c) => c.id === 'c3')
    expect(c3?.status).toBe('rejected')
  })

  it('renders directly without confirmation when no clip is rejected', async () => {
    const { ClipGrid } = await import('@/components/ClipGrid')
    render(<ClipGrid />)

    fireEvent.click(screen.getByRole('button', { name: /Render All/ }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(startApprovedRender).toHaveBeenCalledTimes(1)
  })

  it('opens the ClipDetail Sheet when a card is clicked', async () => {
    const { ClipGrid } = await import('@/components/ClipGrid')
    render(<ClipGrid />)

    // Clicking the first card opens the Sheet for that clip. Cards are
    // sorted by score desc, so c1 (score 90) is first.
    const firstCard = screen.getByRole('button', { name: /First hook line/ })
    fireEvent.click(firstCard)

    // Sheet renders a dialog whose title is the clip's hookText.
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    // The hook text appears multiple times inside the dialog now (the
    // SheetTitle plus the framing-overlay hook pill), so assert presence via
    // getAllByText rather than the uniqueness-enforcing getByText.
    expect(
      within(dialog).getAllByText('First hook line').length
    ).toBeGreaterThanOrEqual(1)
  })
})
