import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile } from '@/db/repo/profile';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { usePlayerStore } from '@/stores/playerStore';
import { playUntil, stepOnce, type PlayPlan } from './driver';

const h = vi.hoisted(() => ({
  db: null as unknown,
  today: '2026-07-06',
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: () => {}, back: () => {}, push: () => {} },
}));
vi.mock('@/notifications/scheduler', () => ({ rescheduleAll: async () => {} }));
vi.mock('@/lib/clock', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/clock')>();
  return {
    ...real,
    todayLocal: () => h.today,
    now: () => real.localDayToDate(h.today),
  };
});

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  h.db = db;
  usePlayerStore.getState().abandon();
});

// QA finding 2026-07-06: advance() had no phase guard, so a double-tap on any
// Continue button skipped an unanswered card or graded an incomplete checkpoint.
describe('repeated advance() calls (double-tap)', () => {
  it('second advance() after wrong-answer feedback is a no-op', () => {
    usePlayerStore.getState().startMission('r1-m1');
    stepOnce(usePlayerStore, { correct: () => false });
    expect(usePlayerStore.getState().phase).toBe('feedback');

    usePlayerStore.getState().advance();
    const after = usePlayerStore.getState();
    expect(after.phase).toBe('card');
    const settledIndex = after.index;

    usePlayerStore.getState().advance();
    expect(usePlayerStore.getState().index).toBe(settledIndex);
    expect(usePlayerStore.getState().phase).toBe('card');
  });

  it('second advance() after the checkpoint interstitial does not skip question 1', () => {
    const allCorrect: PlayPlan = { correct: () => true };
    usePlayerStore.getState().startMission('r1-m1');
    playUntil(usePlayerStore, allCorrect, (s) => s.phase === 'checkpoint-intro');

    const introIndex = usePlayerStore.getState().index;
    expect(usePlayerStore.getState().queue[introIndex]?.kind).toBe('checkpoint-q');

    usePlayerStore.getState().advance();
    expect(usePlayerStore.getState().phase).toBe('card');
    expect(usePlayerStore.getState().index).toBe(introIndex);

    usePlayerStore.getState().advance();
    expect(usePlayerStore.getState().index).toBe(introIndex);
    expect(usePlayerStore.getState().phase).toBe('card');
    expect(usePlayerStore.getState().checkpointAnswers).toHaveLength(0);
  });
});
