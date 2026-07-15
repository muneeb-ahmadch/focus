// @vitest-environment jsdom
// Slice v13 gate: the ResetConfirm screen wipes the device and drops the learner
// back into onboarding, exactly once, and Cancel touches nothing.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import ResetConfirmScreen from '../../app/settings/reset';
import { getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile, getProfile } from '@/db/repo/profile';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { useSettingsStore } from '@/stores/settingsStore';

const h = vi.hoisted(() => ({
  db: null as unknown,
  replace: vi.fn(),
  back: vi.fn(),
  invalidate: vi.fn(),
  reschedule: vi.fn(),
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: h.replace, back: h.back, push: () => {} },
}));
vi.mock('@/lib/queryClient', () => ({
  queryClient: { invalidateQueries: h.invalidate },
}));
vi.mock('@/notifications/scheduler', () => ({
  rescheduleAll: h.reschedule,
  requestPermissionOnce: async () => {},
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

let db: Db;

function freshInstall(): Db {
  const d = openTestDb();
  migrate(d);
  syncRoutesFromContent(d, getRouteManifest());
  return d;
}

beforeEach(() => {
  db = freshInstall();
  createProfile(db, {
    testDate: '2026-08-05',
    dailyMinutesTarget: 30,
    accessibility: { autoPlayAudio: false, reduceMotion: true, highContrast: true, dyslexiaFont: true },
  });
  h.db = db;
  h.replace.mockClear();
  h.back.mockClear();
  h.invalidate.mockClear();
  h.reschedule.mockClear();
  useSettingsStore.getState().hydrate();
});

afterEach(cleanup);

describe('ResetConfirm screen', () => {
  it('warns before the destructive action', () => {
    render(<ResetConfirmScreen />);
    expect(screen.getByText(/can.t be undone/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete everything' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('Delete everything wipes the DB, resets settings, and returns to onboarding', () => {
    expect(useSettingsStore.getState().reduceMotion).toBe(true);
    render(<ResetConfirmScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete everything' }));

    expect(getProfile(db)).toBeUndefined();
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM daily_activity')?.n).toBe(0);
    // content is re-seeded, not left empty
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM route_state')?.n).toBeGreaterThan(0);
    expect(useSettingsStore.getState().reduceMotion).toBe(false);
    expect(h.invalidate).toHaveBeenCalled();
    expect(h.replace).toHaveBeenCalledWith('/onboarding');
  });

  it('double-tapping Delete everything resets and navigates exactly once (R6)', () => {
    render(<ResetConfirmScreen />);
    const btn = screen.getByRole('button', { name: 'Delete everything' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(h.replace).toHaveBeenCalledTimes(1);
  });

  it('Cancel leaves the database untouched', () => {
    render(<ResetConfirmScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(getProfile(db)).toBeDefined();
    expect(h.back).toHaveBeenCalledTimes(1);
    expect(h.replace).not.toHaveBeenCalled();
  });
});
