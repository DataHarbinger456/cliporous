import type { WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { emitUsageFromResponse, setUsageWebContents } from './ai-usage';

describe('AI usage reporting', () => {
  it('includes billed thinking tokens in completion usage', () => {
    const send = vi.fn();
    setUsageWebContents({ isDestroyed: () => false, send } as unknown as WebContents);

    emitUsageFromResponse('scoring', 'gemini-3-flash-preview', {
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 25,
        thoughtsTokenCount: 75,
        totalTokenCount: 200,
      },
    });

    expect(send).toHaveBeenCalledWith(
      'ai:tokenUsage',
      expect.objectContaining({
        promptTokens: 100,
        completionTokens: 100,
        totalTokens: 200,
        model: 'gemini-3-flash-preview',
      }),
    );
  });
});
