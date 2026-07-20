import { AlertCircle, Check, LoaderCircle, RotateCcw, Sparkles } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { EditorialTextComparison } from '@/components/EditorialTextComparison';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { resolveGeminiKey } from '@/lib/gemini-key';

interface RehookEditorProps {
  transcript: string;
  clipStart: number;
  clipEnd: number;
  hookDisplayDuration: number;
  displayDuration: number;
  enabled: boolean;
  text: string;
  geminiKey: string;
  onEnabledChange: (enabled: boolean) => void;
  onTextChange: (text: string) => void;
  onTextCommit: (text: string) => void;
}

interface RehookSuggestion {
  original: string;
  improved: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'The re-hook service did not return a usable suggestion.';
}

/** Per-clip controls for the registered mid-clip re-hook render feature. */
export function RehookEditor({
  transcript,
  clipStart,
  clipEnd,
  hookDisplayDuration,
  displayDuration,
  enabled,
  text,
  geminiKey,
  onEnabledChange,
  onTextChange,
  onTextCommit,
}: RehookEditorProps): React.JSX.Element {
  const headingId = useId();
  const switchId = useId();
  const inputId = useId();
  const requestId = useRef(0);
  const [suggestion, setSuggestion] = useState<RehookSuggestion | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingKey, setMissingKey] = useState(false);
  const clipDuration = Math.max(0, clipEnd - clipStart);
  const visibleAtTiming = clipDuration > hookDisplayDuration;

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
      const improved = (
        await window.api.generateRehookText(apiKey, transcript, clipStart, clipEnd)
      ).trim();
      if (!improved) throw new Error('The re-hook service returned an empty suggestion.');
      if (requestId.current !== currentRequest) return;
      setSuggestion({ original: text, improved });
    } catch (caught) {
      if (requestId.current !== currentRequest) return;
      setError(errorMessage(caught));
    } finally {
      if (requestId.current === currentRequest) setGenerating(false);
    }
  };

  const handleApply = (): void => {
    if (!suggestion) return;
    onTextChange(suggestion.improved);
    onTextCommit(suggestion.improved);
    setSuggestion(null);
  };

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="text-sm font-semibold">
            Mid-clip re-hook
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Reset attention after the opening hook with one short, transcript-specific line.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Label htmlFor={switchId} className="text-xs text-muted-foreground">
            {enabled ? 'On' : 'Off'}
          </Label>
          <Switch
            id={switchId}
            checked={enabled}
            onCheckedChange={onEnabledChange}
            aria-label="Show a mid-clip re-hook for this clip"
          />
        </div>
      </div>

      <div
        className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-xs leading-relaxed"
        aria-live="polite"
      >
        {visibleAtTiming ? (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Timing:</span> appears at{' '}
            <span className="font-mono tabular-nums text-foreground">
              {hookDisplayDuration.toFixed(1)}s
            </span>{' '}
            for{' '}
            <span className="font-mono tabular-nums text-foreground">
              {displayDuration.toFixed(1)}s
            </span>
            . The rendered preview updates after you apply or edit the line.
          </p>
        ) : (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Timing check:</span> this clip ends before{' '}
            {hookDisplayDuration.toFixed(1)}s, so the re-hook will not appear.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={inputId}>Re-hook text</Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {text.length} characters
          </span>
        </div>
        <Input
          id={inputId}
          value={text}
          disabled={!enabled}
          placeholder="Generate or write a re-hook"
          onChange={(event) => onTextChange(event.target.value)}
          onBlur={() => onTextCommit(text)}
        />
        {!text.trim() && enabled && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Until you apply custom text, the renderer uses its automatic fallback phrase.
          </p>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {text.trim() && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!enabled}
            onClick={() => {
              onTextChange('');
              onTextCommit('');
              setSuggestion(null);
            }}
          >
            <RotateCcw aria-hidden="true" />
            Use Automatic
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!enabled || generating || !visibleAtTiming}
          onClick={() => void generate()}
        >
          {generating ? (
            <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Sparkles aria-hidden="true" />
          )}
          {generating ? 'Generating…' : suggestion ? 'Try Another' : 'Generate Re-hook'}
        </Button>
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {generating ? 'Generating a re-hook.' : suggestion ? 'Re-hook ready for review.' : ''}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">Current re-hook is unchanged</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {missingKey
                  ? error
                  : 'A new line could not be generated. Check your connection and try again.'}
              </p>
              {!missingKey && (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-foreground">Details</summary>
                  <p className="mt-1 break-words">{error}</p>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {suggestion && (
        <div className="space-y-3 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
          <EditorialTextComparison
            original={suggestion.original}
            improved={suggestion.improved}
            originalLabel="Current re-hook"
            improvedLabel="Generated re-hook"
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Generated from the clip transcript to add context before the second half. Review the
            claim before applying.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
              Keep Current
            </Button>
            <Button type="button" size="sm" onClick={handleApply}>
              <Check aria-hidden="true" />
              Apply Re-hook
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
