import { AlertCircle, Check, LoaderCircle, RotateCcw, WandSparkles } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { EditorialTextComparison } from '@/components/EditorialTextComparison';
import { Button } from '@/components/ui/button';
import { resolveGeminiKey } from '@/lib/gemini-key';

interface AppliedHook {
  before: string;
  after: string;
}

interface HookSuggestion {
  original: string;
  improved: string;
}

interface HookPolishProps {
  clipId: string;
  transcript: string;
  hookText: string;
  geminiKey: string;
  onApply: (hookText: string) => void;
  onOpenSettings?: () => void;
}

function hookWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function editorialRead(original: string, improved: string): string {
  const beforeCount = hookWordCount(original);
  const afterCount = hookWordCount(improved);
  const lengthNote =
    afterCount < beforeCount
      ? `Cuts the opening from ${beforeCount} to ${afterCount} words.`
      : `Keeps the opening to ${afterCount} words.`;
  const shapeNote = improved.trim().endsWith('?')
    ? 'The question opens a curiosity gap without adding context the clip cannot support.'
    : 'The line is shaped to land silently in the first two seconds.';
  return `${lengthNote} ${shapeNote}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The hook service did not return a usable suggestion.';
}

/**
 * Editorial adaptation of EZ Coder's prompt enhancer: generate one option,
 * compare it with the creator's current line, then require an explicit Apply.
 */
export function HookPolish({
  clipId,
  transcript,
  hookText,
  geminiKey,
  onApply,
  onOpenSettings,
}: HookPolishProps): React.JSX.Element {
  const headingId = useId();
  const requestId = useRef(0);
  const [suggestion, setSuggestion] = useState<HookSuggestion | null>(null);
  const [applied, setApplied] = useState<AppliedHook | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingKey, setMissingKey] = useState(false);

  const generate = async (): Promise<void> => {
    const currentRequest = ++requestId.current;
    setGenerating(true);
    setError(null);
    setMissingKey(false);

    try {
      const apiKey = await resolveGeminiKey(geminiKey);
      if (!apiKey) {
        setMissingKey(true);
        throw new Error('Add a Gemini API key in Settings, then try again.');
      }
      const improved = (await window.api.generateHookText(apiKey, transcript)).trim();
      if (!improved) throw new Error('The hook service returned an empty suggestion.');
      if (requestId.current !== currentRequest) return;
      setSuggestion({ original: hookText, improved });
    } catch (caught) {
      if (requestId.current !== currentRequest) return;
      setError(errorMessage(caught));
    } finally {
      if (requestId.current === currentRequest) setGenerating(false);
    }
  };

  const handleApply = (): void => {
    if (!suggestion) return;
    onApply(suggestion.improved);
    setApplied({ before: suggestion.original, after: suggestion.improved });
    setSuggestion(null);
  };

  const handleUndo = (): void => {
    if (!applied) return;
    onApply(applied.before);
    setApplied(null);
  };

  const appliedStillCurrent = applied?.after === hookText;

  return (
    <section
      aria-labelledby={headingId}
      data-hook-polish={clipId}
      className="space-y-3 rounded-xl border border-border bg-card p-3.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <WandSparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 id={headingId} className="text-sm font-semibold">
              Hook Polish
            </h3>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Ask AI for one stronger opening. Your current hook stays unchanged until you apply it.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void generate()}
          disabled={generating}
        >
          {generating ? (
            <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <WandSparkles aria-hidden="true" />
          )}
          {generating ? 'Polishing…' : suggestion ? 'Try Another' : 'Polish Hook'}
        </Button>
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {generating
          ? 'Generating a hook suggestion.'
          : suggestion
            ? 'Hook suggestion ready for review.'
            : appliedStillCurrent
              ? 'Hook suggestion applied.'
              : ''}
      </div>

      {generating && !suggestion && (
        <div
          className="space-y-2 rounded-lg border border-border bg-muted/30 p-3"
          aria-hidden="true"
        >
          <div className="h-3 w-28 animate-pulse rounded bg-muted-foreground/20 motion-reduce:animate-none" />
          <div className="h-5 w-4/5 animate-pulse rounded bg-muted-foreground/15 motion-reduce:animate-none" />
          <div className="h-3 w-full animate-pulse rounded bg-muted-foreground/10 motion-reduce:animate-none" />
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">Your hook is unchanged</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {missingKey
                  ? error
                  : 'The suggestion could not be generated. Check your connection and try again.'}
              </p>
              {!missingKey && (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-foreground">Details</summary>
                  <p className="mt-1 break-words">{error}</p>
                </details>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void generate()}>
                  Try Again
                </Button>
                {missingKey && onOpenSettings && (
                  <Button type="button" size="sm" variant="secondary" onClick={onOpenSettings}>
                    Open Settings
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {suggestion && (
        <div className="space-y-3 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
          <EditorialTextComparison
            original={suggestion.original}
            improved={suggestion.improved}
            originalLabel="Current opening"
            improvedLabel="Polished opening"
          />
          <div className="rounded-lg border border-border bg-muted/25 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Editorial read
            </p>
            <p className="mt-1 text-xs leading-relaxed text-foreground">
              {editorialRead(suggestion.original, suggestion.improved)}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Generated from this clip&apos;s transcript. Judge clarity and audience fit before
              applying.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
              Keep Original
            </Button>
            <Button type="button" size="sm" onClick={handleApply}>
              <Check aria-hidden="true" />
              Apply
            </Button>
          </div>
        </div>
      )}

      {appliedStillCurrent && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/35 bg-primary/5 px-3 py-2"
        >
          <p className="text-xs font-medium text-foreground">Polished hook applied to this clip.</p>
          <Button type="button" size="sm" variant="ghost" onClick={handleUndo}>
            <RotateCcw aria-hidden="true" />
            Undo
          </Button>
        </div>
      )}
    </section>
  );
}
