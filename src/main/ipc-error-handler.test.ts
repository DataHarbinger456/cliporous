import { registerCredentialValue } from '@shared/credential-safety';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => vi.fn());
vi.mock('./logger', () => ({ log }));

import { wrapHandler } from './ipc-error-handler';

describe('wrapHandler structured error handoff', () => {
  beforeEach(() => log.mockReset());

  it('adds one correlation id to the main log and rejected IPC message', async () => {
    const wrapped = wrapHandler('test:channel', async () => {
      throw new Error('provider failed');
    });

    let caught: Error | null = null;
    try {
      await wrapped();
    } catch (error) {
      caught = error as Error;
    }

    expect(caught?.message).toMatch(/^\[BC-[A-Z0-9-]+\] provider failed$/);
    const correlationId = caught?.message.match(/^\[([^\]]+)\]/)?.[1];
    expect(log).toHaveBeenCalledWith(
      'error',
      'IPC',
      expect.stringContaining(`[${correlationId}] [test:channel] provider failed`),
    );
  });

  it('redacts a registered credential before logging or crossing IPC', async () => {
    const credential = 'ipc-secret-regression-value';
    registerCredentialValue(credential);
    const wrapped = wrapHandler('test:secret', () => {
      throw new Error(`Authorization: Bearer ${credential}`);
    });

    await expect(wrapped()).rejects.not.toThrow(credential);
    expect(JSON.stringify(log.mock.calls)).not.toContain(credential);
    expect(JSON.stringify(log.mock.calls)).toContain('[REDACTED]');
  });
});
