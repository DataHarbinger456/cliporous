/**
 * Color palettes for long-form block renders.
 *
 * A palette is a SEPARATE axis from the visual skin (see `LongformSkinId` in
 * `src/shared/types.ts`): any skin can be paired with any palette. A skin
 * controls visual structure (aurora-glass / editorial / bento / terminal); a
 * palette controls only colors (background / foreground / accent).
 *
 * The first built-in (`brand`) reproduces the app's brand identity exactly,
 * mirroring BRAND_BG / BRAND_FG / BRAND_ACCENT in
 * `src/main/edit-styles/shared/brand.ts`.
 *
 * This module lives in `src/shared/` and MUST stay free of `src/main` imports.
 */

/** A color palette for long-form block renders. Colors are hex strings. */
export interface Palette {
  /** Stable identifier (e.g. "brand"). Referenced by `LongformPaletteId`. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Page / backdrop color, e.g. "#23100c". */
  background: string;
  /** Primary text color drawn on `background`, e.g. "#f6ecd9". */
  foreground: string;
  /** Primary accent color (emphasis, headlines, marks), e.g. "#9f75ff". */
  accent: string;
  /** Optional secondary accent for gradients / charts. */
  accent2?: string;
  /** True for shipped presets; false for user-created custom palettes. */
  builtin: boolean;
}

/** Default palette id — reproduces the brand identity. */
export const DEFAULT_PALETTE_ID = 'brand';

/** Shipped presets. The first MUST match the brand identity exactly. */
export const BUILTIN_PALETTES: Palette[] = [
  {
    id: 'brand',
    name: 'Brand Default',
    background: '#23100c',
    foreground: '#f6ecd9',
    accent: '#9f75ff',
    builtin: true,
  },
  {
    id: 'midnight-cyan',
    name: 'Midnight Cyan',
    background: '#0a1626',
    foreground: '#e8f4fb',
    accent: '#22d3ee',
    accent2: '#0ea5e9',
    builtin: true,
  },
  {
    id: 'slate-emerald',
    name: 'Slate Emerald',
    background: '#0f1a17',
    foreground: '#eafff5',
    accent: '#34d399',
    accent2: '#10b981',
    builtin: true,
  },
  {
    id: 'charcoal-amber',
    name: 'Charcoal Amber',
    background: '#1a1814',
    foreground: '#fbf3e4',
    accent: '#fbbf24',
    accent2: '#f59e0b',
    builtin: true,
  },
  {
    id: 'ink-rose',
    name: 'Ink Rose',
    background: '#1c0f15',
    foreground: '#fdeef3',
    accent: '#fb7185',
    accent2: '#f43f5e',
    builtin: true,
  },
  {
    id: 'deep-navy-violet',
    name: 'Deep Navy Violet',
    background: '#0c1029',
    foreground: '#ecedfb',
    accent: '#a78bfa',
    accent2: '#8b5cf6',
    builtin: true,
  },
  {
    id: 'near-black-lime',
    name: 'Near Black Lime',
    background: '#0b0d0a',
    foreground: '#f1f7ec',
    accent: '#a3e635',
    accent2: '#84cc16',
    builtin: true,
  },
];

/**
 * Resolve a palette by id, searching `custom` (if provided) then the built-in
 * presets. Falls back to the brand palette when `id` is undefined or unknown.
 */
export function getPaletteById(id: string | undefined, custom?: Palette[]): Palette {
  const brand = BUILTIN_PALETTES[0];
  if (!id) return brand;
  if (custom) {
    const found = custom.find((p) => p.id === id);
    if (found) return found;
  }
  return BUILTIN_PALETTES.find((p) => p.id === id) ?? brand;
}
