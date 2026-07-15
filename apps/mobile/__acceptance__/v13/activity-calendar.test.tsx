// @vitest-environment jsdom
// Slice v13 gate: ActivityCalendar shows the streak/XP summary and a month grid
// that marks active days, with an empty state and month navigation. (Day-detail
// drawer is cut per MASTER_PLAN §9.)
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import ActivityScreen from '../../app/activity';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
import { formatHumanDay, todayLocal } from '@/lib/clock';

const h = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('@/db', () => ({ getDb: () => h.db as Db, initDb: async () => h.db as Db }));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
});

afterEach(cleanup);

describe('ActivityCalendar', () => {
  it('shows an empty state and zeroed summary before any activity', () => {
    render(<ActivityScreen />);
    expect(screen.getByText(/No activity yet/)).toBeTruthy();
    expect(screen.getByText('🔥 0')).toBeTruthy();
  });

  it('marks an active day and reflects streak + XP in the summary', () => {
    const today = todayLocal();
    db.run(`INSERT INTO daily_activity (day, missions_completed, xp) VALUES (?, 1, 60)`, [today]);
    render(<ActivityScreen />);

    expect(screen.queryByText(/No activity yet/)).toBeNull();
    expect(screen.getByText('🔥 1')).toBeTruthy();
    expect(screen.getByText('⚡ 60')).toBeTruthy();
    expect(screen.getByLabelText(new RegExp(`${formatHumanDay(today)}, active, today`))).toBeTruthy();
  });

  it('navigates months: next is disabled at the current month, previous leaves it', () => {
    const today = todayLocal();
    db.run(`INSERT INTO daily_activity (day, missions_completed) VALUES (?, 1)`, [today]);
    render(<ActivityScreen />);

    expect(screen.getByRole('button', { name: 'Next month' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    // today is visible at the current month…
    expect(screen.queryByLabelText(/today/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    // …and gone once we page back a month
    expect(screen.queryByLabelText(/today/)).toBeNull();
  });
});
