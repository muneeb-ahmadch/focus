// vB close-out gate: the checkpoint repair (forgiveness) path and replay hygiene.
// Muneeb ruled the repair-completion INTENDED — a ≤3/5 checkpoint completes once
// the repair queue is cleared (all requizzes correct). This locks the behaviours
// that ruling depends on:
//   (2) SRS safeguard — a correct repair requiz must NOT clear/advance/reschedule
//       the review items the checkpoint miss created; they stay due at interval 1.
//   (3) MissionComplete is told the completion was a repair (+ the missed count).
//   (4) Completion XP and the missions_completed credit are once-per-mission-ever;
//       a replay awards neither. Completion is also monotonic — a failed replay
//       never downgrades an already-completed mission or lowers its best score.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { getActivity, getTotalXp } from '@/db/repo/activity';
import { getMissionState } from '@/db/repo/missions';
import { createProfile } from '@/db/repo/profile';
import { getAllReviewItems } from '@/db/repo/reviews';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { usePlayerStore } from '@/stores/playerStore';
import { allCorrect, playToEnd, type PlayPlan } from '../v2/driver';

const h = vi.hoisted(() => ({
  db: null as unknown,
  today: '2026-07-06',
  replaceCalls: [] as { pathname?: string; params?: Record<string, string> }[],
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: {
    replace: (arg: { pathname?: string; params?: Record<string, string> }) => {
      h.replaceCalls.push(arg);
    },
    back: () => {},
    push: () => {},
  },
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

// Fails the first `n` DISTINCT checkpoint concepts on the real (non-repair) pass,
// and answers everything else — including the whole repair queue — correctly. The
// concepts it failed are pushed into `sink` so the test can assert on them.
function failNPlan(n: number, sink: string[]): PlayPlan {
  return {
    correct(card, s) {
      if (
        !s.inRepair &&
        card.kind === 'checkpoint-q' &&
        sink.length < n &&
        !sink.includes(card.conceptId)
      ) {
        sink.push(card.conceptId);
        return false;
      }
      return true;
    },
  };
}

// Fails 2 checkpoint concepts, then fails the repair requiz too → failMission.
function failRepairPlan(sink: string[]): PlayPlan {
  return {
    correct(card, s) {
      if (s.inRepair) return card.kind !== 'checkpoint-q';
      if (card.kind === 'checkpoint-q' && sink.length < 2 && !sink.includes(card.conceptId)) {
        sink.push(card.conceptId);
        return false;
      }
      return true;
    },
  };
}

const lastNav = () => h.replaceCalls.at(-1);

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  h.db = db;
  h.today = '2026-07-06';
  h.replaceCalls = [];
  usePlayerStore.getState().abandon();
});

describe('vB — checkpoint repair (forgiveness) path', () => {
  it('(2) a correct repair requiz leaves the checkpoint-miss review items untouched (due, interval 1)', () => {
    const wrongs: string[] = [];
    const store = usePlayerStore;
    store.getState().startMission('r1-m1');
    playToEnd(store, failNPlan(3, wrongs));

    expect(wrongs).toHaveLength(3); // 2/5 checkpoint
    expect(getMissionState(db, 'r1-m1')?.status).toBe('completed');

    const items = getAllReviewItems(db);
    // exactly the 3 checkpoint misses — the repair taught + requizzed them, but a
    // correct requiz is not an SRS clear, so nothing was cleared or advanced.
    expect(new Set(items.map((i) => i.concept_id))).toEqual(new Set(wrongs));
    for (const concept of wrongs) {
      const item = items.find((i) => i.concept_id === concept)!;
      expect(item.status).toBe('active');
      expect(item.origin_type).toBe('wrong');
      expect(item.interval_days).toBe(1);
      expect(item.due_at).toBe('2026-07-07'); // still due tomorrow, not pushed out
      expect(item.lapses).toBe(0);
    }
  });

  it('(3) tells MissionComplete the completion was repaired, with the missed-concept count', () => {
    const wrongs: string[] = [];
    const store = usePlayerStore;
    store.getState().startMission('r1-m1');
    playToEnd(store, failNPlan(3, wrongs));

    const nav = lastNav();
    expect(nav?.pathname).toBe('/mission-complete');
    expect(nav?.params?.repaired).toBe('1');
    expect(nav?.params?.score).toBe('0.4'); // the original 2/5, retained for display
    expect(nav?.params?.newReviews).toBe('3');
    expect(nav?.params?.missed?.split(',').sort()).toEqual([...wrongs].sort());
  });

  it('(3) a clean pass is not flagged as repaired', () => {
    const store = usePlayerStore;
    store.getState().startMission('r1-m1');
    playToEnd(store, allCorrect);

    const nav = lastNav();
    expect(nav?.params?.repaired).toBe('');
    expect(nav?.params?.score).toBe('1');
  });
});

describe('vB — replay hygiene (XP/credit once, completion monotonic)', () => {
  it('(4) completion XP and missions_completed are awarded once, never on a replay', () => {
    const store = usePlayerStore;

    store.getState().startMission('r1-m1');
    playToEnd(store, allCorrect); // clean 5/5
    expect(getTotalXp(db)).toBe(60); // base 50 + perfect 10
    expect(getActivity(db).find((d) => d.day === h.today)?.missions_completed).toBe(1);
    expect(lastNav()?.params?.xp).toBe('60');

    // Replay the already-completed mission — a real attempt, but no fresh rewards.
    store.getState().startMission('r1-m1');
    playToEnd(store, allCorrect);
    expect(getTotalXp(db)).toBe(60); // unchanged
    expect(getActivity(db).find((d) => d.day === h.today)?.missions_completed).toBe(1);
    expect(lastNav()?.params?.xp).toBe('0');
  });

  it('(4) a failed replay never downgrades a completed mission or lowers its best score', () => {
    const store = usePlayerStore;

    store.getState().startMission('r1-m1');
    playToEnd(store, allCorrect); // completed, best 1.0
    expect(getMissionState(db, 'r1-m1')?.best_checkpoint_score).toBe(1);

    // Replay and fail the checkpoint + its repair requiz.
    store.getState().startMission('r1-m1');
    playToEnd(store, failRepairPlan([]));
    expect(store.getState().phase).toBe('failed');

    const state = getMissionState(db, 'r1-m1');
    expect(state?.status).toBe('completed'); // NOT downgraded to failed_checkpoint
    expect(state?.best_checkpoint_score).toBe(1); // MAX-retained, never lowered
  });
});
