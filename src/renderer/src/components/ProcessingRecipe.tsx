import { DEFAULT_MIN_SCORE } from '@shared/constants';
import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { PromoModeWorkflow } from '@/components/PromoModeWorkflow';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  type ClipEndMode,
  DEFAULT_PROCESSING_CONFIG,
  type TargetDuration,
  useStore,
} from '@/store';

const DURATION_OPTIONS: ReadonlyArray<{
  value: TargetDuration;
  label: string;
  summary: string;
}> = [
  { value: 'auto', label: 'Auto (recommended)', summary: 'Auto length' },
  { value: '15-30', label: '15–30 sec · Quick hit', summary: '15–30 sec' },
  { value: '30-60', label: '30–60 sec · Standard', summary: '30–60 sec' },
  { value: '60-90', label: '60–90 sec · Deep dive', summary: '60–90 sec' },
  { value: '90-120', label: '90–120 sec · Mini lesson', summary: '90–120 sec' },
];

const END_MODE_OPTIONS: ReadonlyArray<{
  value: ClipEndMode;
  label: string;
  summary: string;
}> = [
  { value: 'loop-first', label: 'Keep the AI-selected cut', summary: 'AI-selected ending' },
  { value: 'completion-first', label: 'Finish the thought', summary: 'Complete ending' },
  { value: 'cliffhanger', label: 'Leave an open loop', summary: 'Cliffhanger ending' },
];

const SCORE_OPTIONS = [50, 60, DEFAULT_MIN_SCORE, 75, 80, 90] as const;

function selectedSummary<T extends string>(
  options: ReadonlyArray<{ value: T; summary: string }>,
  value: T,
): string {
  return options.find((option) => option.value === value)?.summary ?? value;
}

interface RecipeSwitchProps {
  id: string;
  label: string;
  description: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function RecipeSwitch({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: RecipeSwitchProps): React.JSX.Element {
  const descriptionId = `${id}-description`;
  return (
    <div className="flex min-h-16 items-start justify-between gap-4 py-3">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <p id={descriptionId} className="text-muted-foreground max-w-2xl text-xs leading-5">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={descriptionId}
        onCheckedChange={onCheckedChange}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

export interface ProcessingRecipeProps {
  disabled?: boolean;
}

/**
 * Project-scoped controls that shape the short-form pipeline before source ingest.
 * The three highest-impact choices stay visible; specialist behavior is disclosed
 * only when the creator asks for it.
 */
export function ProcessingRecipe({ disabled = false }: ProcessingRecipeProps): React.JSX.Element {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const processingConfig = useStore((state) => state.processingConfig);
  const minScore = useStore((state) => state.settings.minScore);
  const committedAudience = useStore(
    (state) => state.creativeBrief.committed?.audience.trim() ?? '',
  );
  const setProcessingConfig = useStore((state) => state.setProcessingConfig);
  const resetProcessingConfig = useStore((state) => state.resetProcessingConfig);
  const setMinScore = useStore((state) => state.setMinScore);

  const usesSafeDefaults =
    processingConfig.targetDuration === DEFAULT_PROCESSING_CONFIG.targetDuration &&
    processingConfig.enablePerfectLoop === DEFAULT_PROCESSING_CONFIG.enablePerfectLoop &&
    processingConfig.clipEndMode === DEFAULT_PROCESSING_CONFIG.clipEndMode &&
    processingConfig.enableMultiPart === DEFAULT_PROCESSING_CONFIG.enableMultiPart &&
    processingConfig.enableAiEdit === DEFAULT_PROCESSING_CONFIG.enableAiEdit &&
    processingConfig.targetAudience === DEFAULT_PROCESSING_CONFIG.targetAudience &&
    processingConfig.promoMode === DEFAULT_PROCESSING_CONFIG.promoMode &&
    minScore === DEFAULT_MIN_SCORE;

  const thresholdOptions = SCORE_OPTIONS.includes(minScore as (typeof SCORE_OPTIONS)[number])
    ? SCORE_OPTIONS
    : ([...SCORE_OPTIONS, minScore].sort((left, right) => left - right) as readonly number[]);

  const audienceValue = committedAudience || processingConfig.targetAudience;
  const audienceFromBrief = committedAudience.length > 0;
  const promoMode = processingConfig.promoMode;

  const resetRecipe = (): void => {
    resetProcessingConfig();
    if (minScore !== DEFAULT_MIN_SCORE) setMinScore(DEFAULT_MIN_SCORE);
  };

  return (
    <div className="grid gap-5">
      <Card className="overflow-hidden bg-card/90 shadow-none">
        <div className="flex flex-col gap-3 border-b border-border/80 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <SlidersHorizontal
              className="text-primary mt-0.5 h-5 w-5 shrink-0"
              strokeWidth={1.8}
              aria-hidden
            />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight">Clip recipe</h2>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                Set the result you want before BatchClip reads your footage. These choices save with
                this project.
              </p>
            </div>
          </div>
          {!usesSafeDefaults && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 self-start"
              disabled={disabled}
              onClick={resetRecipe}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Use safe defaults
            </Button>
          )}
        </div>

        {promoMode && (
          <div className="border-b border-primary/20 bg-primary/5 px-5 py-3 text-xs leading-5">
            <span className="font-medium">Promo Mode is on.</span>{' '}
            <span className="text-muted-foreground">
              Spoken markers replace target length, audience filtering, and score filtering.
            </span>
          </div>
        )}

        <div className="grid gap-4 px-5 py-5 min-[760px]:grid-cols-3">
          <div className="grid content-start gap-2">
            <Label htmlFor="recipe-target-duration">Target duration</Label>
            <Select
              value={processingConfig.targetDuration}
              disabled={disabled || promoMode}
              onValueChange={(value) =>
                setProcessingConfig({ targetDuration: value as TargetDuration })
              }
            >
              <SelectTrigger id="recipe-target-duration" aria-describedby="recipe-duration-help">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="recipe-duration-help" className="text-muted-foreground text-xs leading-5">
              Auto keeps complete ideas intact instead of cutting to a timer.
            </p>
          </div>

          <div className="grid content-start gap-2 min-[760px]:col-span-1">
            <Label htmlFor="recipe-target-audience">Target audience</Label>
            <Input
              id="recipe-target-audience"
              value={audienceValue}
              disabled={disabled || promoMode || audienceFromBrief}
              aria-describedby="recipe-audience-help"
              placeholder="e.g. first-time founders building an audience"
              onChange={(event) => setProcessingConfig({ targetAudience: event.target.value })}
            />
            <p id="recipe-audience-help" className="text-muted-foreground text-xs leading-5">
              {audienceFromBrief
                ? 'The saved creative brief supplies this audience.'
                : 'Leave blank for broad relevance, or name the exact viewer you want.'}
            </p>
          </div>

          <div className="grid content-start gap-2">
            <Label htmlFor="recipe-score-threshold">Score threshold</Label>
            <Select
              value={String(minScore)}
              disabled={disabled || promoMode}
              onValueChange={(value) => setMinScore(Number(value))}
            >
              <SelectTrigger id="recipe-score-threshold" aria-describedby="recipe-score-help">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {thresholdOptions.map((score) => (
                  <SelectItem key={score} value={String(score)}>
                    {score}+{score === DEFAULT_MIN_SCORE ? ' · Balanced' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="recipe-score-help" className="text-muted-foreground text-xs leading-5">
              Higher scores produce a shorter, more selective review queue.
            </p>
          </div>
        </div>

        <div className="border-t border-border/80 px-5 py-1">
          <RecipeSwitch
            id="recipe-promo-mode"
            label="Promo Mode"
            description="Build scripted clips around spoken markers, Creator Profile evidence, and one reviewed CTA plan."
            checked={promoMode}
            disabled={disabled}
            onCheckedChange={(nextPromoMode) => setProcessingConfig({ promoMode: nextPromoMode })}
          />
        </div>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-h-12 w-full items-center justify-between gap-4 border-t border-border/80 px-5 py-3 text-left transition-[background-color,color] duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              aria-label={`${advancedOpen ? 'Hide' : 'Show'} advanced clip controls`}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">Advanced clip shaping</span>
                <span className="text-muted-foreground mt-0.5 block text-xs">
                  {selectedSummary(END_MODE_OPTIONS, processingConfig.clipEndMode)} · Loop pass{' '}
                  {processingConfig.enablePerfectLoop ? 'on' : 'off'} · Parts{' '}
                  {processingConfig.enableMultiPart ? 'on' : 'off'} · AI edit{' '}
                  {processingConfig.enableAiEdit ? 'on' : 'off'} · Promo {promoMode ? 'on' : 'off'}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  'text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-150',
                  advancedOpen && 'rotate-180',
                )}
                aria-hidden
              />
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="border-t border-border/80 px-5 py-2">
              <div className="grid gap-x-8 min-[760px]:grid-cols-2">
                <div className="min-h-16 py-3">
                  <Label htmlFor="recipe-end-mode">Clip ending</Label>
                  <p id="recipe-end-help" className="text-muted-foreground mt-1 text-xs leading-5">
                    Choose whether each clip resolves cleanly or keeps tension open.
                  </p>
                  <Select
                    value={processingConfig.clipEndMode}
                    disabled={disabled}
                    onValueChange={(value) =>
                      setProcessingConfig({ clipEndMode: value as ClipEndMode })
                    }
                  >
                    <SelectTrigger
                      id="recipe-end-mode"
                      aria-describedby="recipe-end-help"
                      className="mt-2"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {END_MODE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <RecipeSwitch
                  id="recipe-perfect-loop"
                  label="Perfect loop pass"
                  description="Run an extra boundary pass. Finish-the-thought and cliffhanger modes can retime the cut."
                  checked={processingConfig.enablePerfectLoop}
                  disabled={disabled}
                  onCheckedChange={(enablePerfectLoop) =>
                    setProcessingConfig({ enablePerfectLoop })
                  }
                />

                <RecipeSwitch
                  id="recipe-multipart"
                  label="Multipart stories"
                  description="Allow connected moments to become labeled Part 1, Part 2 stories when a single clip cannot hold the full arc."
                  checked={processingConfig.enableMultiPart}
                  disabled={disabled || promoMode}
                  onCheckedChange={(enableMultiPart) => setProcessingConfig({ enableMultiPart })}
                />

                <RecipeSwitch
                  id="recipe-ai-edit"
                  label="AI editing"
                  description="Allow emphasis, B-roll, and sound plans during clip styling when those tools are available."
                  checked={processingConfig.enableAiEdit}
                  disabled={disabled}
                  onCheckedChange={(enableAiEdit) => setProcessingConfig({ enableAiEdit })}
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>
      {promoMode && <PromoModeWorkflow disabled={disabled} />}
    </div>
  );
}
