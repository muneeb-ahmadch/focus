// @vitest-environment jsdom
// Slice v4 gate: AccessibilitySettings screen — the visual/motion switches
// reflect user_profile on mount and persist every toggle to both the store and
// SQLite. (Auto-play audio moved to its own AudioSettings screen in v13.)
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile } from '@/db/repo/profile';
import { openTestDb } from '@/db/testing/adapter.node';
import { useSettingsStore } from '@/stores/settingsStore';
import AccessibilitySettingsScreen from '../../app/settings/accessibility';

const h = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: () => {}, back: () => {}, push: () => {} },
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

const LABELS = ['Reduce motion', 'High contrast', 'Dyslexia-friendly text'];

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  h.db = db;
});

afterEach(cleanup);

function profileRow() {
  return db.get<{
    auto_play_audio: number;
    reduce_motion: number;
    high_contrast: number;
    dyslexia_font: number;
  }>(`SELECT auto_play_audio, reduce_motion, high_contrast, dyslexia_font
      FROM user_profile WHERE user_id = 'local'`);
}

function switchChecked(name: string): string | null {
  return screen.getByRole('switch', { name }).getAttribute('aria-checked');
}

describe('AccessibilitySettings', () => {
  it('renders all four switches reflecting persisted flags', () => {
    db.run(`UPDATE user_profile SET reduce_motion = 1 WHERE user_id = 'local'`);
    useSettingsStore.getState().hydrate();
    render(<AccessibilitySettingsScreen />);

    for (const label of LABELS) {
      screen.getByRole('switch', { name: label });
    }
    expect(screen.queryByRole('switch', { name: 'Auto-play audio' })).toBeNull();
    expect(switchChecked('Reduce motion')).toBe('true');
    expect(switchChecked('High contrast')).toBe('false');
    expect(switchChecked('Dyslexia-friendly text')).toBe('false');
  });

  it('toggling a switch flips the UI, the store, and the user_profile row', () => {
    useSettingsStore.getState().hydrate();
    render(<AccessibilitySettingsScreen />);

    fireEvent.click(screen.getByRole('switch', { name: 'High contrast' }));
    expect(switchChecked('High contrast')).toBe('true');
    expect(useSettingsStore.getState().highContrast).toBe(true);
    expect(profileRow()?.high_contrast).toBe(1);

    fireEvent.click(screen.getByRole('switch', { name: 'Dyslexia-friendly text' }));
    expect(switchChecked('Dyslexia-friendly text')).toBe('true');
    expect(profileRow()?.dyslexia_font).toBe(1);
  });
});
