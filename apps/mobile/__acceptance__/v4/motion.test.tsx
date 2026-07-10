// @vitest-environment jsdom
// Slice v4 gate: settings store hydrates from user_profile, persists writes
// back, and useMotion() zeroes durations when reduce_motion is on.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile } from '@/db/repo/profile';
import { openTestDb } from '@/db/testing/adapter.node';
import { useSettingsStore } from '@/stores/settingsStore';
import { useMotion } from '@/theme/useMotion';

const h = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
});

function profileRow() {
  return db.get<{
    auto_play_audio: number;
    reduce_motion: number;
    high_contrast: number;
    dyslexia_font: number;
  }>(`SELECT auto_play_audio, reduce_motion, high_contrast, dyslexia_font
      FROM user_profile WHERE user_id = 'local'`);
}

describe('settings store', () => {
  it('hydrate with no profile row falls back to safe defaults', () => {
    useSettingsStore.getState().hydrate();
    const s = useSettingsStore.getState();
    expect(s.autoPlayAudio).toBe(true);
    expect(s.reduceMotion).toBe(false);
    expect(s.highContrast).toBe(false);
    expect(s.dyslexiaFont).toBe(false);
  });

  it('hydrate reads persisted profile flags', () => {
    createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
    db.run(`UPDATE user_profile SET reduce_motion = 1, dyslexia_font = 1 WHERE user_id = 'local'`);
    useSettingsStore.getState().hydrate();
    const s = useSettingsStore.getState();
    expect(s.reduceMotion).toBe(true);
    expect(s.dyslexiaFont).toBe(true);
    expect(s.autoPlayAudio).toBe(true);
    expect(s.highContrast).toBe(false);
  });

  it('setSetting updates the store and persists to user_profile', () => {
    createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
    useSettingsStore.getState().hydrate();

    act(() => useSettingsStore.getState().setSetting('highContrast', true));
    expect(useSettingsStore.getState().highContrast).toBe(true);
    expect(profileRow()?.high_contrast).toBe(1);

    act(() => useSettingsStore.getState().setSetting('autoPlayAudio', false));
    expect(useSettingsStore.getState().autoPlayAudio).toBe(false);
    expect(profileRow()?.auto_play_audio).toBe(0);
  });
});

describe('useMotion', () => {
  it('returns zero durations when reduce_motion is on, real durations when off', () => {
    createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
    db.run(`UPDATE user_profile SET reduce_motion = 1 WHERE user_id = 'local'`);
    useSettingsStore.getState().hydrate();

    const { result } = renderHook(() => useMotion());
    expect(result.current.reduce).toBe(true);
    expect(result.current.ms(800)).toBe(0);

    act(() => useSettingsStore.getState().setSetting('reduceMotion', false));
    expect(result.current.reduce).toBe(false);
    expect(result.current.ms(800)).toBe(800);
  });
});
