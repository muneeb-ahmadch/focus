// Slice v6 gate: effort earns XP. Completing a mission writes a deterministic
// XP award into the daily_activity ledger and hands it to MissionComplete;
// drills and rehab clears append to the same ledger, and the total is the sum.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { XP_MISSION_BASE, XP_PER_DRILL_CORRECT, XP_PERFECT_BONUS, XP_REHAB_CLEAR } from '@focus/engine';
import { getMission, getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { addXp, getTotalXp } from '@/db/repo/activity';
import { createProfile } from '@/db/repo/profile';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { todayLocal } from '@/lib/clock';
import { usePlayerStore } from '@/stores/playerStore';
import { allCorrect, playToEnd, playUntil } from '../v2/driver';

const h = vi.hoisted(() => ({
  db: null as unknown,
  replace: vi.fn(),
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: h.replace, back: () => {}, push: () => {} },
}));
vi.mock('@/notifications/scheduler', () => ({ rescheduleAll: async () => {} }));

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  h.db = db;
  h.replace.mockClear();
  usePlayerStore.getState().abandon();
});

function teachingConcepts(missionId: string): string[] {
  const mission = getMission(missionId);
  if (!mission) throw new Error(`no mission ${missionId}`);
  return [...new Set(mission.steps.filter((s) => s.type !== 'checkpoint').map((s) => s.conceptId))];
}

describe('XP ledger', () => {
  it('fresh install has zero XP and the ledger column exists', () => {
    expect(getTotalXp(db)).toBe(0);
    addXp(db, todayLocal(), 25);
    addXp(db, todayLocal(), 5);
    expect(getTotalXp(db)).toBe(30);
  });

  it('non-positive awards are ignored', () => {
    addXp(db, todayLocal(), 0);
    addXp(db, todayLocal(), -10);
    expect(getTotalXp(db)).toBe(0);
  });

  it('perfect mission → base + bonus in the ledger and in the MissionComplete params', () => {
    const store = usePlayerStore;
    store.getState().startMission('r1-m1');
    playToEnd(store, allCorrect);

    const want = XP_MISSION_BASE + XP_PERFECT_BONUS;
    expect(getTotalXp(db)).toBe(want);

    expect(h.replace).toHaveBeenCalledTimes(1);
    const arg = h.replace.mock.calls[0][0] as { pathname: string; params: { xp: string } };
    expect(arg.pathname).toBe('/mission-complete');
    expect(arg.params.xp).toBe(String(want));
  });

  it('drill correct answers append to the ledger', () => {
    const concepts = teachingConcepts('r1-m1').slice(0, 2);
    const store = usePlayerStore;
    store.getState().startDrill(concepts);
    const queueLen = store.getState().queue.length;
    expect(queueLen).toBeGreaterThan(0);
    playToEnd(store, allCorrect);

    expect(getTotalXp(db)).toBe(queueLen * XP_PER_DRILL_CORRECT);
  });

  it('rehab clear appends the clear award; a failed rehab appends nothing', () => {
    const concepts = teachingConcepts('r1-m1');
    const store = usePlayerStore;

    store.getState().startRehab(concepts[0]!);
    playUntil(store, allCorrect, (s) => s.phase === 'rehab-summary');
    expect(store.getState().rehabCleared).toBe(true);
    expect(getTotalXp(db)).toBe(XP_REHAB_CLEAR);
    store.getState().dismiss();

    store.getState().startRehab(concepts[1] ?? concepts[0]!);
    playUntil(store, { correct: () => false }, (s) => s.phase === 'rehab-summary');
    expect(store.getState().rehabCleared).toBe(false);
    expect(getTotalXp(db)).toBe(XP_REHAB_CLEAR);
  });
});
