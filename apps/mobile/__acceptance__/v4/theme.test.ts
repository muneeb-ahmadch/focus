// Slice v4 gate: token architecture — light/dark/high-contrast palettes with
// WCAG-checked contrast, dyslexia typography, and motion tokens. These tests
// are the contract for src/theme/tokens.ts; palette values may change freely
// as long as every assertion here still holds.
import { describe, expect, it } from 'vitest';
import { getTheme, type Theme, type ThemeInput } from '@/theme/tokens';

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const HEX6_OR_8 = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

function luminance(hex: string): number {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const COMBOS: Array<{ name: string; input: ThemeInput; min: number }> = [
  { name: 'light', input: { scheme: 'light', highContrast: false, dyslexiaFont: false }, min: 4.5 },
  { name: 'dark', input: { scheme: 'dark', highContrast: false, dyslexiaFont: false }, min: 4.5 },
  {
    name: 'light high-contrast',
    input: { scheme: 'light', highContrast: true, dyslexiaFont: false },
    min: 7,
  },
  {
    name: 'dark high-contrast',
    input: { scheme: 'dark', highContrast: true, dyslexiaFont: false },
    min: 7,
  },
];

const TEXT_PAIRS: Array<[keyof Theme['colors'], keyof Theme['colors']]> = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['textMuted', 'bg'],
  ['textMuted', 'surface'],
  ['onAccent', 'accent'],
];

describe('colour contrast', () => {
  for (const combo of COMBOS) {
    it(`${combo.name}: readable pairs reach ${combo.min}:1`, () => {
      const t = getTheme(combo.input);
      for (const [fg, bg] of TEXT_PAIRS) {
        const ratio = contrast(t.colors[fg], t.colors[bg]);
        expect(ratio, `${fg} on ${bg} in ${combo.name} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          combo.min,
        );
      }
    });
  }

  it('light backgrounds are light, dark backgrounds are dark', () => {
    for (const highContrast of [false, true]) {
      const light = getTheme({ scheme: 'light', highContrast, dyslexiaFont: false });
      const dark = getTheme({ scheme: 'dark', highContrast, dyslexiaFont: false });
      expect(luminance(light.colors.bg)).toBeGreaterThan(0.8);
      expect(luminance(dark.colors.bg)).toBeLessThan(0.05);
      expect(luminance(light.colors.surface)).toBeGreaterThan(0.8);
      expect(luminance(dark.colors.surface)).toBeLessThan(0.1);
    }
  });

  it('high-contrast palettes actually differ from the base palettes', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const base = getTheme({ scheme, highContrast: false, dyslexiaFont: false });
      const hc = getTheme({ scheme, highContrast: true, dyslexiaFont: false });
      expect(hc.colors).not.toEqual(base.colors);
    }
  });
});

describe('palette shape', () => {
  const REQUIRED_SOLID = [
    'bg',
    'surface',
    'text',
    'textMuted',
    'accent',
    'onAccent',
    'success',
    'danger',
    'warning',
    'border',
    'lockedBg',
    'signRed',
    'signBlue',
  ] as const;
  const REQUIRED_SOFT = ['accentSoft', 'successSoft', 'dangerSoft'] as const;

  for (const combo of COMBOS) {
    it(`${combo.name}: exposes every semantic colour as hex`, () => {
      const t = getTheme(combo.input);
      for (const key of REQUIRED_SOLID) {
        expect(t.colors[key], key).toMatch(HEX6);
      }
      for (const key of REQUIRED_SOFT) {
        expect(t.colors[key], key).toMatch(HEX6_OR_8);
      }
      expect(t.colors.overlay.length).toBeGreaterThan(0);
    });
  }
});

describe('layout and motion tokens', () => {
  const t = getTheme({ scheme: 'light', highContrast: false, dyslexiaFont: false });

  it('keeps the v1 spatial scale so existing layouts do not shift', () => {
    expect(t.space).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 });
    expect(t.radius).toEqual({ card: 20, control: 12, pill: 999 });
    expect([t.font.xs, t.font.sm, t.font.md, t.font.lg, t.font.xl, t.font.xxl]).toEqual([
      13, 15, 17, 22, 28, 34,
    ]);
  });

  it('exposes an ordered motion duration scale', () => {
    expect(t.motion.fast).toBeGreaterThan(0);
    expect(t.motion.base).toBeGreaterThanOrEqual(t.motion.fast);
    expect(t.motion.slow).toBeGreaterThanOrEqual(t.motion.base);
  });
});

describe('dyslexia typography', () => {
  for (const scheme of ['light', 'dark'] as const) {
    it(`${scheme}: widens spacing and line height without touching colours or sizes`, () => {
      const base = getTheme({ scheme, highContrast: false, dyslexiaFont: false });
      const dys = getTheme({ scheme, highContrast: false, dyslexiaFont: true });
      expect(dys.font.letterSpacing).toBeGreaterThanOrEqual(0.3);
      expect(dys.font.letterSpacing).toBeGreaterThan(base.font.letterSpacing);
      expect(dys.font.lineHeightMultiplier).toBeGreaterThanOrEqual(1.4);
      expect(dys.font.lineHeightMultiplier).toBeGreaterThan(base.font.lineHeightMultiplier);
      expect(dys.colors).toEqual(base.colors);
      expect([dys.font.xs, dys.font.md, dys.font.xxl]).toEqual([
        base.font.xs,
        base.font.md,
        base.font.xxl,
      ]);
    });
  }
});
