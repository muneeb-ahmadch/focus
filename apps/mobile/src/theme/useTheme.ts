import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useSettingsStore } from '@/stores/settingsStore';
import { getTheme, type Theme } from './tokens';

export function useTheme(): Theme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const highContrast = useSettingsStore((s) => s.highContrast);
  const dyslexiaFont = useSettingsStore((s) => s.dyslexiaFont);
  return getTheme({ scheme, highContrast, dyslexiaFont });
}

export function useThemedStyles<T>(factory: (t: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
}
