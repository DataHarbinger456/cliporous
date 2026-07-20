import type { LongformEditPlan } from '@shared/types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CutPlanReviewScreen } from '@/components/screens/CutPlanReviewScreen';
import { useStore } from '@/store';
import type { SourceVideo } from '@/store/types';
import { installApiStub, resetStore } from './test-utils';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  }),
}));

const SOURCE: SourceVideo = {
  id: 'longform-source',
  path: '/videos/creator-story.mp4',
  name: 'creator-story.mp4',
  duration: 150,
  width: 1920,
  height: 1080,
  origin: 'file',
  mediaStatus: 'online',
};

const PLAN: LongformEditPlan = {
  phrases: [{ text: 'BUILD TRUST', startTime: 4, endTime: 5.2 }],
  blocks: [
    {
      kind: 'callout',
      startTime: 100,
      endTime: 105,
      kicker: 'THE PROOF',
      heading: 'Show the evidence',
      body: 'Results make the claim credible',
    },
  ],
  cards: [
    {
      kind: 'delos-scan-result',
      startTime: 12,
      endTime: 16,
      sourceText: 'Customer evidence from the transcript',
    },
  ],
  reasoning: 'Open with the claim, then support it with sourced evidence.',
  generatedAt: 100,
};

function seedCutPlan(): void {
  useStore.setState((state) => {
    state.sources = [SOURCE];
    state.activeSourceId = SOURCE.id;
    state.transcriptions[SOURCE.id] = {
      text: 'Build trust with evidence. Customer evidence from the transcript. Show the evidence.',
      formattedForAI: '[4|4.4|Build]',
      segments: [],
      words: [
        { text: 'Build', start: 4, end: 4.4 },
        { text: 'trust', start: 4.5, end: 5 },
        { text: 'with', start: 5.1, end: 5.4 },
        { text: 'evidence', start: 5.5, end: 6.2 },
        { text: 'Show', start: 100, end: 100.5 },
        { text: 'the', start: 100.6, end: 100.8 },
        { text: 'evidence', start: 100.9, end: 101.5 },
      ],
    };
    state.settings.outputDirectory = '/exports';
    state.settings.longformPaletteId = 'brand';
    state.pipeline = { stage: 'ready', message: 'Cut Plan ready for review', percent: 100 };
  });
  useStore.getState().setLongformPlan(SOURCE.id, {
    plan: PLAN,
    skin: 'editorial',
    paletteId: 'brand',
  });
}

describe('CutPlanReviewScreen', () => {
  beforeEach(() => {
    resetStore();
    installApiStub();
    seedCutPlan();
  });

  afterEach(() => cleanup());

  it('shows sections, sourced evidence beats, timing, style, versions, and preflight', () => {
    render(<CutPlanReviewScreen />);

    expect(screen.getByRole('heading', { name: 'creator-story.mp4' })).toBeInTheDocument();
    expect(screen.getByText('BUILD TRUST')).toBeInTheDocument();
    expect(screen.getAllByText('Show the evidence')).toHaveLength(3);
    expect(screen.getByText(/Build trust with evidence/)).toBeInTheDocument();
    expect(screen.getByText('Style and palette')).toBeInTheDocument();
    expect(screen.getByText('Version history')).toBeInTheDocument();
    expect(screen.getByText('Render preflight')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept and Continue' })).toBeEnabled();
  });

  it('saves whole-plan feedback without losing the active version', () => {
    render(<CutPlanReviewScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Add plan feedback' }));
    const field = screen.getByLabelText('Feedback for the whole plan');
    fireEvent.change(field, {
      target: { value: 'Keep the opening, but replace the evidence card.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    const record = useStore.getState().longformPlans[SOURCE.id];
    expect(record?.feedback).toEqual([
      expect.objectContaining({
        targetLabel: 'Whole plan',
        message: 'Keep the opening, but replace the evidence card.',
        status: 'pending',
      }),
    ]);
    expect(record?.plan.phrases[0]?.text).toBe('BUILD TRUST');
  });

  it('accepts the active version before preparing the long-form export', async () => {
    const api = installApiStub();
    render(<CutPlanReviewScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept and Continue' }));

    await waitFor(() =>
      expect(useStore.getState().renderProgress).toEqual([
        expect.objectContaining({
          clipId: SOURCE.id,
          kind: 'longform',
          status: 'queued',
        }),
      ]),
    );
    expect(useStore.getState().longformPlans[SOURCE.id]?.status).toBe('accepted');
    expect(useStore.getState().pipeline).toMatchObject({
      stage: 'rendering',
      message: 'Review export preflight',
    });
    expect(api.startBatchRender).not.toHaveBeenCalled();
  });
});
