import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetStore } from '@/components/__tests__/test-utils';
import { ProcessingRecipe } from '@/components/ProcessingRecipe';
import { DEFAULT_PROCESSING_CONFIG, useStore } from '@/store';

beforeEach(() => {
  resetStore();
  useStore.getState().resetProcessingConfig();
});

afterEach(cleanup);

describe('ProcessingRecipe', () => {
  it('keeps safe essentials visible and advanced controls collapsed', () => {
    render(<ProcessingRecipe />);

    expect(screen.getByText('Clip recipe')).toBeInTheDocument();
    expect(screen.getByLabelText('Target audience')).toBeEnabled();
    expect(screen.getByLabelText('Target duration')).toBeEnabled();
    expect(screen.getByLabelText('Score threshold')).toBeEnabled();
    expect(screen.queryByLabelText('AI editing')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced clip controls' }));

    expect(screen.getByLabelText('AI editing')).toBeChecked();
    expect(screen.getByLabelText('Multipart stories')).not.toBeChecked();
    expect(screen.getByLabelText('Promo Mode')).not.toBeChecked();
  });

  it('updates the audience and advanced switches immediately', () => {
    render(<ProcessingRecipe />);

    fireEvent.change(screen.getByLabelText('Target audience'), {
      target: { value: 'Independent creators selling their first course' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show advanced clip controls' }));
    fireEvent.click(screen.getByLabelText('Multipart stories'));
    fireEvent.click(screen.getByLabelText('AI editing'));

    expect(useStore.getState().processingConfig).toMatchObject({
      targetAudience: 'Independent creators selling their first course',
      enableMultiPart: true,
      enableAiEdit: false,
    });
  });

  it('explains Promo Mode and disables scoring controls that it bypasses', () => {
    render(<ProcessingRecipe />);

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced clip controls' }));
    fireEvent.click(screen.getByLabelText('Promo Mode'));

    expect(screen.getByText('Promo Mode is on.')).toBeInTheDocument();
    expect(screen.getByLabelText('Target duration')).toBeDisabled();
    expect(screen.getByLabelText('Target audience')).toBeDisabled();
    expect(screen.getByLabelText('Score threshold')).toBeDisabled();
  });

  it('restores the complete recipe to safe defaults', () => {
    useStore.setState((state) => ({
      processingConfig: {
        ...state.processingConfig,
        targetDuration: '90-120',
        enableMultiPart: true,
        targetAudience: 'Growth teams',
      },
      settings: { ...state.settings, minScore: 90 },
    }));
    render(<ProcessingRecipe />);

    fireEvent.click(screen.getByRole('button', { name: 'Use safe defaults' }));

    expect(useStore.getState().processingConfig).toEqual(DEFAULT_PROCESSING_CONFIG);
    expect(useStore.getState().settings.minScore).toBe(69);
  });
});
