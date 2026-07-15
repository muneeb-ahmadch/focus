// @vitest-environment jsdom
// Slice v13 gate: AudioSettings owns Auto-play audio (moved out of Accessibility)
// and offers a spoken sample. The toggle persists to the store and user_profile.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import AudioSettingsScreen from '../../app/settings/audio';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile } from '@/db/repo/profile';
import { openTestDb } from '@/db/testing/adapter.node';
import { useSettingsStore } from '@/stores/settingsStore';

const h = vi.hoisted(() => ({ db: null as unknown, speak: vi.fn(), stop: vi.fn() }));

vi.mock('@/db', () => ({ getDb: () => h.db as Db, initDb: async () => h.db as Db }));
vi.mock('expo-router', () => ({ router: { replace: () => {}, back: () => {}, push: () => {} } }));
vi.mock('@/lib/speech', () => ({ speak: h.speak, stopSpeech: h.stop, initNarrationVoice: async () => {} }));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  h.db = db;
  h.speak.mockClear();
  useSettingsStore.getState().hydrate();
});

afterEach(cleanup);

function autoPlayChecked(): string | null {
  return screen.getByRole('switch', { name: 'Auto-play audio' }).getAttribute('aria-checked');
}

describe('AudioSettings', () => {
  it('reflects the persisted auto-play flag and persists a toggle to store + SQLite', () => {
    db.run(`UPDATE user_profile SET auto_play_audio = 1 WHERE user_id = 'local'`);
    useSettingsStore.getState().hydrate();
    render(<AudioSettingsScreen />);

    expect(autoPlayChecked()).toBe('true');
    fireEvent.click(screen.getByRole('switch', { name: 'Auto-play audio' }));

    expect(autoPlayChecked()).toBe('false');
    expect(useSettingsStore.getState().autoPlayAudio).toBe(false);
    expect(
      db.get<{ auto_play_audio: number }>(
        `SELECT auto_play_audio FROM user_profile WHERE user_id = 'local'`,
      )?.auto_play_audio,
    ).toBe(0);
  });

  it('Hear a sample speaks a phrase', () => {
    render(<AudioSettingsScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Hear a sample' }));
    expect(h.speak).toHaveBeenCalledTimes(1);
    expect(h.speak.mock.calls[0][0].length).toBeGreaterThan(0);
  });
});
