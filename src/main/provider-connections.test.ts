import { describe, expect, it, vi } from 'vitest';
import { validatePexelsKey } from './provider-connections';

describe('validatePexelsKey', () => {
  it('reports a tested connection without exposing the key', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    await expect(validatePexelsKey('pexels-secret', fetcher)).resolves.toEqual({ valid: true });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('api.pexels.com'),
      expect.objectContaining({ headers: { Authorization: 'pexels-secret' } }),
    );
  });

  it('separates an invalid key from temporary provider degradation', async () => {
    const invalidFetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const limitedFetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });

    await expect(validatePexelsKey('bad-key', invalidFetch)).resolves.toEqual({
      valid: false,
      error: 'Pexels rejected this API key',
    });
    await expect(validatePexelsKey('valid-but-limited', limitedFetch)).resolves.toEqual({
      valid: true,
      warning: 'Pexels accepted the key, but the account is temporarily rate-limited.',
    });
  });

  it('preserves the configured value when the health check cannot reach Pexels', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('fetch failed'));

    await expect(validatePexelsKey('saved-key', fetcher)).resolves.toEqual({
      valid: false,
      error: 'Network error. Reconnect, then test Pexels again.',
    });
  });
});
