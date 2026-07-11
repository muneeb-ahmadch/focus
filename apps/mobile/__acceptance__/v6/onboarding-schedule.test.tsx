// @vitest-environment jsdom
// Slice v6 gate: onboarding is the full 4-step flow (welcome → test date →
// schedule → accessibility) and the schedule step's study-day selection lands
// in user_profile.study_days_json instead of silently defaulting to all week.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
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

function walkToSchedule() {
  fireEvent.click(screen.getByText('Get started'));
  fireEvent.click(screen.getByText('pick-date'));
  fireEvent.click(screen.getByText('Continue'));
  screen.getByText('Study days');
}

describe('onboarding schedule step', () => {
  it('deselected days are persisted to study_days_json', () => {
    render(<OnboardingScreen />);
    walkToSchedule();

    fireEvent.click(screen.getByRole('button', { name: 'Sat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sun' }));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Start'));

    const row = db.get<{ study_days_json: string }>(
      `SELECT study_days_json FROM user_profile WHERE user_id = 'local'`,
    );
    expect(JSON.parse(row!.study_days_json)).toEqual([1, 2, 3, 4, 5]);
    expect(h.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('cannot continue with zero study days; re-selecting a day unblocks', () => {
    render(<OnboardingScreen />);
    walkToSchedule();

    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      fireEvent.click(screen.getByRole('button', { name: day }));
    }
    fireEvent.click(screen.getByText('Continue'));
    screen.getByText('Study days');
    screen.getByText('Pick at least one study day');

    fireEvent.click(screen.getByRole('button', { name: 'Wed' }));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Start'));

    const row = db.get<{ study_days_json: string }>(
      `SELECT study_days_json FROM user_profile WHERE user_id = 'local'`,
    );
    expect(JSON.parse(row!.study_days_json)).toEqual([3]);
  });

  it('back links walk the flow in reverse without losing the chosen date', () => {
    render(<OnboardingScreen />);
    walkToSchedule();

    fireEvent.click(screen.getByText('Back'));
    screen.getByText('When is your theory test?');
    fireEvent.click(screen.getByText('Continue'));
    screen.getByText('Study days');
  });
});
