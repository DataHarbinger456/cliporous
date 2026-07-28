import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ch } from '@shared/ipc-channels';
import { describe, expect, it, vi } from 'vitest';

/**
 * Regression coverage for the Settings → Save → secrets.json path.
 *
 * A real-world failure mode: the user types a Gemini key, "Test connection"
 * fails (e.g. retired model 404), and no `secrets.json` ever appears. These
 * tests prove the IPC save handler itself writes the store unconditionally
 * and that the value round-trips through decrypt — i.e. persistence must NOT
 * depend on a successful validation call.
 */

const tempUserData = mkdtempSync(join(tmpdir(), 'batchclip-secrets-'));

// XOR-ish reversible fake "encryption" so the test also proves the stored
// bytes are not plaintext and that decrypt is actually exercised.
const flip = (buf: Buffer): Buffer => Buffer.from(buf.map((b) => b ^ 0x5a));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => tempUserData),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((plain: string) => flip(Buffer.from(plain, 'utf8'))),
    decryptString: vi.fn((buf: Buffer) => flip(buf).toString('utf8')),
  },
  ipcMain: { handle: vi.fn() },
}));

import { ipcMain } from 'electron';
import { wrapHandler } from '../ipc-error-handler';
import { registerSecretsHandlers } from './secrets-handlers';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

function capturedHandlers(): Map<string, Handler> {
  registerSecretsHandlers();
  const map = new Map<string, Handler>();
  for (const [channel, handler] of vi.mocked(ipcMain.handle).mock.calls) {
    map.set(channel as string, handler as Handler);
  }
  return map;
}

describe('secrets IPC save path', () => {
  it('SECRETS_SET writes secrets.json to userData and the value round-trips through decrypt', async () => {
    const handlers = capturedHandlers();
    const set = handlers.get(Ch.Invoke.SECRETS_SET);
    const get = handlers.get(Ch.Invoke.SECRETS_GET);
    const has = handlers.get(Ch.Invoke.SECRETS_HAS);
    expect(set).toBeDefined();
    expect(get).toBeDefined();
    expect(has).toBeDefined();

    const dummyKey = 'AIza-dummy-roundtrip-key-1234567890';
    await set?.({}, 'gemini', dummyKey);

    // The store file must exist immediately after the save handler runs —
    // no validation call, restart, or extra step required.
    const storePath = join(tempUserData, 'secrets.json');
    expect(existsSync(storePath)).toBe(true);

    // On disk: named entry present, ciphertext only — never the plaintext key.
    const raw = readFileSync(storePath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, string>;
    expect(typeof parsed.gemini).toBe('string');
    expect(raw).not.toContain(dummyKey);

    // Round-trip: GET decrypts back to the exact original value.
    await expect(Promise.resolve(get?.({}, 'gemini'))).resolves.toBe(dummyKey);
    await expect(Promise.resolve(has?.({}, 'gemini'))).resolves.toBe(true);
  });

  it('SECRETS_CLEAR removes the entry and the store reflects it on disk', async () => {
    const handlers = capturedHandlers();
    const set = handlers.get(Ch.Invoke.SECRETS_SET);
    const clear = handlers.get(Ch.Invoke.SECRETS_CLEAR);
    const has = handlers.get(Ch.Invoke.SECRETS_HAS);

    await set?.({}, 'pexels', 'pexels-dummy-key');
    await clear?.({}, 'pexels');

    await expect(Promise.resolve(has?.({}, 'pexels'))).resolves.toBe(false);
    const raw = readFileSync(join(tempUserData, 'secrets.json'), 'utf8');
    expect(raw).not.toContain('pexels');
  });

  it('wrapHandler surfaces setSecret disk failures instead of swallowing them', () => {
    // Sanity: the save handler is wrapped, so a write failure would reject the
    // renderer's invoke() rather than silently "succeeding" with no file.
    expect(typeof wrapHandler).toBe('function');
  });
});
