// Slice v9 gate: notification planning is deterministic and plan-driven.
// planNotifications(db, today) — in @/notifications/plan, a module with NO
// expo import — emits one entry per STUDY day in the 7-day horizon, never past
// the test date, never on a rest day, never for an empty plan; the body is
// decided by the day's plan state, not a static string. The expo layer
// (scheduler.ts) is a thin map over this list; this list is the truth.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
import { localDayToDate } from '@/lib/clock';
import { createProfile } from '@/db/repo/profile';
import { upsertMiss } from '@/db/repo/reviews';
import { planNotifications } from '@/notifications/plan';

vi.mock('@/flags', () => ({ MOCKS_ENABLED: true }));

// 2026-08-03 is a Monday (guarded below) — study-day maths stay readable.
const MON = '2026-08-03';

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
});

function seedProfile(studyDays: number[], testDate: string): void {
  createProfile(db, { testDate, dailyMinutesTarget: 10, studyDays });
}

function seedIncompleteRoute(): void {
  db.run(
    `INSERT INTO route_state (route_id, mastery, completed_missions, total_missions)
     VALUES ('route-1', 0.5, 1, 5)`,
  );
}

function seedCompleteRoute(): void {
  db.run(
    `INSERT INTO route_state (route_id, mastery, completed_missions, total_missions)
     VALUES ('route-1', 0.9, 5, 5)`,
  );
}

function seedDueReviews(count: number): void {
  for (let i = 0; i < count; i++) upsertMiss(db, `c.seed.${i}`, 'wrong', '2026-08-01');
}

function seedActiveDays(days: string[]): void {
  for (const day of days) {
    db.run(`INSERT INTO daily_activity (day, missions_completed) VALUES (?, 1)`, [day]);
  }
}

it('anchor sanity: 2026-08-03 is a Monday', () => {
  expect(localDayToDate(MON).getDay()).toBe(1);
});

describe('study-day discipline', () => {
  it('emits only on study days within the 7-day horizon', () => {
    seedProfile([1, 3, 5], '2026-09-01');
    seedIncompleteRoute();
    const plan = planNotifications(db, MON);
    expect(plan.map((p) => p.day)).toEqual(['2026-08-03', '2026-08-05', '2026-08-07']);
  });

  it('never emits past the test date', () => {
    seedProfile([1, 2, 3, 4, 5, 6, 7], '2026-08-05');
    seedIncompleteRoute();
    const plan = planNotifications(db, MON);
    expect(plan.map((p) => p.day)).toEqual(['2026-08-03', '2026-08-04', '2026-08-05']);
  });

  it('a rest day stays silent even when reviews are due', () => {
    seedProfile([2], '2026-09-01'); // Tuesdays only
    seedIncompleteRoute();
    seedDueReviews(15);
    const plan = planNotifications(db, MON);
    expect(plan.map((p) => p.day)).toEqual(['2026-08-04']);
  });
});

describe('plan-driven copy', () => {
  it('a normal study day carries the test countdown and mission estimate', () => {
    seedProfile([1, 2, 3, 4, 5, 6, 7], '2026-09-01');
    seedIncompleteRoute();
    const plan = planNotifications(db, MON);
    expect(plan[0]).toEqual({
      day: MON,
      body: "Test in 29 days — today's mission takes ~6 minutes.",
    });
  });

  it('urgent review debt takes over the copy', () => {
    seedProfile([1, 2, 3, 4, 5, 6, 7], '2026-09-01');
    seedIncompleteRoute();
    seedDueReviews(12);
    const plan = planNotifications(db, MON);
    expect(plan[0]).toEqual({
      day: MON,
      body: 'You have 12 reviews due — clear them before they pile up.',
    });
  });

  it('light review debt does NOT take over — the mission copy stands', () => {
    seedProfile([1, 2, 3, 4, 5, 6, 7], '2026-09-01');
    seedIncompleteRoute();
    seedDueReviews(4);
    const plan = planNotifications(db, MON);
    expect(plan[0]!.body).toBe("Test in 29 days — today's mission takes ~6 minutes.");
  });

  it('with no mission left, due reviews drive the copy at any count', () => {
    seedProfile([1, 2, 3, 4, 5, 6, 7], '2026-09-01');
    seedCompleteRoute();
    seedDueReviews(4);
    const plan = planNotifications(db, MON);
    expect(plan[0]!.body).toBe('You have 4 reviews due — clear them before they pile up.');
  });

  it('inside the mock window with nothing else to do, the mock leads the copy', () => {
    seedProfile([1, 2, 3, 4, 5, 6, 7], '2026-08-13');
    seedCompleteRoute();
    const plan = planNotifications(db, MON);
    expect(plan[0]!.body).toBe('Test in 10 days — sit a mock while it counts.');
  });

  it('final days: 2-day, eve-of-test, and test-day copy', () => {
    seedProfile([1, 2, 3, 4, 5, 6, 7], '2026-08-05');
    seedIncompleteRoute();
    const plan = planNotifications(db, MON);
    expect(plan.map((p) => p.body)).toEqual([
      'Test in 2 days — mocks and reviews only from here.',
      'Test tomorrow — one mock and your reviews.',
      "It's test day — a quick review this morning, then trust your prep.",
    ]);
  });

  it('a 3+ day streak fronts the copy for today and tomorrow only', () => {
    seedProfile([1, 2, 3, 4, 5, 6, 7], '2026-09-01');
    seedIncompleteRoute();
    seedActiveDays(['2026-08-01', '2026-08-02', '2026-08-03']);
    const plan = planNotifications(db, MON);
    const streakBody = "Don't lose your 3-day streak — today's mission takes ~6 minutes.";
    expect(plan[0]!.body).toBe(streakBody);
    expect(plan[1]!.body).toBe(streakBody);
    expect(plan[2]!.body).toBe("Test in 27 days — today's mission takes ~6 minutes.");
  });
});

describe('empty states', () => {
  it('nothing to do → no notifications at all', () => {
    seedProfile([1, 2, 3, 4, 5, 6, 7], '2026-09-01');
    seedCompleteRoute();
    expect(planNotifications(db, MON)).toEqual([]);
  });

  it('no profile → no notifications, no crash', () => {
    expect(planNotifications(db, MON)).toEqual([]);
  });
});
