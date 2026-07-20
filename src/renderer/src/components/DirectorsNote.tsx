import { MessageSquareQuote } from 'lucide-react';

interface DirectorsNoteProps {
  score: number;
  originalScore?: number | undefined;
  loopScore?: number | undefined;
  reasoning?: string | undefined;
  scoreSource?: 'ai' | 'manual' | undefined;
}

function normalizedScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function DirectorsNote({
  score,
  originalScore,
  loopScore,
  reasoning,
  scoreSource = 'ai',
}: DirectorsNoteProps): React.JSX.Element {
  const manuallyCreated = scoreSource === 'manual';
  const estimate = normalizedScore(score);
  const original = originalScore === undefined ? null : normalizedScore(originalScore);
  const loop = loopScore === undefined ? null : normalizedScore(loopScore);
  const scoreChanged = original !== null && original !== estimate;

  return (
    <section aria-labelledby="directors-note-heading" className="space-y-3">
      <div className="flex items-start gap-2.5">
        <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 id="directors-note-heading" className="text-sm font-semibold">
              Director&apos;s note
            </h3>
            <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
              {manuallyCreated ? 'Not scored' : `${estimate}/100 AI estimate`}
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {manuallyCreated
              ? 'This candidate came from a transcript range and has no AI estimate. Judge it manually before approving.'
              : 'This score is an AI estimate for review, not a prediction of audience performance.'}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-border bg-muted/35 px-3 py-2">
          <dt className="text-muted-foreground">{manuallyCreated ? 'Scoring' : 'AI estimate'}</dt>
          <dd className="mt-1 font-mono text-base font-semibold tabular-nums text-foreground">
            {manuallyCreated ? 'Not scored' : `${estimate}/100`}
          </dd>
        </div>
        {loop !== null ? (
          <div className="rounded-md border border-border bg-muted/35 px-3 py-2">
            <dt className="text-muted-foreground">Loop quality estimate</dt>
            <dd className="mt-1 font-mono text-base font-semibold tabular-nums text-foreground">
              {loop}/100
            </dd>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted/35 px-3 py-2">
            <dt className="text-muted-foreground">Review status</dt>
            <dd className="mt-1 font-medium text-foreground">Needs your judgment</dd>
          </div>
        )}
      </dl>

      {scoreChanged && !manuallyCreated && (
        <p className="text-xs text-muted-foreground">
          Earlier estimate: <span className="font-mono tabular-nums">{original}/100</span>. The
          model changed its assessment after rescoring.
        </p>
      )}

      <div className="rounded-md border border-border bg-card px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {manuallyCreated ? 'Editorial note' : 'Model rationale'}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-foreground">
          {reasoning?.trim() ||
            (manuallyCreated
              ? 'No note was saved with this transcript selection.'
              : 'No rationale was saved with this estimate.')}
        </p>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Check the opening, context, pacing, and fit for your audience before approving.
      </p>
    </section>
  );
}
