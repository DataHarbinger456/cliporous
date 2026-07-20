import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clipboard,
  FileText,
  Film,
  Layers3,
  Megaphone,
  Plus,
  ScanFace,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CreatorAssetField } from '@/components/CreatorAssetField';
import { CreatorProfileDialog } from '@/components/CreatorProfileDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toMediaFileUrl } from '@/lib/media-url';
import {
  createCreatorProfile,
  updateCreatorProfile,
  useCreatorProfiles,
} from '@/services/creator-profiles';
import { useStore } from '@/store';
import type { PromoCtaSource, PromoEvidenceCategory, PromoScriptBeat } from '@/store/types';

const EMPTY_PATHS: string[] = [];

const MARKER_ORDINALS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
] as const;

const EVIDENCE_OPTIONS: ReadonlyArray<{
  value: PromoEvidenceCategory;
  label: string;
  help: string;
}> = [
  { value: 'none', label: 'Talking head only', help: 'No capture requested' },
  { value: 'app-ui', label: 'Product capture', help: 'App screen or workflow' },
  { value: 'community-proof', label: 'Social proof', help: 'Result or testimonial' },
  { value: 'growth-stat', label: 'Measured result', help: 'Number or outcome' },
];

function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

function mediaKind(path: string): 'image' | 'video' | 'file' {
  if (/\.(?:png|jpe?g|webp)$/i.test(path)) return 'image';
  if (/\.(?:mp4|mov|webm|m4v)$/i.test(path)) return 'video';
  return 'file';
}

function markerFor(index: number): string {
  return `Clip ${MARKER_ORDINALS[index] ?? String(index + 1)}`;
}

function newBeat(): PromoScriptBeat {
  return {
    id: globalThis.crypto.randomUUID(),
    script: '',
    evidenceCategory: 'none',
    evidenceAssetPath: null,
  };
}

function PreviewAsset({ path }: { path: string }): React.JSX.Element {
  const kind = mediaKind(path);
  if (kind === 'image') {
    return (
      <img
        src={toMediaFileUrl(path)}
        alt={`Evidence preview: ${basename(path)}`}
        className="h-full w-full object-cover"
      />
    );
  }
  const Icon = kind === 'video' ? Film : FileText;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-muted px-4 text-center">
      <Icon className="h-7 w-7 text-muted-foreground" aria-hidden />
      <span className="line-clamp-2 text-xs font-medium">{basename(path)}</span>
    </div>
  );
}

interface WorkflowStatusProps {
  done: boolean;
  label: string;
  detail: string;
  warning?: boolean;
}

function WorkflowStatus({ done, label, detail, warning = false }: WorkflowStatusProps) {
  const Icon = done ? CheckCircle2 : warning ? AlertTriangle : Circle;
  return (
    <li className="flex min-w-0 items-start gap-2 py-2">
      <Icon
        className={
          done
            ? 'mt-0.5 h-4 w-4 shrink-0 text-success'
            : warning
              ? 'mt-0.5 h-4 w-4 shrink-0 text-warning'
              : 'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground'
        }
        aria-hidden
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium">{label}</span>
        <span className="block text-xs leading-5 text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}

/**
 * Project-scoped Promo Mode planner. Reuses Creator Profiles as the Brand Pack,
 * keeps AI-script output editable, and exposes the exact evidence/B-roll render order.
 */
export function PromoModeWorkflow({ disabled = false }: { disabled?: boolean }): React.JSX.Element {
  const profiles = useCreatorProfiles();
  const projectProfile = useStore((state) => state.creatorProfile);
  const promoPlan = useStore((state) => state.promoPlan);
  const creativeBrief = useStore((state) => state.creativeBrief);
  const promoSettings = useStore((state) => state.settings.promo);
  const setCreatorProfile = useStore((state) => state.setCreatorProfile);
  const setPromoPlan = useStore((state) => state.setPromoPlan);
  const setPromoForceCta = useStore((state) => state.setPromoForceCta);
  const [profileOpen, setProfileOpen] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [missingPaths, setMissingPaths] = useState<Set<string>>(new Set());

  const profile = profiles.find((item) => item.id === projectProfile.profileId) ?? null;
  const evidencePaths = profile?.evidenceAssetPaths ?? EMPTY_PATHS;
  const ctaPaths = profile?.callToAction.assetPaths ?? EMPTY_PATHS;
  const allPaths = useMemo(() => [...evidencePaths, ...ctaPaths], [ctaPaths, evidencePaths]);

  useEffect(() => {
    let active = true;
    if (allPaths.length === 0) {
      setMissingPaths(new Set());
      setHealthChecking(false);
      return;
    }
    setHealthChecking(true);
    void window.api
      .checkCreatorAssets(allPaths)
      .then((results) => {
        if (!active) return;
        setMissingPaths(new Set(results.filter((item) => !item.exists).map((item) => item.path)));
      })
      .catch(() => {
        if (active) setMissingPaths(new Set(allPaths));
      })
      .finally(() => {
        if (active) setHealthChecking(false);
      });
    return () => {
      active = false;
    };
  }, [allPaths]);

  const briefCta =
    creativeBrief.committed?.callToAction.trim() || creativeBrief.callToAction.trim();
  const profileCta =
    projectProfile.overrides.callToAction?.trim() || profile?.callToAction.text.trim() || '';
  const selectedCtaCopy =
    promoPlan.ctaSource === 'profile'
      ? profileCta
      : promoPlan.ctaSource === 'brief'
        ? briefCta
        : '';
  const selectedCtaPath =
    promoPlan.ctaSource === 'none'
      ? null
      : promoPlan.ctaAssetPath && ctaPaths.includes(promoPlan.ctaAssetPath)
        ? promoPlan.ctaAssetPath
        : (ctaPaths[0] ?? null);
  const scriptedBeats = promoPlan.beats.filter((beat) => beat.script.trim());
  const selectedEvidencePaths = promoPlan.beats.flatMap((beat) =>
    beat.evidenceAssetPath ? [beat.evidenceAssetPath] : [],
  );
  const missingSelected = selectedEvidencePaths.filter((path) => missingPaths.has(path));
  const missingCta = Boolean(selectedCtaPath && missingPaths.has(selectedCtaPath));
  const hasCtaChoice =
    promoPlan.ctaSource === 'none' || Boolean(selectedCtaCopy || selectedCtaPath);
  const canReview =
    scriptedBeats.length > 0 && missingSelected.length === 0 && !missingCta && hasCtaChoice;
  const previewBeat =
    scriptedBeats.find(
      (beat) => beat.evidenceAssetPath && !missingPaths.has(beat.evidenceAssetPath),
    ) ??
    scriptedBeats[0] ??
    null;
  const previewPath = previewBeat?.evidenceAssetPath ?? selectedCtaPath;

  const updateBeats = (beats: PromoScriptBeat[]): void => setPromoPlan({ beats });
  const updateBeat = (id: string, patch: Partial<PromoScriptBeat>): void => {
    updateBeats(promoPlan.beats.map((beat) => (beat.id === id ? { ...beat, ...patch } : beat)));
  };

  const addProfile = (): void => {
    const created = createCreatorProfile('Promo Brand Pack');
    setCreatorProfile(created.id);
  };

  const chooseProfile = (profileId: string): void => {
    setCreatorProfile(profileId);
    const next = profiles.find((item) => item.id === profileId);
    setPromoPlan({ ctaAssetPath: next?.callToAction.assetPaths[0] ?? null });
  };

  const updateEvidenceAssets = (paths: string[]): void => {
    if (!profile) return;
    updateCreatorProfile(profile.id, { evidenceAssetPaths: paths }, ['evidenceAssets']);
    const removed = new Set(evidencePaths.filter((path) => !paths.includes(path)));
    if (removed.size > 0) {
      updateBeats(
        promoPlan.beats.map((beat) =>
          beat.evidenceAssetPath && removed.has(beat.evidenceAssetPath)
            ? { ...beat, evidenceAssetPath: null }
            : beat,
        ),
      );
    }
  };

  const updateCtaAssets = (paths: string[]): void => {
    if (!profile) return;
    updateCreatorProfile(
      profile.id,
      { callToAction: { ...profile.callToAction, assetPaths: paths } },
      ['cta'],
    );
    setPromoPlan({
      ctaAssetPath:
        promoPlan.ctaAssetPath && paths.includes(promoPlan.ctaAssetPath)
          ? promoPlan.ctaAssetPath
          : (paths[0] ?? null),
    });
  };

  const copyRecordingScript = async (): Promise<void> => {
    const text = scriptedBeats
      .map((beat, index) => `${markerFor(index)}\n${beat.script.trim()}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Recording script copied with spoken markers');
    } catch {
      toast.error("Couldn't copy the recording script");
    }
  };

  const setCtaSource = (ctaSource: PromoCtaSource): void => {
    setPromoPlan({ ctaSource });
    setPromoForceCta(ctaSource !== 'none');
  };

  const markReviewed = (): void => {
    if (!canReview) return;
    setPromoPlan({ reviewedAt: new Date().toISOString() });
    toast.success('Promo plan ready for recording');
  };

  return (
    <Card className="overflow-hidden border-primary/25 bg-card shadow-none">
      <div className="flex flex-col gap-3 border-b border-border bg-primary/5 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <WandSparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold">Promo creator workflow</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Bring in the approved AI script, pair claims with real Brand Pack captures, rehearse
              the spoken markers, and review the visual order before recording.
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={promoPlan.reviewedAt ? 'border-success/40 text-success' : 'border-warning/40'}
        >
          {promoPlan.reviewedAt ? 'Plan reviewed' : 'Plan in progress'}
        </Badge>
      </div>

      <div className="grid min-[980px]:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div className="min-w-0 space-y-7 p-5 min-[980px]:border-r min-[980px]:border-border">
          <section aria-labelledby="promo-script-heading" className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 id="promo-script-heading" className="text-sm font-semibold">
                  Script and spoken clip markers
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Use one row per clip. Say its marker, pause, then read the script. The marker is
                  removed from the final clip.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || scriptedBeats.length === 0}
                  onClick={() => void copyRecordingScript()}
                >
                  <Clipboard className="h-4 w-4" aria-hidden />
                  Copy script
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => updateBeats([...promoPlan.beats, newBeat()])}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add clip
                </Button>
              </div>
            </div>

            {promoPlan.beats.length === 0 ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => updateBeats([newBeat()])}
                className="flex min-h-24 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 text-sm text-muted-foreground transition-[border-color,background-color,color] duration-150 hover:border-primary/45 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add the first scripted clip
              </button>
            ) : (
              <ol className="space-y-3">
                {promoPlan.beats.map((beat, index) => {
                  const category = EVIDENCE_OPTIONS.find(
                    (option) => option.value === beat.evidenceCategory,
                  );
                  return (
                    <li key={beat.id} className="rounded-lg border border-border bg-muted/20 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{markerFor(index)}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {beat.script.trim() ? 'Script added' : 'Needs script'}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          disabled={disabled}
                          aria-label={`Remove ${markerFor(index)}`}
                          onClick={() =>
                            updateBeats(promoPlan.beats.filter((item) => item.id !== beat.id))
                          }
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                      <div className="grid min-w-0 gap-3 min-[760px]:grid-cols-[minmax(0,1.2fr)_minmax(220px,0.8fr)]">
                        <div className="grid min-w-0 gap-1.5">
                          <Label htmlFor={`promo-script-${beat.id}`}>Approved script</Label>
                          <textarea
                            id={`promo-script-${beat.id}`}
                            value={beat.script}
                            rows={4}
                            disabled={disabled}
                            placeholder="Paste this clip from the approved AI script task"
                            onChange={(event) =>
                              updateBeat(beat.id, { script: event.target.value })
                            }
                            className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                        <div className="grid min-w-0 content-start gap-3">
                          <div className="grid gap-1.5">
                            <Label htmlFor={`promo-evidence-${beat.id}`}>Evidence cue</Label>
                            <Select
                              value={beat.evidenceCategory}
                              disabled={disabled}
                              onValueChange={(value) =>
                                updateBeat(beat.id, {
                                  evidenceCategory: value as PromoEvidenceCategory,
                                  ...(value === 'none' ? { evidenceAssetPath: null } : {}),
                                })
                              }
                            >
                              <SelectTrigger id={`promo-evidence-${beat.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {EVIDENCE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">{category?.help}</p>
                          </div>
                          {beat.evidenceCategory !== 'none' && (
                            <div className="grid gap-1.5">
                              <Label htmlFor={`promo-asset-${beat.id}`}>Brand Pack capture</Label>
                              <Select
                                value={beat.evidenceAssetPath ?? '__automatic__'}
                                disabled={disabled || evidencePaths.length === 0}
                                onValueChange={(value) =>
                                  updateBeat(beat.id, {
                                    evidenceAssetPath: value === '__automatic__' ? null : value,
                                  })
                                }
                              >
                                <SelectTrigger id={`promo-asset-${beat.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__automatic__">Built-in template</SelectItem>
                                  {evidencePaths.map((path) => (
                                    <SelectItem key={path} value={path}>
                                      {basename(path)}
                                      {missingPaths.has(path) ? ' (missing)' : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section aria-labelledby="promo-brand-pack-heading" className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1">
                <Label htmlFor="promo-brand-profile" id="promo-brand-pack-heading">
                  Brand Pack
                </Label>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Promo Mode uses the selected Creator Profile instead of keeping a second asset
                  library.
                </p>
              </div>
              <div className="flex gap-2">
                {profile && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => setProfileOpen(true)}
                  >
                    Manage profile
                  </Button>
                )}
                {!profile && (
                  <Button type="button" size="sm" disabled={disabled} onClick={addProfile}>
                    <Plus className="h-4 w-4" aria-hidden />
                    Create Brand Pack
                  </Button>
                )}
              </div>
            </div>

            {profiles.length > 0 && (
              <Select
                value={profile?.id ?? '__none__'}
                disabled={disabled}
                onValueChange={(value) => {
                  if (value !== '__none__') chooseProfile(value);
                }}
              >
                <SelectTrigger id="promo-brand-profile" aria-label="Creator Profile Brand Pack">
                  <SelectValue placeholder="Choose a Creator Profile" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>
                    Choose a Creator Profile
                  </SelectItem>
                  {profiles.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {profile ? (
              <div className="grid gap-5 rounded-lg border border-border bg-muted/20 p-4">
                <CreatorAssetField
                  label="Evidence captures"
                  description="Real product screens, outcomes, and proof. Built-in animated templates remain available."
                  kind="evidence"
                  paths={evidencePaths}
                  missingPaths={missingPaths}
                  onChange={updateEvidenceAssets}
                />
                <CreatorAssetField
                  label="CTA assets"
                  description="End cards, QR captures, or short bumper videos used at the clip end."
                  kind="cta"
                  paths={ctaPaths}
                  missingPaths={missingPaths}
                  onChange={updateCtaAssets}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                Choose or create a Creator Profile to attach real evidence. Built-in animated
                evidence templates still work without one.
              </div>
            )}
          </section>

          <section aria-labelledby="promo-cta-heading" className="space-y-3">
            <div>
              <h3 id="promo-cta-heading" className="text-sm font-semibold">
                CTA choice
              </h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Reuse approved copy from the Creator Profile or this project&apos;s Creative Brief.
              </p>
            </div>
            <div className="grid min-w-0 gap-3 min-[760px]:grid-cols-2">
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="promo-cta-source">CTA copy source</Label>
                <Select
                  value={promoPlan.ctaSource}
                  disabled={disabled}
                  onValueChange={(value) => setCtaSource(value as PromoCtaSource)}
                >
                  <SelectTrigger id="promo-cta-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="profile" disabled={!profileCta && ctaPaths.length === 0}>
                      Creator Profile default
                    </SelectItem>
                    <SelectItem value="brief" disabled={!briefCta}>
                      Project Creative Brief
                    </SelectItem>
                    <SelectItem value="none">No CTA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="promo-cta-asset">CTA visual</Label>
                <Select
                  value={selectedCtaPath ?? '__none__'}
                  disabled={disabled || promoPlan.ctaSource === 'none' || ctaPaths.length === 0}
                  onValueChange={(value) =>
                    setPromoPlan({ ctaAssetPath: value === '__none__' ? null : value })
                  }
                >
                  <SelectTrigger id="promo-cta-asset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No visual asset</SelectItem>
                    {ctaPaths.map((path) => (
                      <SelectItem key={path} value={path}>
                        {basename(path)}
                        {missingPaths.has(path) ? ' (missing)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex min-h-12 items-start justify-between gap-4 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
              <div>
                <Label htmlFor="promo-force-cta-workflow">End every clip with the CTA visual</Label>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {selectedCtaPath
                    ? `Uses ${basename(selectedCtaPath)} after evidence and before the clip ends.`
                    : 'Add a CTA asset to the Brand Pack for a forced visual ending.'}
                </p>
              </div>
              <Switch
                id="promo-force-cta-workflow"
                checked={promoSettings.forceCta && promoPlan.ctaSource !== 'none'}
                disabled={disabled || promoPlan.ctaSource === 'none' || !selectedCtaPath}
                onCheckedChange={setPromoForceCta}
                className="mt-0.5 shrink-0"
              />
            </div>
            {selectedCtaCopy && (
              <blockquote className="border-l-2 border-primary/45 pl-3 text-sm leading-6">
                {selectedCtaCopy}
              </blockquote>
            )}
          </section>
        </div>

        <aside
          className="min-w-0 space-y-5 bg-muted/10 p-5"
          aria-label="Promo plan preview and status"
        >
          <section aria-labelledby="promo-preview-heading" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 id="promo-preview-heading" className="text-sm font-semibold">
                Layout preview
              </h3>
              <span className="text-xs text-muted-foreground">9:16</span>
            </div>
            <figure className="mx-auto w-full max-w-[240px]">
              <div className="relative aspect-[9/16] overflow-hidden rounded-xl border border-border bg-[#171315] shadow-sm">
                <div className="absolute inset-x-0 top-0 flex h-10 items-center justify-between border-b border-white/10 px-3 text-[10px] text-white/70">
                  <span>
                    {previewBeat
                      ? markerFor(Math.max(0, scriptedBeats.indexOf(previewBeat)))
                      : 'Clip one'}
                  </span>
                  <span>Layout only</span>
                </div>
                <div className="absolute inset-x-0 top-10 bottom-20 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2 text-white/55">
                    <ScanFace className="h-12 w-12" strokeWidth={1.2} aria-hidden />
                    <span className="text-[11px]">Talking-head frame</span>
                  </div>
                </div>
                {previewPath && (
                  <div className="absolute inset-x-3 top-[42%] aspect-[1.55] overflow-hidden rounded-lg border border-white/20 bg-card shadow-lg">
                    <PreviewAsset path={previewPath} />
                  </div>
                )}
                <div className="absolute inset-x-5 bottom-8 text-center text-sm font-semibold leading-5 text-white">
                  {previewBeat?.script.trim().split(/\s+/).slice(0, 8).join(' ') ||
                    'Your approved script appears here'}
                </div>
              </div>
              <figcaption className="mt-2 text-center text-xs leading-5 text-muted-foreground">
                Timing comes from the recorded transcript. This preview shows layer precedence, not
                final motion.
              </figcaption>
            </figure>
          </section>

          <section aria-labelledby="promo-status-heading">
            <div className="flex items-center justify-between gap-3">
              <h3 id="promo-status-heading" className="text-sm font-semibold">
                Recording readiness
              </h3>
              {healthChecking && <span className="text-xs text-muted-foreground">Checking…</span>}
            </div>
            <ul className="mt-2 divide-y divide-border" aria-live="polite">
              <WorkflowStatus
                done={scriptedBeats.length > 0}
                label="Script markers"
                detail={
                  scriptedBeats.length
                    ? `${scriptedBeats.length} ${scriptedBeats.length === 1 ? 'clip' : 'clips'} ready to record`
                    : 'Add at least one approved script'
                }
              />
              <WorkflowStatus
                done={Boolean(profile)}
                label="Brand Pack"
                detail={
                  profile
                    ? `${profile.name}: ${evidencePaths.length} evidence, ${ctaPaths.length} CTA assets`
                    : 'Built-in templates only until a profile is selected'
                }
              />
              <WorkflowStatus
                done={!healthChecking && missingPaths.size === 0}
                warning={missingPaths.size > 0}
                label="Asset health"
                detail={
                  healthChecking
                    ? 'Checking saved files'
                    : missingPaths.size
                      ? `${missingPaths.size} saved ${missingPaths.size === 1 ? 'file is' : 'files are'} missing`
                      : allPaths.length
                        ? 'Every saved asset is available'
                        : 'No local assets to check'
                }
              />
              <WorkflowStatus
                done={hasCtaChoice && !missingCta}
                warning={!hasCtaChoice || missingCta}
                label="CTA"
                detail={
                  promoPlan.ctaSource === 'none'
                    ? 'No CTA selected'
                    : selectedCtaPath
                      ? `${promoPlan.ctaSource === 'brief' ? 'Creative Brief' : 'Creator Profile'} copy with ${basename(selectedCtaPath)}`
                      : 'Copy selected; no forced visual asset'
                }
              />
            </ul>
          </section>

          <section
            className="rounded-lg border border-info/35 bg-info/10 p-3"
            aria-labelledby="promo-order-heading"
          >
            <div className="flex gap-2">
              <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
              <div>
                <h3 id="promo-order-heading" className="text-xs font-semibold">
                  Render order
                </h3>
                <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                  <li>Talking head, crop, hook, and captions</li>
                  <li>Matched Brand Pack evidence or built-in template</li>
                  <li>Selected forced CTA at the clip end</li>
                </ol>
                <p className="mt-2 text-xs leading-5 text-foreground">
                  Promo evidence replaces stock B-roll. If a capture is unavailable, BatchClip keeps
                  the speaker and any matched built-in template.
                </p>
              </div>
            </div>
          </section>

          <Button
            type="button"
            className="w-full"
            disabled={disabled || !canReview}
            onClick={markReviewed}
          >
            <Megaphone className="h-4 w-4" aria-hidden />
            {promoPlan.reviewedAt ? 'Plan reviewed' : 'Mark ready to record'}
          </Button>
          {!canReview && (
            <p className="text-center text-xs leading-5 text-muted-foreground">
              Add script copy, choose a CTA outcome, and fix any selected missing assets.
            </p>
          )}
        </aside>
      </div>

      {profileOpen && <CreatorProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />}
    </Card>
  );
}
