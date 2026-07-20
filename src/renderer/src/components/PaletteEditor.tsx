import { BUILTIN_PALETTES, type Palette } from '@shared/palettes';
import type { LongformSkinId } from '@shared/types';
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { LongformStylePreview } from '@/components/LongformStylePreview';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { evaluatePaletteContrast, isHexColor, normalizeHexColor } from '@/lib/palette-contrast';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

interface ColorFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (hex: string) => void;
  showError: boolean;
  onRemove?: () => void;
}

function ColorField({
  id,
  label,
  value,
  onChange,
  showError,
  onRemove,
}: ColorFieldProps): React.JSX.Element {
  const valid = isHexColor(value);
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <Label htmlFor={`${id}-hex`} className="text-xs font-medium text-foreground">
          {label}
        </Label>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${label}`}
            className="flex h-11 w-11 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={valid ? value : '#000000'}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-10 w-11 shrink-0 cursor-pointer rounded-md border border-border bg-background p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Input
          id={`${id}-hex`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onChange(normalizeHexColor(value))}
          spellCheck={false}
          autoComplete="off"
          placeholder="#000000"
          aria-invalid={showError && !valid}
          aria-describedby={showError && !valid ? errorId : undefined}
          className={cn(
            'font-mono text-sm uppercase',
            showError && !valid && 'border-destructive focus-visible:ring-destructive',
          )}
        />
      </div>
      {showError && !valid && (
        <p id={errorId} className="text-xs text-destructive">
          Enter six hex digits, for example #9F75FF.
        </p>
      )}
    </div>
  );
}

export interface PaletteEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  palette?: Palette | undefined;
  onSaved?: (palette: Palette) => void;
  onRequestDelete?: (palette: Palette) => void;
  previewSkin?: LongformSkinId;
}

type EditablePaletteFields = Pick<Palette, 'name' | 'background' | 'foreground' | 'accent'> & {
  accent2?: string;
};

const DEFAULTS = {
  name: '',
  background: '#23100C',
  foreground: '#F6ECD9',
  accent: '#9F75FF',
} as const;

export function PaletteEditor({
  open,
  onOpenChange,
  palette,
  onSaved,
  onRequestDelete,
  previewSkin,
}: PaletteEditorProps): React.JSX.Element {
  const addCustomPalette = useStore((state) => state.addCustomPalette);
  const updateCustomPalette = useStore((state) => state.updateCustomPalette);
  const customPalettes = useStore((state) => state.settings.customPalettes);
  const storedLongformSkin = useStore((state) => state.settings.longformSkin);
  const isEdit = palette !== undefined;
  const canDelete = isEdit && palette.builtin === false && onRequestDelete !== undefined;

  const [name, setName] = React.useState<string>(DEFAULTS.name);
  const [background, setBackground] = React.useState<string>(DEFAULTS.background);
  const [foreground, setForeground] = React.useState<string>(DEFAULTS.foreground);
  const [accent, setAccent] = React.useState<string>(DEFAULTS.accent);
  const [accent2, setAccent2] = React.useState<string | undefined>(undefined);
  const [submitted, setSubmitted] = React.useState(false);
  const [nameTouched, setNameTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(palette?.name ?? DEFAULTS.name);
    setBackground(palette?.background ?? DEFAULTS.background);
    setForeground(palette?.foreground ?? DEFAULTS.foreground);
    setAccent(palette?.accent ?? DEFAULTS.accent);
    setAccent2(palette?.accent2);
    setSubmitted(false);
    setNameTouched(false);
  }, [open, palette]);

  const trimmedName = name.trim();
  const duplicateName = [...BUILTIN_PALETTES, ...customPalettes]
    .filter((item) => item.id !== palette?.id)
    .some((item) => item.name.trim().toLocaleLowerCase() === trimmedName.toLocaleLowerCase());
  const nameError = !trimmedName
    ? 'Name this palette.'
    : trimmedName.length > 40
      ? 'Use 40 characters or fewer.'
      : duplicateName
        ? 'A palette already uses this name.'
        : null;
  const colorsValid =
    isHexColor(background) &&
    isHexColor(foreground) &&
    isHexColor(accent) &&
    (accent2 === undefined || isHexColor(accent2));
  const formValid = nameError === null && colorsValid;
  const showNameError = (submitted || nameTouched) && nameError !== null;
  const previewPalette: Palette = {
    id: palette?.id ?? 'palette-preview',
    name: trimmedName || 'Untitled palette',
    background: isHexColor(background) ? background : DEFAULTS.background,
    foreground: isHexColor(foreground) ? foreground : DEFAULTS.foreground,
    accent: isHexColor(accent) ? accent : DEFAULTS.accent,
    ...(accent2 !== undefined && isHexColor(accent2) ? { accent2 } : {}),
    builtin: false,
  };
  const contrast = evaluatePaletteContrast(previewPalette);

  const handleSave = (): void => {
    setSubmitted(true);
    if (!formValid) {
      window.requestAnimationFrame(() => {
        const firstInvalidId = nameError
          ? 'palette-name'
          : !isHexColor(background)
            ? 'palette-bg-hex'
            : !isHexColor(foreground)
              ? 'palette-fg-hex'
              : !isHexColor(accent)
                ? 'palette-accent-hex'
                : 'palette-accent2-hex';
        document.getElementById(firstInvalidId)?.focus();
      });
      return;
    }

    const colors: EditablePaletteFields = {
      name: trimmedName,
      background: normalizeHexColor(background),
      foreground: normalizeHexColor(foreground),
      accent: normalizeHexColor(accent),
    };
    if (accent2 !== undefined) colors.accent2 = normalizeHexColor(accent2);
    const savedPalette: Palette = isEdit
      ? { ...palette, ...colors }
      : { id: crypto.randomUUID(), ...colors, builtin: false };

    if (isEdit) updateCustomPalette(savedPalette.id, colors);
    else addCustomPalette(savedPalette);
    onSaved?.(savedPalette);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-1rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit palette' : 'New custom palette'}</DialogTitle>
          <DialogDescription>
            Custom palettes are reusable across long-form projects and Creator Profiles.
          </DialogDescription>
        </DialogHeader>

        {submitted && !formValid && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/35 bg-destructive/10 p-3 text-xs text-foreground"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            Fix the named fields below. Your values are still here.
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)]">
          <div className="grid content-start gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="palette-name">Palette name</Label>
              <Input
                id="palette-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => setNameTouched(true)}
                placeholder="Studio violet"
                maxLength={64}
                autoFocus
                aria-invalid={showNameError}
                aria-describedby={showNameError ? 'palette-name-error' : 'palette-name-help'}
              />
              {showNameError ? (
                <p id="palette-name-error" className="text-xs text-destructive">
                  {nameError}
                </p>
              ) : (
                <p id="palette-name-help" className="text-xs text-muted-foreground">
                  Use a distinct name so it remains recognizable in profile defaults.
                </p>
              )}
            </div>

            <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <legend className="sr-only">Palette colors</legend>
              <ColorField
                id="palette-bg"
                label="Background"
                value={background}
                onChange={setBackground}
                showError={submitted}
              />
              <ColorField
                id="palette-fg"
                label="Foreground"
                value={foreground}
                onChange={setForeground}
                showError={submitted}
              />
              <ColorField
                id="palette-accent"
                label="Accent"
                value={accent}
                onChange={setAccent}
                showError={submitted}
              />
              {accent2 === undefined ? (
                <div className="flex flex-col justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAccent2(accent)}
                    className="h-10"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Add second accent
                  </Button>
                </div>
              ) : (
                <ColorField
                  id="palette-accent2"
                  label="Accent 2"
                  value={accent2}
                  onChange={setAccent2}
                  onRemove={() => setAccent2(undefined)}
                  showError={submitted}
                />
              )}
            </fieldset>
          </div>

          <div className="grid content-start gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Project preview</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Uses the open project's frame and copy when available.
              </p>
            </div>
            <LongformStylePreview
              palette={previewPalette}
              skin={previewSkin ?? storedLongformSkin}
            />
            {colorsValid && contrast.warnings.length > 0 ? (
              <div role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3">
                <p className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                  Contrast needs review
                </p>
                <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
                  {contrast.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : colorsValid ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                Text and meaningful accent marks meet their contrast thresholds.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {canDelete ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (!palette || !onRequestDelete) return;
                onOpenChange(false);
                window.setTimeout(() => onRequestDelete(palette), 0);
              }}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete palette
            </Button>
          ) : (
            <span />
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave}>
              {isEdit ? 'Save palette' : 'Create palette'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PaletteEditor;
