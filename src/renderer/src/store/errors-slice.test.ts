import {
  clearRegisteredCredentialValues,
  registerCredentialValue,
} from '@shared/credential-safety';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '@/store';

const TEST_CREDENTIAL = 'pexels-log-regression-token-1234567890';

describe('errors slice structured contract', () => {
  beforeEach(() => {
    clearRegisteredCredentialValues();
    useStore.setState({ errorLog: [] });
  });

  it('redacts credentials before the in-memory error log and main log bridge', () => {
    const logToMain = vi.fn();
    (window as unknown as { api: { logToMain: typeof logToMain } }).api = { logToMain };
    registerCredentialValue(TEST_CREDENTIAL);

    const entry = useStore.getState().addError({
      source: 'pexels',
      message: `Pexels rejected ${TEST_CREDENTIAL}`,
      details: `Authorization: Bearer ${TEST_CREDENTIAL}`,
      failedStage: 'b-roll',
    });

    expect(entry.technicalDetails).not.toContain(TEST_CREDENTIAL);
    expect(entry.technicalDetails).toContain('[REDACTED]');
    expect(entry.whatHappened).not.toContain(TEST_CREDENTIAL);
    expect(entry.correlationId).toMatch(/^BC-/);

    const bridgedLog = JSON.stringify(logToMain.mock.calls);
    expect(bridgedLog).not.toContain(TEST_CREDENTIAL);
    expect(bridgedLog).toContain('[REDACTED]');
  });
});
