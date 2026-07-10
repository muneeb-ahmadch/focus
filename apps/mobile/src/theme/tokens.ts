export type ColorScheme = 'light' | 'dark';

export interface ThemeInput {
  scheme: ColorScheme;
  highContrast: boolean;
  dyslexiaFont: boolean;
}

export interface Theme {
  scheme: ColorScheme;
  colors: {
    bg: string;
    surface: string;
    text: string;
    textMuted: string;
    accent: string;
    onAccent: string;
    accentSoft: string;
    success: string;
    successSoft: string;
    danger: string;
    dangerSoft: string;
    warning: string;
    border: string;
    lockedBg: string;
    overlay: string;
    signRed: string;
    signBlue: string;
  };
  space: { xs: 4; sm: 8; md: 12; lg: 16; xl: 24; xxl: 32 };
  radius: { card: 20; control: 12; pill: 999 };
  font: {
    xs: 13;
    sm: 15;
    md: 17;
    lg: 22;
    xl: 28;
    xxl: 34;
    family: string | undefined;
    letterSpacing: number;
    lineHeightMultiplier: number;
  };
  motion: { fast: 150; base: 300; slow: 800 };
  text(size: number): {
    fontSize: number;
    lineHeight: number;
    letterSpacing: number;
    fontFamily?: string;
  };
}

type Palette = Theme['colors'];

const PALETTES: Record<'light' | 'dark' | 'hc-light' | 'hc-dark', Palette> = {
  light: {
    bg: '#F7F7F5',
    surface: '#FFFFFF',
    text: '#17191C',
    textMuted: '#565D66',
    accent: '#2E5FD6',
    onAccent: '#FFFFFF',
    accentSoft: '#2E5FD614',
    success: '#177A46',
    successSoft: '#177A4614',
    danger: '#C22F2F',
    dangerSoft: '#C22F2F14',
    warning: '#B77900',
    border: '#E3E3DE',
    lockedBg: '#EFEFEA',
    overlay: 'rgba(0,0,0,0.4)',
    signRed: '#C0392B',
    signBlue: '#1B5FAA',
  },
  dark: {
    bg: '#14161A',
    surface: '#1E2126',
    text: '#F1F2F4',
    textMuted: '#A8AFB9',
    accent: '#7DA2F5',
    onAccent: '#10131A',
    accentSoft: '#7DA2F524',
    success: '#4CC38A',
    successSoft: '#4CC38A24',
    danger: '#F17E7E',
    dangerSoft: '#F17E7E24',
    warning: '#E5B454',
    border: '#2C3037',
    lockedBg: '#23262C',
    overlay: 'rgba(0,0,0,0.6)',
    signRed: '#C0392B',
    signBlue: '#1B5FAA',
  },
  'hc-light': {
    bg: '#FFFFFF',
    surface: '#FFFFFF',
    text: '#000000',
    textMuted: '#3A3F45',
    accent: '#1D3FA8',
    onAccent: '#FFFFFF',
    accentSoft: '#1D3FA814',
    success: '#0E5D33',
    successSoft: '#0E5D3314',
    danger: '#A31D1D',
    dangerSoft: '#A31D1D14',
    warning: '#8A5B00',
    border: '#55585C',
    lockedBg: '#E8E8E8',
    overlay: 'rgba(0,0,0,0.5)',
    signRed: '#C0392B',
    signBlue: '#1B5FAA',
  },
  'hc-dark': {
    bg: '#000000',
    surface: '#0E1013',
    text: '#FFFFFF',
    textMuted: '#D6DAE0',
    accent: '#9DB9FF',
    onAccent: '#000000',
    accentSoft: '#9DB9FF24',
    success: '#5FD99C',
    successSoft: '#5FD99C24',
    danger: '#FF9C9C',
    dangerSoft: '#FF9C9C24',
    warning: '#FFD27A',
    border: '#9AA0A8',
    lockedBg: '#1A1D22',
    overlay: 'rgba(0,0,0,0.7)',
    signRed: '#C0392B',
    signBlue: '#1B5FAA',
  },
};

const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
const RADIUS = { card: 20, control: 12, pill: 999 } as const;
const MOTION = { fast: 150, base: 300, slow: 800 } as const;
const FONT_SIZES = { xs: 13, sm: 15, md: 17, lg: 22, xl: 28, xxl: 34 } as const;

function paletteKey(input: ThemeInput): keyof typeof PALETTES {
  if (input.highContrast) return input.scheme === 'dark' ? 'hc-dark' : 'hc-light';
  return input.scheme;
}

function buildTheme(input: ThemeInput): Theme {
  const colors = PALETTES[paletteKey(input)];
  const letterSpacing = input.dyslexiaFont ? 0.5 : 0;
  const lineHeightMultiplier = input.dyslexiaFont ? 1.5 : 1.3;
  const family = undefined;

  return {
    scheme: input.scheme,
    colors,
    space: SPACE,
    radius: RADIUS,
    font: { ...FONT_SIZES, family, letterSpacing, lineHeightMultiplier },
    motion: MOTION,
    text(size: number) {
      const result: { fontSize: number; lineHeight: number; letterSpacing: number; fontFamily?: string } = {
        fontSize: size,
        lineHeight: Math.round(size * lineHeightMultiplier),
        letterSpacing,
      };
      if (family !== undefined) result.fontFamily = family;
      return result;
    },
  };
}

const THEME_CACHE = new Map<string, Theme>();
for (const scheme of ['light', 'dark'] as const) {
  for (const highContrast of [false, true]) {
    for (const dyslexiaFont of [false, true]) {
      const input: ThemeInput = { scheme, highContrast, dyslexiaFont };
      THEME_CACHE.set(cacheKey(input), buildTheme(input));
    }
  }
}

function cacheKey(input: ThemeInput): string {
  return `${input.scheme}:${input.highContrast ? 1 : 0}:${input.dyslexiaFont ? 1 : 0}`;
}

export function getTheme(input: ThemeInput): Theme {
  return THEME_CACHE.get(cacheKey(input))!;
}
