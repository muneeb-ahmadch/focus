// @vitest-environment jsdom
// Slice v9 gate: the schedule and test date become editable after onboarding.
// ScheduleEditor persists minutes + study days (never an empty week);
// TestDateEditor persists the date, but a date moving CLOSER interposes the
// reflow confirm — nothing is written until the learner confirms. Both editors
// reschedule notifications after a successful save.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import ProfileScreen from '../../app/(tabs)/profile';
import ScheduleEditorScreen from '../../app/settings/schedule';
import TestDateEditorScreen from '../../app/settings/test-date';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
import { addDaysLocal, toLocalDay } from '@/lib/clock';
import { createProfile, getProfile } from '@/db/repo/profile';

const START_MS = 1_780_000_000_000;
const TODAY = toLocalDay(new Date(START_MS));

const h = vi.hoisted(() => ({
  db: null as unknown,
  nowMs: 0,
  push: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  reschedule: vi.fn(async () => {}),
  pickDate: '',
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: h.replace, back: h.back, push: h.push },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));
vi.mock('@/lib/clock', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/clock')>();
  return {
    ...real,
    now: () => new Date(h.nowMs),
    todayLocal: () => real.toLocalDay(new Date(h.nowMs)),
  };
});
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('@/notifications/scheduler', () => ({
  rescheduleAll: h.reschedule,
  requestPermissionOnce: async () => {},
}));
vi.mock('@/components/TestDatePicker', async () => {
  const React = await import('react');
  return {
    TestDatePicker: (p: { onChange: (d: string) => void }) =>
      React.createElement('button', { onClick: () => p.onChange(h.pickDate) }, 'pick-date'),
  };
});

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
  h.nowMs = START_MS;
  h.push.mockClear();
  h.back.mockClear();
  h.replace.mockClear();
  h.reschedule.mockClear();
  createProfile(db, {
    testDate: addDaysLocal(TODAY, 30),
    dailyMinutesTarget: 10,
    studyDays: [1, 2, 3, 4, 5, 6, 7],
  });
});

afterEach(() => {
  cleanup();
});

describe('Profile tab entry points', () => {
  it('offers Schedule and Test date rows routing to the editors', () => {
    render(<ProfileScreen />);
    fireEvent.click(screen.getByText(/^schedule$/i));
    fireEvent.click(screen.getByText(/^test date$/i));
    const pushed = JSON.stringify(h.push.mock.calls);
    expect(pushed).toContain('/settings/schedule');
    expect(pushed).toContain('/settings/test-date');
  });
});

describe('ScheduleEditor', () => {
  it('saves a changed minutes target and study-day set, then reschedules and goes back', () => {
    render(<ScheduleEditorScreen />);
    fireEvent.click(screen.getByRole('button', { name: '15 minutes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sun' }));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    const profile = getProfile(db)!;
    expect(profile.daily_minutes_target).toBe(15);
    expect(JSON.parse(profile.study_days_json)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(h.back).toHaveBeenCalledTimes(1);
    expect(h.reschedule).toHaveBeenCalled();
  });

  it('never saves an empty week: all days off disables Save', () => {
    render(<ScheduleEditorScreen />);
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      fireEvent.click(screen.getByRole('button', { name: day }));
    }
    screen.getByText(/at least one study day/i);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(JSON.parse(getProfile(db)!.study_days_json)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(h.back).not.toHaveBeenCalled();
  });
});

describe('TestDateEditor', () => {
  it('a date moving FURTHER saves immediately — no reflow confirm', () => {
    h.pickDate = addDaysLocal(TODAY, 60);
    render(<TestDateEditorScreen />);
    fireEvent.click(screen.getByText('pick-date'));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(screen.queryByText(/moved closer/i)).toBeNull();
    expect(getProfile(db)!.test_date).toBe(addDaysLocal(TODAY, 60));
    expect(h.back).toHaveBeenCalledTimes(1);
    expect(h.reschedule).toHaveBeenCalled();
  });

  it('a date moving CLOSER interposes the reflow confirm; confirming persists', () => {
    h.pickDate = addDaysLocal(TODAY, 5);
    render(<TestDateEditorScreen />);
    fireEvent.click(screen.getByText('pick-date'));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    screen.getByText(/moved closer/i);
    expect(getProfile(db)!.test_date).toBe(addDaysLocal(TODAY, 30));

    fireEvent.click(screen.getByRole('button', { name: /update my plan/i }));
    expect(getProfile(db)!.test_date).toBe(addDaysLocal(TODAY, 5));
    expect(h.back).toHaveBeenCalledTimes(1);
    expect(h.reschedule).toHaveBeenCalled();
  });

  // QA V9-Q2: the picker's min prop is a UI hint — web date inputs accept
  // typed values below min. The save path itself must enforce the floor.
  it('a date before tomorrow is rejected at save: hint shown, nothing written, no reflow confirm', () => {
    h.pickDate = addDaysLocal(TODAY, -1);
    render(<TestDateEditorScreen />);
    fireEvent.click(screen.getByText('pick-date'));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    screen.getByText(/after today/i);
    expect(screen.queryByText(/moved closer/i)).toBeNull();
    expect(getProfile(db)!.test_date).toBe(addDaysLocal(TODAY, 30));
    expect(h.back).not.toHaveBeenCalled();

    h.pickDate = TODAY;
    fireEvent.click(screen.getByText('pick-date'));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(getProfile(db)!.test_date).toBe(addDaysLocal(TODAY, 30));
    expect(h.back).not.toHaveBeenCalled();
  });

  it('cancelling the reflow keeps the old date and stays on the editor', () => {
    h.pickDate = addDaysLocal(TODAY, 5);
    render(<TestDateEditorScreen />);
    fireEvent.click(screen.getByText('pick-date'));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    fireEvent.click(screen.getByRole('button', { name: /keep my current date/i }));
    expect(getProfile(db)!.test_date).toBe(addDaysLocal(TODAY, 30));
    expect(h.back).not.toHaveBeenCalled();
    screen.getByRole('button', { name: /save/i });
  });
});
