/**
 * PaletteEditor — create / edit dialog for custom color palettes.
 *
 * A palette is a SEPARATE axis from the visual skin (see `LongformSkinId`): it
 * controls only colors (background / foreground / accent / optional accent2).
 * This dialog is opened by `PalettePicker` — `palette === undefined` means
 * "create a new custom palette", a defined `palette` means "edit this existing
 * custom palette".
 *
 * Each color field pairs a native color input with a hex text input kept in
 * two-way sync, mirroring the hook-title color-picker pattern, and a live
 * mini-block preview shows contrast before saving.
 */

import type { Palette } from '@shared/palettes';
import { Trash2 } from 'lucide-react';
import * as React from 'react';
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
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

function isValidHex(value: string): boolean {
  return HEX_RE.test(value);
}

// ---------------------------------------------------------------------------
// ColorField — native color input paired with a hex text input (two-way sync).
// ---------------------------------------------------------------------------

interface ColorFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (hex: string) => void;
  /** Optional — render a remove button (used for the optional accent2). */
  onRemove?: () => void;
}

function ColorField({ id, label, value, onChange, onRemove }: ColorFieldProps): React.JSX.Element {
  const valid = isValidHex(value);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={`${id}-hex`} className="text-xs font-medium text-foreground">
          {label}
        </Label>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${label}`}
            className="text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded p-0.5 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* Native swatch picker. Falls back to brand bg when hex is invalid. */}
        <input
          type="color"
          aria-label={`${label} swatch`}
          value={valid ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-background p-0.5"
        />
        <Input
          id={`${id}-hex`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder="#000000"
          aria-invalid={!valid}
          className={cn(
            'font-mono text-sm uppercase',
            !valid && 'border-destructive focus-visible:ring-destructive',
          )}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PaletteEditor
// ---------------------------------------------------------------------------

export interface PaletteEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Undefined → create mode; defined → edit this existing custom palette. */
  palette?: Palette;
}

const DEFAULTS = {
  name: '',
  background: '#23100c',
  foreground: '#f6ecd9',
  accent: '#9f75ff',
} as const;

export function PaletteEditor({
  open,
  onOpenChange,
  palette,
}: PaletteEditorProps): React.JSX.Element {
  const addCustomPalette = useStore((s) => s.addCustomPalette);
  const updateCustomPalette = useStore((s) => s.updateCustomPalette);
  const removeCustomPalette = useStore((s) => s.removeCustomPalette);

  const isEdit = palette !== undefined;
  const canDelete = isEdit && palette?.builtin === false;

  const [name, setName] = React.useState(DEFAULTS.name);
  const [background, setBackground] = React.useState(DEFAULTS.background);
  const [foreground, setForeground] = React.useState(DEFAULTS.foreground);
  const [accent, setAccent] = React.useState(DEFAULTS.accent);
  const [accent2, setAccent2] = React.useState<string | undefined>(undefined);

  // Re-seed local form state whenever the dialog opens (or its target changes).
  React.useEffect(() => {
    if (!open) return;
    setName(palette?.name ?? DEFAULTS.name);
    setBackground(palette?.background ?? DEFAULTS.background);
    setForeground(palette?.foreground ?? DEFAULTS.foreground);
    setAccent(palette?.accent ?? DEFAULTS.accent);
    setAccent2(palette?.accent2);
  }, [open, palette]);

  const colorsValid =
    isValidHex(background) &&
    isValidHex(foreground) &&
    isValidHex(accent) &&
    (accent2 === undefined || isValidHex(accent2));

  const canSave = name.trim().length > 0 && colorsValid;

  const handleSave = (): void => {
    if (!canSave) return;
    const trimmed = name.trim();
    if (isEdit && palette) {
      updateCustomPalette(palette.id, {
        name: trimmed,
        background,
        foreground,
        accent,
        accent2,
      });
    } else {
      addCustomPalette({
        id: crypto.randomUUID(),
        name: trimmed,
        background,
        foreground,
        accent,
        accent2,
        builtin: false,
      });
    }
    onOpenChange(false);
  };

  const handleDelete = (): void => {
    if (palette) removeCustomPalette(palette.id);
    onOpenChange(false);
  };

  const previewBg = isValidHex(background) ? background : '#000000';
  const previewFg = isValidHex(foreground) ? foreground : '#ffffff';
  const previewAccent = isValidHex(accent) ? accent : '#ffffff';
  const previewAccent2 = accent2 !== undefined && isValidHex(accent2) ? accent2 : previewAccent;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit palette' : 'New palette'}</DialogTitle>
          <DialogDescription>
            Set the background, foreground, and accent colors for long-form blocks.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Name ---------------------------------------------------------- */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="palette-name" className="text-xs font-medium text-foreground">
              Name
            </Label>
            <Input
              id="palette-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My palette"
              autoFocus
            />
          </div>

          {/* Colors -------------------------------------------------------- */}
          <div className="grid grid-cols-2 gap-3">
            <ColorField
              id="palette-bg"
              label="Background"
              value={background}
              onChange={setBackground}
            />
            <ColorField
              id="palette-fg"
              label="Foreground"
              value={foreground}
              onChange={setForeground}
            />
            <ColorField id="palette-accent" label="Accent" value={accent} onChange={setAccent} />
            {accent2 === undefined ? (
              <div className="flex flex-col justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAccent2('#000000')}
                  className="h-9"
                >
                  + Accent 2
                </Button>
              </div>
            ) : (
              <ColorField
                id="palette-accent2"
                label="Accent 2"
                value={accent2}
                onChange={setAccent2}
                onRemove={() => setAccent2(undefined)}
              />
            )}
          </div>

          {/* Live preview -------------------------------------------------- */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Preview
            </Label>
            <div
              className="flex flex-col gap-2 rounded-lg border border-border p-4"
              style={{ backgroundColor: previewBg }}
            >
              {/* Both accents — rendered blocks use accent2 for charts/gradients. */}
              <span className="flex items-center gap-1.5">
                <span
                  className="h-1 w-10 rounded-full"
                  style={{ backgroundColor: previewAccent }}
                />
                <span
                  className="h-1 w-5 rounded-full"
                  style={{ backgroundColor: previewAccent2 }}
                />
              </span>
              <span
                className="text-[11px] font-semibold uppercase tracking-wider opacity-70"
                style={{ color: previewFg }}
              >
                Kicker
              </span>
              <span className="text-lg font-bold leading-tight" style={{ color: previewFg }}>
                Sample heading on this palette
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {canDelete ? (
            <Button
              type="button"
              variant="ghost"
              onClick={handleDelete}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={!canSave}>
              {isEdit ? 'Save' : 'Create'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PaletteEditor;
