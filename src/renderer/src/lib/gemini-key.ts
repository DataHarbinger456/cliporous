/**
 * Gemini key resolution + missing-key detection.
 *
 * The Gemini key can live in two places: the in-memory settings slice (hydrated
 * on launch) and the main-process safeStorage secret. Resolving checks the store
 * first, then falls back to safeStorage — guarding against the race where a user
 * saved a key in the Settings window seconds before clicking Run.
 *
 * Keeping the canonical "missing key" message and its matcher here lets the
 * pipeline guard, the scoring stage, and the UI all agree on what a missing-key
 * failure looks like without duplicating string literals.
 */

/** Canonical message shown when scoring can't run because no key is configured. */
export const MISSING_GEMINI_KEY_MESSAGE =
  'Gemini API key is required for scoring. Open Settings and paste your key under "API Keys".';

/**
 * Resolve a usable Gemini key: prefer the store value, else fall back to the
 * main-process safeStorage secret. Returns '' when no key is available.
 */
export async function resolveGeminiKey(storeKey: string | null | undefined): Promise<string> {
  if (storeKey?.trim()) return storeKey;
  try {
    const fromMain = await window.api?.secrets?.get('gemini');
    if (fromMain?.trim()) return fromMain;
  } catch {
    // ignore — caller treats an empty return as "no key"
  }
  return '';
}

/** True when an error message stems from a missing Gemini key. */
export function isMissingGeminiKeyError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /gemini api key is required/i.test(message);
}
