import type { TokenUsageEvent } from '@shared/ai-usage';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiUsageIndicator } from '@/components/AiUsageIndicator';
import { useAiTokenUsage } from '@/hooks/useAiTokenUsage';
import { useStore } from '@/store';

function UsageBridge(): null {
  useAiTokenUsage();
  return null;
}

let emitUsage: ((event: TokenUsageEvent) => void) | undefined;
const unsubscribe = vi.fn();

beforeEach(() => {
  emitUsage = undefined;
  unsubscribe.mockClear();
  useStore.getState().resetAiUsage();
  useStore.setState((state) => ({
    settings: { ...state.settings, geminiApiKey: 'configured-for-test' },
  }));
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      onAiTokenUsage: (callback: (event: TokenUsageEvent) => void) => {
        emitUsage = callback;
        return unsubscribe;
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AI usage bridge and header indicator', () => {
  it('updates the header indicator when the preload bridge emits usage', () => {
    const view = render(
      <>
        <UsageBridge />
        <AiUsageIndicator />
      </>,
    );

    expect(screen.getByLabelText('No AI usage this session')).toBeInTheDocument();

    act(() => {
      emitUsage?.({
        source: 'scoring',
        promptTokens: 10_000,
        completionTokens: 2_000,
        totalTokens: 12_000,
        model: 'gemini-2.5-flash-lite',
        timestamp: 1,
      });
    });

    const trigger = screen.getByRole('button', { name: /12\.0k AI tokens/i });
    expect(trigger).toBeInTheDocument();
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    expect(screen.getByText('gemini-2.5-flash-lite')).toBeInTheDocument();
    expect(screen.getByText(/Estimated in USD at paid-tier list rates/)).toBeInTheDocument();

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('marks unknown-model costs unavailable instead of pricing them as Flash-Lite', () => {
    render(
      <>
        <UsageBridge />
        <AiUsageIndicator />
      </>,
    );

    act(() => {
      emitUsage?.({
        source: 'hooks',
        promptTokens: 500,
        completionTokens: 250,
        totalTokens: 750,
        model: 'gemini-unlisted-preview',
        timestamp: 2,
      });
    });

    fireEvent.pointerDown(screen.getByRole('button', { name: /750 AI tokens/i }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getAllByText('Cost unavailable')).not.toHaveLength(0);
    expect(screen.getByText(/excluded instead of guessed/i)).toBeInTheDocument();
  });
});
