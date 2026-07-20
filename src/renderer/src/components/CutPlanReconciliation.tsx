import type { LongformRenderReconciliation } from '@shared/types';
import { AlertTriangle, CheckCircle2, FileVideo2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { humanizeLongformKind } from '@/lib/longform-plan';

interface CutPlanReconciliationProps {
  reconciliation: LongformRenderReconciliation;
  compact?: boolean;
}

const ROWS = [
  ['Phrase overlays', 'phrases'],
  ['Content blocks', 'blocks'],
  ['Evidence cards', 'cards'],
] as const;

export function CutPlanReconciliation({
  reconciliation,
  compact = false,
}: CutPlanReconciliationProps): React.JSX.Element {
  const clean = reconciliation.fallbacks.length === 0;
  return (
    <Card className={compact ? 'p-4' : 'p-5'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {clean ? (
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            ) : (
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
            )}
            <h2 className="text-sm font-semibold">Plan to render check</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {clean
              ? 'Every approved visual beat rendered as planned.'
              : 'The export completed with the documented changes below.'}
          </p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {new Date(reconciliation.renderedAt).toLocaleString()}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-left text-xs">
          <caption className="sr-only">
            Approved Cut Plan counts compared with rendered output
          </caption>
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="pb-2 font-medium">Layer</th>
              <th className="pb-2 text-right font-medium">Planned</th>
              <th className="pb-2 text-right font-medium">Eligible</th>
              <th className="pb-2 text-right font-medium">Rendered</th>
              <th className="pb-2 text-right font-medium">Changed</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, key]) => {
              const count = reconciliation[key];
              return (
                <tr key={key} className="border-b border-border/70 last:border-0">
                  <th className="py-2.5 font-medium text-foreground">{label}</th>
                  <td className="py-2.5 text-right tabular-nums">{count.planned}</td>
                  <td className="py-2.5 text-right tabular-nums">{count.eligible}</td>
                  <td className="py-2.5 text-right tabular-nums text-success">{count.rendered}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    {count.dropped > 0 ? count.dropped : 'None'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {reconciliation.fallbacks.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="text-xs font-semibold">Fallbacks and dropped items</h3>
          <ul className="mt-2 space-y-2">
            {reconciliation.fallbacks.map((fallback) => (
              <li
                key={`${fallback.type}-${fallback.label ?? ''}-${fallback.reason}`}
                className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 text-xs"
              >
                <span className="rounded border border-warning/35 bg-warning/10 px-1.5 py-0.5 font-medium text-warning">
                  {fallback.count} {humanizeLongformKind(fallback.type)}
                </span>
                <span className="leading-relaxed text-muted-foreground">
                  {fallback.label ? `${fallback.label}: ` : ''}
                  {fallback.reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!compact && (
        <p className="mt-4 flex min-w-0 items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <FileVideo2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate" title={reconciliation.outputPath}>
            Output: {reconciliation.outputPath}
          </span>
        </p>
      )}
    </Card>
  );
}
