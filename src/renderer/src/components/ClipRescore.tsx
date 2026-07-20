import { AlertCircle, ArrowRight, Check, Gauge, LoaderCircle, RotateCcw } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { EditorialTextComparison } from '@/components/EditorialTextComparison';
import { Button } from '@/components/ui/button';
import { resolveGeminiKey } from '@/lib/gemini-key';
import type { ClipCandidate } from '@/store/types';

export interface ClipScoreReading {
  score: number;
  reasoning: string;
  hookText: string;
}

interface ClipRescoreProps {
  clip: Pick<
    ClipCandidate,
    | 'id'
    | 'text'
    | 'duration'
    | 'startTime'
    | 'endTime'
    | 'status'
    | 'score'
    | 'reasoning'
    | 'hookText'
  >;
  geminiKey: string;
  onApply: (reading: ClipScoreReading) => void;
}

interface AppliedReading {
  before: ClipScoreReading;
  after: ClipScoreReading;
}

function statusLabel(status: ClipCandidate['status']): string {
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  return 'Unreviewed';
}

function formatBoundary(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(1).padStart(4, '0')}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'The scoring service did not return a usable result.';
}

/** One-clip rescore proposal. Results remain staged until the creator applies them. */
export function ClipRescore({ clip, geminiKey, onApply }: ClipRescoreProps): React.JSX.Element {
  const headingId = useId();
  const requestId = useRef(0);
  const [proposal, setProposal] = useState<ClipScoreReading | null>(null);
  const [applied, setApplied] = useState<AppliedReading | null>(null);
  const [rescoring, setRescoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingKey, setMissingKey] = useState(false);

  const rescore = async (): Promise<void> => {
    const currentRequest = ++requestId.current;
    setRescoring(true);
    setError(null);
    setMissingKey(false);

    try {
      const apiKey = await resolveGeminiKey(geminiKey);
      if (!apiKey) {
        setMissingKey(true);
        throw new Error('Add a Gemini API key in Settings, then try again.');
      }
      const result = await window.api.rescoreSingleClip(apiKey, clip.text, clip.duration);
      if (requestId.current !== currentRequest) return;
      setProposal({
        score: result.score,
        reasoning: result.reasoning.trim(),
        hookText: result.hookText.trim(),
      });
    } catch (caught) {
      if (requestId.current !== currentRequest) return;
      setError(errorMessage(caught));
    } finally {
      if (requestId.current === currentRequest) setRescoring(false);
    }
  };

  const handleApply = (): void => {
    if (!proposal) return;
    const before = { score: clip.score, reasoning: clip.reasoning, hookText: clip.hookText };
    onApply(proposal);
    setApplied({ before, after: proposal });
    setProposal(null);
  };

  const handleUndo = (): void => {
    if (!applied) return;
    onApply(applied.before);
    setApplied(null);
  };

  const appliedStillCurrent =
    applied !== null &&
    applied.after.score === clip.score &&
    applied.after.reasoning === clip.reasoning &&
    (applied.after.hookText || clip.hookText) === clip.hookText;

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 id={headingId} className="text-sm font-semibold">
              Fresh AI read
            </h3>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Re-score this clip after hook or trim edits. The result is staged for review first.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={rescoring}
          onClick={() => void rescore()}
        >
          {rescoring && (
            <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          )}
          {rescoring ? 'Re-scoring…' : proposal ? 'Score Again' : 'Re-score Clip'}
        </Button>
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {rescoring
          ? 'Re-scoring this clip.'
          : proposal
            ? 'A fresh score is ready for review.'
            : appliedStillCurrent
              ? 'The fresh score was applied.'
              : ''}
      </div>

      {rescoring && !proposal && (
        <div className="grid grid-cols-2 gap-2" aria-hidden="true">
          <div className="h-16 animate-pulse rounded-lg bg-muted/60 motion-reduce:animate-none" />
          <div className="h-16 animate-pulse rounded-lg bg-muted/60 motion-reduce:animate-none" />
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">Current clip details are safe</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {missingKey
                  ? error
                  : 'The fresh score could not be generated. Try again when the connection is ready.'}
              </p>
              {!missingKey && (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-foreground">Details</summary>
                  <p className="mt-1 break-words">{error}</p>
                </details>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => void rescore()}
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      )}

      {proposal && (
        <div className="space-y-3 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
          <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Current
              </p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
                {Math.round(clip.score)}
                <span className="text-xs text-muted-foreground">/100</span>
              </p>
            </div>
            <ArrowRight className="mt-5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <div className="rounded-lg border border-primary/35 bg-primary/5 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-primary">
                Proposed
              </p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
                {Math.round(proposal.score)}
                <span className="text-xs text-muted-foreground">/100</span>
              </p>
            </div>
          </div>

          <EditorialTextComparison
            original={clip.hookText}
            improved={proposal.hookText || clip.hookText}
            originalLabel="Current hook"
            improvedLabel="Proposed hook"
          />

          <div className="rounded-lg border border-border bg-card px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Proposed Director&apos;s note
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-foreground">
              {proposal.reasoning || 'The model did not provide a rationale for this score.'}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              This is an AI estimate for editorial review, not a prediction of audience performance.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/25 px-3 py-2.5 text-xs leading-relaxed">
            <p className="font-semibold text-foreground">Apply changes</p>
            <p className="mt-1 text-muted-foreground">
              Score, Director&apos;s note, and proposed hook will update. Trim{' '}
              <span className="font-mono text-foreground">
                {formatBoundary(clip.startTime)} to {formatBoundary(clip.endTime)}
              </span>{' '}
              and review status{' '}
              <span className="font-medium text-foreground">{statusLabel(clip.status)}</span> stay
              unchanged.
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setProposal(null)}>
              Keep Current
            </Button>
            <Button type="button" size="sm" onClick={handleApply}>
              <Check aria-hidden="true" />
              Apply Score + Hook
            </Button>
          </div>
        </div>
      )}

      {appliedStillCurrent && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/35 bg-primary/5 px-3 py-2"
        >
          <p className="text-xs font-medium text-foreground">
            Fresh score, note, and hook applied.
          </p>
          <Button type="button" size="sm" variant="ghost" onClick={handleUndo}>
            <RotateCcw aria-hidden="true" />
            Undo
          </Button>
        </div>
      )}
    </section>
  );
}
