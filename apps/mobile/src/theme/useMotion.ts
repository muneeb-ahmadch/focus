import { useCallback } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';

export function useMotion(): { reduce: boolean; ms: (base: number) => number } {
  const reduce = useSettingsStore((s) => s.reduceMotion);
  const ms = useCallback((base: number) => (reduce ? 0 : base), [reduce]);
  return { reduce, ms };
}
