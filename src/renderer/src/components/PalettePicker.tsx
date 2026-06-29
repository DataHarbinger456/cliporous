/**
 * PalettePicker — color-palette + skin selection for long-form block renders.
 *
 * A palette is a SEPARATE axis from the skin (see `LongformSkinId`): a palette
 * controls colors (background / foreground / accent), a skin controls visual
 * structure. This component lets the user:
 *   • pick a color palette from built-in presets or their own custom palettes,
 *   • create / edit / delete custom palettes (the editor dialog is owned by a
 *     separate component — exposed here via the `onCreate` / `onEdit` props),
 *   • pick one of the four skins via a small segmented "Style" control.
 *
 * Selection is persisted through the Zustand settings slice
 * (`longformPaletteId` / `longformSkin` + the `customPalettes` array).
 */

import { BUILTIN_PALETTES, type Palette } from '@shared/palettes';
import type { LongformSkinId } from '@shared/types';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { PaletteEditor } from '@/components/PaletteEditor';
import { SkinThumbnail } from '@/components/SkinThumbnail';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

// ---------------------------------------------------------------------------
// Skins — the four fixed long-form skins, in display order.
// ---------------------------------------------------------------------------

const SKINS: ReadonlyArray<{ id: LongformSkinId; label: string }> = [
  { id: 'editorial', label: 'Editorial' },
  { id: 'aurora-glass', label: 'Aurora Glass' },
  { id: 'bento', label: 'Bento' },
  { id: 'terminal', label: 'Terminal' },
];

export interface PalettePickerProps {
  /** Disable all interaction (e.g. while a render is starting). */
  disabled?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// SwatchCard — one selectable mini-preview tile for a single palette.
// ---------------------------------------------------------------------------

interface SwatchCardProps {
  palette: Palette;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function SwatchCard({
  palette,
  selected,
  disabled,
  onSelect,
  onEdit,
  onDelete,
}: SwatchCardProps): React.JSX.Element {
  const isCustom = !palette.builtin;
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={`Select palette ${palette.name}`}
        className={cn(
          'block w-full rounded-lg border p-1 text-left transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:pointer-events-none disabled:opacity-50',
          selected
            ? 'border-transparent ring-2 ring-primary'
            : 'border-border hover:border-foreground/30',
        )}
      >
        {/* Mini-preview tile filled with the palette's own colors. */}
        <div
          className="relative flex h-16 flex-col justify-between overflow-hidden rounded-md p-2"
          style={{ backgroundColor: palette.background }}
        >
          <span
            className="text-[11px] font-medium leading-none"
            style={{ color: palette.foreground }}
          >
            Aa headline
          </span>
          <span className="h-1.5 w-8 rounded-full" style={{ backgroundColor: palette.accent }} />
          {selected && (
            <span
              className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full"
              style={{ backgroundColor: palette.accent }}
            >
              <Check className="h-3 w-3" style={{ color: palette.background }} />
            </span>
          )}
        </div>
        <span className="mt-1 block truncate px-0.5 text-xs text-foreground">{palette.name}</span>
      </button>

      {isCustom && (onEdit || onDelete) && (
        <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              disabled={disabled}
              aria-label={`Edit palette ${palette.name}`}
              className="rounded bg-background/80 p-1 text-muted-foreground backdrop-blur hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={disabled}
              aria-label={`Delete palette ${palette.name}`}
              className="rounded bg-background/80 p-1 text-muted-foreground backdrop-blur hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PalettePicker
// ---------------------------------------------------------------------------

export function PalettePicker({ disabled, className }: PalettePickerProps): React.JSX.Element {
  const longformPaletteId = useStore((s) => s.settings.longformPaletteId);
  const customPalettes = useStore((s) => s.settings.customPalettes);
  const setLongformPaletteId = useStore((s) => s.setLongformPaletteId);
  const removeCustomPalette = useStore((s) => s.removeCustomPalette);

  const longformSkin = useStore((s) => s.settings.longformSkin);
  const setLongformSkin = useStore((s) => s.setLongformSkin);

  // Editor dialog state. `editingPalette === undefined` while open === true
  // means "create mode"; a defined palette means "edit that custom palette".
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingPalette, setEditingPalette] = React.useState<Palette | undefined>(undefined);

  const openCreate = (): void => {
    setEditingPalette(undefined);
    setEditorOpen(true);
  };

  const openEdit = (palette: Palette): void => {
    setEditingPalette(palette);
    setEditorOpen(true);
  };

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {/* ----- Style (skin) ----- */}
      <div className="flex flex-col gap-2">
        <Label className="text-sm font-semibold tracking-tight text-foreground">Style</Label>
        {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of toggle buttons, not a fieldset of form fields */}
        <div role="group" aria-label="Block skin" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SKINS.map((skin) => {
            const active = skin.id === longformSkin;
            return (
              <button
                key={skin.id}
                type="button"
                onClick={() => setLongformSkin(skin.id)}
                disabled={disabled}
                aria-pressed={active}
                className={cn(
                  'flex flex-col gap-1.5 rounded-lg border p-1 text-left transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  'disabled:pointer-events-none disabled:opacity-50',
                  active
                    ? 'border-transparent ring-2 ring-primary'
                    : 'border-border hover:border-foreground/30',
                )}
              >
                {/* Static sample tile approximating the skin's real look. */}
                <SkinThumbnail
                  skin={skin.id}
                  className="block aspect-video w-full overflow-hidden rounded-md"
                />
                <span
                  className={cn(
                    'block px-0.5 text-xs font-medium',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {skin.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ----- Built-in palettes ----- */}
      <div className="flex flex-col gap-2">
        <Label className="text-sm font-semibold tracking-tight text-foreground">Palette</Label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {BUILTIN_PALETTES.map((palette) => (
            <SwatchCard
              key={palette.id}
              palette={palette}
              selected={palette.id === longformPaletteId}
              disabled={disabled}
              onSelect={() => setLongformPaletteId(palette.id)}
            />
          ))}
        </div>
      </div>

      {/* ----- Custom palettes ----- */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Custom
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={openCreate}
            disabled={disabled}
            className="h-7 px-2 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            New palette
          </Button>
        </div>
        {customPalettes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No custom palettes yet. Create one to reuse your own colors.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {customPalettes.map((palette) => (
              <SwatchCard
                key={palette.id}
                palette={palette}
                selected={palette.id === longformPaletteId}
                disabled={disabled}
                onSelect={() => setLongformPaletteId(palette.id)}
                onEdit={() => openEdit(palette)}
                onDelete={() => removeCustomPalette(palette.id)}
              />
            ))}
          </div>
        )}
      </div>

      <PaletteEditor open={editorOpen} onOpenChange={setEditorOpen} palette={editingPalette} />
    </div>
  );
}

export default PalettePicker;
