// ---------------------------------------------------------------------------
// Palette contract tests.
//
// Locks the shipped built-in presets (unique ids, all `builtin: true`, exact
// brand colors) and the `getPaletteById` resolution rules: brand fallback for
// unknown/undefined ids, custom-array lookup, and custom-over-builtin
// precedence on id collisions.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { BUILTIN_PALETTES, DEFAULT_PALETTE_ID, getPaletteById, type Palette } from './palettes';

describe('BUILTIN_PALETTES', () => {
  it('have unique ids', () => {
    const ids = BUILTIN_PALETTES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('are all marked builtin', () => {
    for (const p of BUILTIN_PALETTES) {
      expect(p.builtin).toBe(true);
    }
  });

  it('lead with the brand palette using exact brand colors', () => {
    const brand = BUILTIN_PALETTES[0];
    expect(brand.id).toBe('brand');
    expect(brand.background).toBe('#23100c');
    expect(brand.foreground).toBe('#f6ecd9');
    expect(brand.accent).toBe('#9f75ff');
    expect(DEFAULT_PALETTE_ID).toBe('brand');
  });
});

describe('getPaletteById', () => {
  it('returns the brand palette for the brand id', () => {
    expect(getPaletteById('brand')).toBe(BUILTIN_PALETTES[0]);
  });

  it('falls back to brand for an unknown id', () => {
    expect(getPaletteById('nope')).toBe(BUILTIN_PALETTES[0]);
  });

  it('falls back to brand for an undefined id', () => {
    expect(getPaletteById(undefined)).toBe(BUILTIN_PALETTES[0]);
  });

  it('resolves an id from the passed custom array', () => {
    const myCustom: Palette = {
      id: 'myCustom',
      name: 'My Custom',
      background: '#000000',
      foreground: '#ffffff',
      accent: '#ff00ff',
      builtin: false,
    };
    expect(getPaletteById('myCustom', [myCustom])).toBe(myCustom);
  });

  it('lets a custom palette take precedence over a built-in on id collision', () => {
    const collision: Palette = {
      id: 'brand',
      name: 'Custom Brand Override',
      background: '#111111',
      foreground: '#eeeeee',
      accent: '#abcdef',
      builtin: false,
    };
    const resolved = getPaletteById('brand', [collision]);
    expect(resolved).toBe(collision);
    expect(resolved).not.toBe(BUILTIN_PALETTES[0]);
  });
});
