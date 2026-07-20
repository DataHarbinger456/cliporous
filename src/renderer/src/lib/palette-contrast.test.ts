import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  evaluatePaletteContrast,
  isHexColor,
  normalizeHexColor,
} from './palette-contrast';

describe('palette contrast', () => {
  it('normalizes valid six-digit colors without hiding invalid input', () => {
    expect(normalizeHexColor('9f75ff')).toBe('#9F75FF');
    expect(normalizeHexColor(' #f6ecd9 ')).toBe('#F6ECD9');
    expect(normalizeHexColor('#123')).toBe('#123');
    expect(isHexColor('#A0b1C2')).toBe(true);
    expect(isHexColor('#123')).toBe(false);
  });

  it('calculates WCAG contrast ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  it('reports text and meaningful-mark warnings independently', () => {
    const result = evaluatePaletteContrast({
      background: '#FFFFFF',
      foreground: '#AAAAAA',
      accent: '#BBBBBB',
      accent2: '#000000',
    });

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain('Body text');
    expect(result.warnings[1]).toContain('Meaningful marks');
    expect(result.accent2).toBeCloseTo(21, 2);
  });
});
