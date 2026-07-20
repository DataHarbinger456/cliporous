import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearRegisteredCredentialValues,
  redactCredentialsForLogging,
  redactCredentialText,
  registerCredentialValue,
  stripCredentialFields,
} from './credential-safety';

const TEST_TOKENS = {
  gemini: 'AIzaSyRegressionGeminiToken1234567890',
  pexels: 'pexels-regression-token-1234567890',
  fal: 'fal-id:fal-regression-secret-1234567890',
};

beforeEach(() => clearRegisteredCredentialValues());

describe('stripCredentialFields', () => {
  it('recursively omits Gemini, Pexels, fal.ai, and generic credential fields', () => {
    const source = {
      settings: {
        geminiApiKey: TEST_TOKENS.gemini,
        pexels_api_key: TEST_TOKENS.pexels,
        nested: { falApiKey: TEST_TOKENS.fal, minScore: 8 },
      },
      apiKey: 'future-provider-key',
      clips: [{ id: 'clip-1', tokenCount: 120 }],
    };

    const result = stripCredentialFields(source);
    const output = JSON.stringify(result.value);

    expect(result.value).toEqual({
      settings: { nested: { minScore: 8 } },
      clips: [{ id: 'clip-1', tokenCount: 120 }],
    });
    expect(result.removedFields).toEqual([
      'settings.geminiApiKey',
      'settings.pexels_api_key',
      'settings.nested.falApiKey',
      'apiKey',
    ]);
    expect(output).not.toContain(TEST_TOKENS.gemini);
    expect(output).not.toContain(TEST_TOKENS.pexels);
    expect(output).not.toContain(TEST_TOKENS.fal);
    expect(source.settings.geminiApiKey).toBe(TEST_TOKENS.gemini);
  });
});

describe('log redaction', () => {
  it('redacts registered values from unstructured errors and provider URLs', () => {
    for (const token of Object.values(TEST_TOKENS)) registerCredentialValue(token);

    const message = [
      `Gemini rejected ${TEST_TOKENS.gemini}`,
      `Pexels key=${TEST_TOKENS.pexels}`,
      `fal.ai key: ${TEST_TOKENS.fal}`,
      `Authorization: Bearer ${TEST_TOKENS.pexels}`,
    ].join(' | ');
    const output = redactCredentialText(message);

    for (const token of Object.values(TEST_TOKENS)) expect(output).not.toContain(token);
    expect(output).toContain('[REDACTED]');
  });

  it('removes credential fields from structured logger data', () => {
    registerCredentialValue(TEST_TOKENS.gemini);
    const output = JSON.stringify(
      redactCredentialsForLogging({
        request: { geminiApiKey: TEST_TOKENS.gemini, model: 'gemini-2.5-flash' },
        error: `Request failed for ${TEST_TOKENS.gemini}`,
      }),
    );

    expect(output).not.toContain('geminiApiKey');
    expect(output).not.toContain(TEST_TOKENS.gemini);
    expect(output).toContain('[REDACTED]');
  });
});
