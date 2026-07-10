// @vitest-environment jsdom
// Slice v4 gate: onboarding gains an accessibility step — flags chosen there
// land in the created user_profile row and hydrate the settings store before
// the user reaches the tabs.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
import { useSettingsStore } from '@/stores/settingsStore';
import OnboardingScreen from '../../app/onboarding';

const h = vi.hoisted(() => ({
  db: null as unknown,
  replace: vi.fn<(target: string) => void>(),
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: h.replace, back: () => {}, push: () => {} },
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/TestDatePicker', async () => {
  const React = await import('react');
  return {
    TestDatePicker: (p: { onChange: (d: string) => void }) =>
      React.createElement('button', { onClick: () => p.onChange('2026-08-05') }, 'pick-date'),
  };
});

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
  h.replace.mockClear();
});

afterEach(cleanup);

describe('onboarding accessibility step', () => {
  it('walks date → accessibility → start, persisting the chosen flags', () => {
    render(<OnboardingScreen />);

    expect(screen.queryByRole('switch', { name: 'Reduce motion' })).toBeNull();
    fireEvent.click(screen.getByText('Continue'));
    expect(
      screen.queryByRole('switch', { name: 'Reduce motion' }),
      'Continue without a test date must not advance',
    ).toBeNull();

    fireEvent.click(screen.getByText('pick-date'));
    fireEvent.click(screen.getByText('Continue'));

    for (const label of [
      'Auto-play audio',
      'Reduce motion',
      'High contrast',
      'Dyslexia-friendly text',
    ]) {
      screen.getByRole('switch', { name: label });
    }

    fireEvent.click(screen.getByRole('switch', { name: 'Reduce motion' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Dyslexia-friendly text' }));
    fireEvent.click(screen.getByText('Start'));

    const row = db.get<{
      test_date: string;
      daily_minutes_target: number;
      auto_play_audio: number;
      reduce_motion: number;
      high_contrast: number;
      dyslexia_font: number;
    }>(`SELECT test_date, daily_minutes_target, auto_play_audio, reduce_motion,
               high_contrast, dyslexia_font
        FROM user_profile WHERE user_id = 'local'`);
    expect(row?.test_date).toBe('2026-08-05');
    expect(row?.daily_minutes_target).toBe(10);
    expect(row?.auto_play_audio).toBe(1);
    expect(row?.reduce_motion).toBe(1);
    expect(row?.high_contrast).toBe(0);
    expect(row?.dyslexia_font).toBe(1);

    expect(h.replace).toHaveBeenCalledWith('/(tabs)');

    const s = useSettingsStore.getState();
    expect(s.reduceMotion).toBe(true);
    expect(s.dyslexiaFont).toBe(true);
    expect(s.autoPlayAudio).toBe(true);
    expect(s.highContrast).toBe(false);
  });

  it('double-tapping Start creates exactly one profile and does not crash (QA v4 BLOCK finding)', () => {
    render(<OnboardingScreen />);

    fireEvent.click(screen.getByText('pick-date'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Start'));
    fireEvent.click(screen.getByText('Start'));

    const row = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM user_profile`);
    expect(row?.n).toBe(1);
    expect(h.replace).toHaveBeenCalledTimes(1);
  });
});
