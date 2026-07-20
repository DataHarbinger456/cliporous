const REDACTED = '[REDACTED]';

const SENSITIVE_FIELD_NAMES = new Set([
  'apikey',
  'authorization',
  'clientsecret',
  'credential',
  'credentials',
  'fal',
  'falapikey',
  'falkey',
  'gemini',
  'geminiapikey',
  'geminikey',
  'pexels',
  'pexelsapikey',
  'pexelskey',
  'proxyauthorization',
  'refreshtoken',
  'accesstoken',
]);

const registeredCredentialValues = new Set<string>();

function normalizeFieldName(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function isCredentialFieldName(name: string): boolean {
  const normalized = normalizeFieldName(name);
  if (SENSITIVE_FIELD_NAMES.has(normalized)) return true;

  const namesProvider =
    normalized.startsWith('gemini') ||
    normalized.startsWith('pexels') ||
    normalized.startsWith('falai');
  return namesProvider && /(key|token|secret|credential)/.test(normalized);
}

export interface CredentialStripResult<T> {
  value: T;
  removedFields: string[];
}

/**
 * Remove credential-bearing fields without mutating the input. This is used at
 * every project/recovery write boundary and by the opt-in legacy-file cleaner.
 */
export function stripCredentialFields<T>(input: T): CredentialStripResult<T> {
  const removedFields: string[] = [];

  const visit = (value: unknown, path: string): unknown => {
    if (Array.isArray(value)) {
      return value.map((item, index) => visit(item, `${path}[${index}]`));
    }
    if (value === null || typeof value !== 'object') return value;

    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (isCredentialFieldName(key)) {
        removedFields.push(childPath);
        continue;
      }
      output[key] = visit(child, childPath);
    }
    return output;
  };

  return { value: visit(input, '') as T, removedFields };
}

/** Register a runtime credential so even unstructured provider errors are redacted. */
export function registerCredentialValue(value: string | null | undefined): void {
  const trimmed = value?.trim();
  if (trimmed && trimmed.length >= 4) registeredCredentialValues.add(trimmed);
}

/** Test/support hook. Runtime code normally keeps old values registered for the session. */
export function clearRegisteredCredentialValues(): void {
  registeredCredentialValues.clear();
}

export function redactCredentialText(text: string): string {
  let redacted = text;

  const knownValues = Array.from(registeredCredentialValues).sort((a, b) => b.length - a.length);
  for (const value of knownValues) {
    redacted = redacted.split(value).join(REDACTED);
  }

  redacted = redacted
    .replace(/\bAIza[\w-]{20,}\b/g, REDACTED)
    .replace(/\bBearer\s+[^\s,;"'}\]]+/gi, `Bearer ${REDACTED}`)
    .replace(/([?&](?:key|api_?key|access_?token|token)=)[^&\s]+/gi, `$1${REDACTED}`)
    .replace(
      /((?:gemini|pexels|fal(?:\.ai)?)[-_ ]*(?:api[-_ ]*)?(?:key|token|secret)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi,
      `$1${REDACTED}`,
    )
    .replace(
      /("?(?:geminiApiKey|pexelsApiKey|falApiKey|apiKey|accessToken|refreshToken|clientSecret|authorization)"?\s*:\s*)(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi,
      `$1"${REDACTED}"`,
    );

  return redacted;
}

/** Remove credential fields and redact known values throughout arbitrary log data. */
export function redactCredentialsForLogging(input: unknown): unknown {
  const seen = new WeakSet<object>();

  const visit = (value: unknown): unknown => {
    if (typeof value === 'string') return redactCredentialText(value);
    if (value instanceof Error) {
      return {
        name: value.name,
        message: redactCredentialText(value.message),
        stack: value.stack ? redactCredentialText(value.stack) : undefined,
      };
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (isCredentialFieldName(key)) continue;
      output[key] = visit(child);
    }
    return output;
  };

  return visit(input);
}
