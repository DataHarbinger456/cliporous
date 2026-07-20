import { AI_PRICING } from '@shared/ai-usage';
import { AlertTriangle, ExternalLink, RotateCcw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStore } from '@/store';

const SOURCE_LABELS: Record<string, string> = {
  scoring: 'Viral scoring',
  rescore: 'Re-score',
  hooks: 'Hook text',
  'curiosity-gaps': 'Curiosity gaps',
  descriptions: 'Descriptions',
  'loop-optimizer': 'Loop optimizer',
  'story-arcs': 'Story arcs',
  variants: 'Clip variants',
  rehook: 'Re-hook text',
  stitching: 'Clip stitching',
  'broll-keywords': 'B-roll keywords',
  'emoji-moments': 'Emoji moments',
  'fake-comment': 'Comment overlay',
  'segment-images': 'Visual search',
};

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatCost(usd: number): string {
  if (usd < 0.001) return '< $0.001';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function AiUsageIndicator(): React.JSX.Element {
  const aiUsage = useStore((state) => state.aiUsage);
  const resetAiUsage = useStore((state) => state.resetAiUsage);
  const hasGeminiKey = useStore((state) => state.settings.geminiApiKey.trim().length > 0);
  const [open, setOpen] = useState(false);

  const totalTokens = aiUsage.totalPromptTokens + aiUsage.totalCompletionTokens;
  const modelRows = Object.entries(aiUsage.byModel).sort(
    (left, right) =>
      right[1].promptTokens +
      right[1].completionTokens -
      (left[1].promptTokens + left[1].completionTokens),
  );
  const sourceRows = Object.entries(aiUsage.bySource).sort(
    (left, right) =>
      right[1].promptTokens +
      right[1].completionTokens -
      (left[1].promptTokens + left[1].completionTokens),
  );
  const estimatedCost = modelRows.reduce((sum, [, usage]) => sum + usage.estimatedCostUsd, 0);
  const unpricedCalls = modelRows.reduce((sum, [, usage]) => sum + usage.unpricedCalls, 0);
  const pricedCalls = aiUsage.totalCalls - unpricedCalls;
  const tokenColor =
    totalTokens >= 200_000
      ? 'status-danger'
      : totalTokens >= 50_000
        ? 'status-warning'
        : 'text-muted-foreground';

  if (aiUsage.totalCalls === 0) {
    if (!hasGeminiKey) {
      return (
        <button
          type="button"
          onClick={() => void window.api?.openSettingsWindow?.()}
          title="Gemini is not configured. Open Connections in Settings."
          className="indicator-warning flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors hover:bg-warning/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Gemini not connected</span>
        </button>
      );
    }
    return (
      <div
        role="status"
        aria-label="No AI usage this session"
        className="text-muted-foreground/70 flex min-h-8 items-center gap-1 px-1 text-xs"
      >
        <Sparkles className="h-3 w-3" aria-hidden="true" />
      </div>
    );
  }

  const estimateLabel =
    pricedCalls === 0
      ? 'Unavailable'
      : unpricedCalls > 0
        ? `${formatCost(estimatedCost)} partial`
        : formatCost(estimatedCost);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`border-border hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tokenColor}`}
          title="AI usage and estimated cost this session"
          aria-label={`${formatTokens(totalTokens)} AI tokens this session. Open usage details.`}
        >
          <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="font-mono tabular-nums">{formatTokens(totalTokens)}</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-border bg-card flex items-center gap-2 border-b px-3 py-2.5">
          <Sparkles className="text-primary h-3.5 w-3.5" aria-hidden="true" />
          <div>
            <div className="text-xs font-semibold">AI usage this session</div>
            <div className="text-muted-foreground mt-0.5 text-[10px]">
              Successful content-analysis calls only
            </div>
          </div>
        </div>

        <div className="space-y-2.5 px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/50 rounded-md p-2">
              <div
                className={`font-mono text-lg leading-tight font-bold tabular-nums ${tokenColor}`}
              >
                {formatTokens(totalTokens)}
              </div>
              <div className="text-muted-foreground mt-0.5 text-[10px]">Total tokens</div>
            </div>
            <div className="bg-muted/50 rounded-md p-2">
              <div className="text-foreground font-mono text-lg leading-tight font-bold tabular-nums">
                {estimateLabel}
              </div>
              <div className="text-muted-foreground mt-0.5 text-[10px]">Estimated cost</div>
            </div>
          </div>

          <div className="text-muted-foreground flex justify-between gap-2 text-[10px]">
            <span>
              Input:{' '}
              <span className="text-foreground font-mono">
                {formatTokens(aiUsage.totalPromptTokens)}
              </span>
            </span>
            <span>
              Output:{' '}
              <span className="text-foreground font-mono">
                {formatTokens(aiUsage.totalCompletionTokens)}
              </span>
            </span>
            <span>
              Calls: <span className="text-foreground font-mono">{aiUsage.totalCalls}</span>
            </span>
          </div>
          <div className="text-muted-foreground text-[10px]">
            Session:{' '}
            <span className="text-foreground">
              {formatDuration(Date.now() - aiUsage.sessionStarted)}
            </span>
          </div>

          {unpricedCalls > 0 && (
            <div
              className="indicator-warning flex gap-2 rounded-md border border-warning/30 bg-warning/10 p-2 text-[10px]"
              role="status"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              <span>
                {unpricedCalls} {unpricedCalls === 1 ? 'call uses' : 'calls use'} an unlisted model.
                Its cost is excluded instead of guessed.
              </span>
            </div>
          )}
        </div>

        {sourceRows.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-3 py-2.5">
              <div className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wide uppercase">
                By feature
              </div>
              <div className="space-y-2">
                {sourceRows.map(([source, usage]) => {
                  const sourceTokens = usage.promptTokens + usage.completionTokens;
                  const width = totalTokens > 0 ? (sourceTokens / totalTokens) * 100 : 0;
                  const sourcePricedCalls = usage.calls - usage.unpricedCalls;
                  const sourceCost =
                    sourcePricedCalls === 0
                      ? 'Cost unavailable'
                      : `Estimated ${formatCost(usage.estimatedCostUsd)}${
                          usage.unpricedCalls > 0 ? ' partial' : ''
                        }`;
                  return (
                    <div key={source}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-[10px]">
                        <span className="text-foreground min-w-0 truncate">
                          {SOURCE_LABELS[source] ?? source}
                        </span>
                        <span className="text-muted-foreground shrink-0 font-mono">
                          {formatTokens(sourceTokens)} · {sourceCost}
                        </span>
                      </div>
                      <div className="bg-muted h-1 overflow-hidden rounded-full" aria-hidden="true">
                        <div
                          className="bg-primary h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <DropdownMenuSeparator />
        <div className="px-3 py-2.5">
          <div className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wide uppercase">
            Model ledger
          </div>
          <div className="space-y-2">
            {modelRows.map(([modelId, usage]) => {
              const pricing = (
                AI_PRICING.models as Record<
                  string,
                  { inputUsdPerMillionTokens: number; outputUsdPerMillionTokens: number }
                >
              )[modelId];
              return (
                <div key={modelId} className="border-border/70 rounded-md border p-2 text-[10px]">
                  <div className="text-foreground break-all font-mono font-medium">{modelId}</div>
                  <div className="text-muted-foreground mt-1 flex justify-between gap-2">
                    <span>
                      {formatTokens(usage.promptTokens)} in · {formatTokens(usage.completionTokens)}{' '}
                      out
                    </span>
                    <span className="shrink-0 font-mono">
                      {pricing
                        ? `Estimated ${formatCost(usage.estimatedCostUsd)}`
                        : 'Cost unavailable'}
                    </span>
                  </div>
                  {pricing && (
                    <div className="text-muted-foreground mt-1">
                      ${pricing.inputUsdPerMillionTokens}/1M input · $
                      {pricing.outputUsdPerMillionTokens}/1M output
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DropdownMenuSeparator />
        <div className="text-muted-foreground space-y-1 px-3 py-2.5 text-[10px]">
          <p>
            Estimated in USD at paid-tier list rates from provider-reported tokens. Free-tier calls
            may cost $0; your Gemini bill is the final record.
          </p>
          <button
            type="button"
            className="text-primary inline-flex min-h-6 items-center gap-1 rounded underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => window.open(AI_PRICING.sourceUrl, '_blank', 'noopener,noreferrer')}
          >
            Pricing {AI_PRICING.version} · checked {AI_PRICING.checkedDate}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>

        <DropdownMenuSeparator />
        <div className="px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-7 w-full justify-center gap-1 text-[10px]"
            onClick={() => {
              resetAiUsage();
              setOpen(false);
            }}
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Reset session
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
