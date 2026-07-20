import { describe, expect, it } from 'vitest';
import { AI_PRICING, estimateTokenUsageCost, type TokenUsageEvent } from './ai-usage';

function usage(model: string, promptTokens: number, completionTokens: number): TokenUsageEvent {
  return {
    source: 'scoring',
    model,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    timestamp: 1,
  };
}

describe('AI pricing ledger', () => {
  it('uses the exact model price and exposes a versioned source', () => {
    const estimate = estimateTokenUsageCost(usage('gemini-2.5-flash-lite', 1_000_000, 1_000_000));

    expect(estimate.estimatedCostUsd).toBeCloseTo(0.5);
    expect(estimate.pricing?.modelId).toBe('gemini-2.5-flash-lite');
    expect(AI_PRICING.version).toMatch(/^google-gemini-api-/);
    expect(AI_PRICING.checkedDate).toBeTruthy();
    expect(AI_PRICING.sourceUrl).toMatch(/^https:\/\/ai\.google\.dev\//);
  });

  it('keeps each model on its own configured rate', () => {
    const flash = estimateTokenUsageCost(usage('gemini-2.5-flash', 1_000_000, 1_000_000));
    const flashLite = estimateTokenUsageCost(usage('gemini-2.5-flash-lite', 1_000_000, 1_000_000));

    expect(flash.estimatedCostUsd).toBeCloseTo(2.8);
    expect(flashLite.estimatedCostUsd).toBeCloseTo(0.5);
  });

  it('returns an unpriced result for an unknown model instead of borrowing a price', () => {
    const estimate = estimateTokenUsageCost(usage('gemini-future-unlisted', 1_000_000, 1_000_000));

    expect(estimate.estimatedCostUsd).toBeNull();
    expect(estimate.pricing).toBeNull();
  });
});
