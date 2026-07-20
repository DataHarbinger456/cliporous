import { cn } from '@/lib/utils';

export type WordChange = 'same' | 'removed' | 'added';

export interface DiffWord {
  text: string;
  change: WordChange;
}

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * A small LCS word diff for short editorial lines. Hook and re-hook copy is
 * intentionally brief, so a deterministic O(n*m) pass is clearer than a
 * general-purpose diff dependency.
 */
export function compareEditorialText(
  original: string,
  improved: string,
): { original: DiffWord[]; improved: DiffWord[] } {
  const before = words(original);
  const after = words(improved);
  const rows = before.length + 1;
  const columns = after.length + 1;
  const lcs = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

  for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex -= 1) {
      lcs[beforeIndex][afterIndex] =
        before[beforeIndex]?.toLocaleLowerCase() === after[afterIndex]?.toLocaleLowerCase()
          ? 1 + (lcs[beforeIndex + 1]?.[afterIndex + 1] ?? 0)
          : Math.max(
              lcs[beforeIndex + 1]?.[afterIndex] ?? 0,
              lcs[beforeIndex]?.[afterIndex + 1] ?? 0,
            );
    }
  }

  const matchedBefore = new Set<number>();
  const matchedAfter = new Set<number>();
  let beforeIndex = 0;
  let afterIndex = 0;
  while (beforeIndex < before.length && afterIndex < after.length) {
    if (before[beforeIndex]?.toLocaleLowerCase() === after[afterIndex]?.toLocaleLowerCase()) {
      matchedBefore.add(beforeIndex);
      matchedAfter.add(afterIndex);
      beforeIndex += 1;
      afterIndex += 1;
    } else if (
      (lcs[beforeIndex + 1]?.[afterIndex] ?? 0) >= (lcs[beforeIndex]?.[afterIndex + 1] ?? 0)
    ) {
      beforeIndex += 1;
    } else {
      afterIndex += 1;
    }
  }

  return {
    original: before.map((text, index) => ({
      text,
      change: matchedBefore.has(index) ? 'same' : 'removed',
    })),
    improved: after.map((text, index) => ({
      text,
      change: matchedAfter.has(index) ? 'same' : 'added',
    })),
  };
}

function DiffLine({ words: diffWords }: { words: DiffWord[] }): React.JSX.Element {
  return (
    <p className="min-h-12 text-sm font-medium leading-6 text-foreground">
      {diffWords.length > 0 ? (
        diffWords.map((word, index) => (
          <span key={`${word.text}-${index}`}>
            {index > 0 ? ' ' : null}
            <span
              className={cn(
                'box-decoration-clone rounded-sm px-0.5',
                word.change === 'removed' &&
                  'bg-destructive/10 text-muted-foreground line-through decoration-destructive/70',
                word.change === 'added' &&
                  'bg-primary/15 text-foreground underline decoration-primary decoration-2 underline-offset-4',
              )}
            >
              {word.text}
            </span>
          </span>
        ))
      ) : (
        <span className="font-normal italic text-muted-foreground">No custom text yet</span>
      )}
    </p>
  );
}

interface EditorialTextComparisonProps {
  original: string;
  improved: string;
  originalLabel?: string;
  improvedLabel?: string;
  className?: string;
}

/** Side-by-side editorial copy comparison with non-color change labels. */
export function EditorialTextComparison({
  original,
  improved,
  originalLabel = 'Original',
  improvedLabel = 'Improved',
  className,
}: EditorialTextComparisonProps): React.JSX.Element {
  const comparison = compareEditorialText(original, improved);

  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
      <section
        className="rounded-lg border border-border bg-muted/30 p-3"
        aria-label={originalLabel}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {originalLabel}
          </h4>
          <span className="text-[11px] text-muted-foreground">Removed text is struck out</span>
        </div>
        <DiffLine words={comparison.original} />
      </section>
      <section
        className="rounded-lg border border-primary/35 bg-primary/5 p-3"
        aria-label={improvedLabel}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-primary">
            {improvedLabel}
          </h4>
          <span className="text-[11px] text-muted-foreground">Added text is underlined</span>
        </div>
        <DiffLine words={comparison.improved} />
      </section>
    </div>
  );
}
