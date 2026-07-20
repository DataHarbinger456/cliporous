import type { ConnectionValidationResult } from '@shared/connections';

const PEXELS_HEALTH_URL = 'https://api.pexels.com/v1/search?query=studio&per_page=1';

export async function validatePexelsKey(
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<ConnectionValidationResult> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) return { valid: false, error: 'API key is empty' };

  try {
    const response = await fetcher(PEXELS_HEALTH_URL, {
      headers: { Authorization: trimmedKey },
    });

    if (response.ok) return { valid: true };
    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: 'Pexels rejected this API key' };
    }
    if (response.status === 429) {
      return {
        valid: true,
        warning: 'Pexels accepted the key, but the account is temporarily rate-limited.',
      };
    }
    if (response.status >= 500) {
      return {
        valid: false,
        error: 'Pexels is unavailable right now. Your saved key was not changed.',
      };
    }
    return {
      valid: false,
      error: `Pexels could not test this key (status ${response.status}).`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network/i.test(message)) {
      return {
        valid: false,
        error: 'Network error. Reconnect, then test Pexels again.',
      };
    }
    return {
      valid: false,
      error: 'Pexels could not be reached. Your saved key was not changed.',
    };
  }
}
