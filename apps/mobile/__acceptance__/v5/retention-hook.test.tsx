// @vitest-environment jsdom
// Slice v5 gate: the retention hook — due reviews SURFACE on Home the next
// day and route to the review queue. Ordering was superseded by v9's daily
// plan: light debt (≤10) sits after the mission, urgent debt (>10) leads
// (pinned in __acceptance__/v9/daily-plan.test.tsx). What v5 still owns:
// next-day reviews are never silently dropped from the plan.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomeScreen from '../../app/(tabs)/index';
import { getMission, getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile } from '@/db/repo/profile';
import { upsertMiss } from '@/db/repo/reviews';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { __setDayOffset, addDaysLocal, todayLocal } from '@/lib/clock';
import { queryClient } from '@/lib/queryClient';

const h = vi.hoisted(() => ({
  db: null as unknown,
  push: vi.fn(),
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: () => {}, back: () => {}, push: h.push },
}));
vi.mock('@/notifications/scheduler', () => ({
  rescheduleAll: async () => {},
  requestPermissionOnce: async () => {},
}));
vi.mock('@/components/DevPanel', () => ({ DevPanel: () => null }));

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: addDaysLocal(todayLocal(), 30), dailyMinutesTarget: 10 });
  h.db = db;
  h.push.mockClear();
  queryClient.clear();
});

afterEach(() => {
  cleanup();
  __setDayOffset(0);
});

function renderHome() {
  return render(
    <QueryClientProvider client={queryClient}>
      <HomeScreen />
    </QueryClientProvider>,
  );
}

describe('next-day session opens with reviews first', () => {
  it('with a review due, the plan still surfaces it next day and it opens the review queue', async () => {
    const concept = getMission('r1-m1')!.steps.find((s) => s.type !== 'checkpoint')!.conceptId;
    upsertMiss(db, concept, 'wrong', todayLocal());
    __setDayOffset(1);

    renderHome();

    const review = await screen.findByRole('button', { name: /clear 1 review/i });
    screen.getByRole('button', { name: /mission/i });

    fireEvent.click(review);
    expect(h.push).toHaveBeenCalled();
    expect(JSON.stringify(h.push.mock.calls)).toContain('review-queue');
  });

  it('with nothing due, there is no review CTA and the mission CTA leads', async () => {
    renderHome();
    expect(await screen.findByRole('button', { name: /mission/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /review/i })).toBeNull();
  });
});
