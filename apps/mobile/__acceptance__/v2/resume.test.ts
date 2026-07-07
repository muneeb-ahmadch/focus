import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { getMissionState } from '@/db/repo/missions';
import { createProfile } from '@/db/repo/profile';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import type { ResumePayload } from '@/stores/playerStore';
import { playToEnd, playUntil, stepOnce, type DriveableStore, type PlayPlan } from './driver';

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

type StoreModule = typeof import('@/stores/playerStore');
type PlayerStore = StoreModule['usePlayerStore'];

let db: Db;
let store: PlayerStore;

async function importFreshStore(): Promise<PlayerStore> {
  const mod: StoreModule = await import('@/stores/playerStore');
  return mod.usePlayerStore;
}

// Process death: module registry (and the zustand store with it) is reborn; SQLite survives.
async function kill(): Promise<PlayerStore> {
  vi.resetModules();
  return importFreshStore();
}

function savedPayload(missionId: string): ResumePayload {
  const json = getMissionState(db, missionId)?.resume_payload_json;
  expect(json).toBeTruthy();
  return JSON.parse(json as string) as ResumePayload;
}

beforeEach(async () => {
  vi.resetModules();
  db = openTestDb();
  migrate(db);
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  h.db = db;
  h.today = '2026-07-06';
  store = await importFreshStore();
});

describe('mission persistence exists at all (v1 defect: no production caller ever created mission_state rows)', () => {
  it('startMission alone creates the row and marks it in_progress', () => {
    store.getState().startMission('r1-m1');
    const state = getMissionState(db, 'r1-m1');
    expect(state).toBeDefined();
    expect(state?.status).toBe('in_progress');
    expect(state?.resume_payload_json).toBeTruthy();
  });
});

describe('kill-and-resume', () => {
  it('kill mid-mission → resume restores the exact step, queue, and answers', async () => {
    let wrongUsed = false;
    const plan: PlayPlan = {
      correct(card) {
        if (!wrongUsed && card.kind === 'step' && card.step.type !== 'sequence') {
          wrongUsed = true;
          return false;
        }
        return true;
      },
    };

    store.getState().startMission('r1-m1');
    playUntil(store, plan, (s) => s.index >= 4 && s.phase === 'card');

    const before = store.getState();
    const snapshot = {
      index: before.index,
      queueIds: before.queue.map((c) => c.stepId),
      answers: before.answers,
    };
    expect(snapshot.answers.length).toBeGreaterThan(0);

    const payload = savedPayload('r1-m1');
    expect(payload.index).toBe(snapshot.index);
    expect(payload.queueIds).toEqual(snapshot.queueIds);
    expect(payload.answers).toEqual(snapshot.answers);

    const fresh = await kill();
    expect(fresh.getState().active).toBe(false);

    fresh.getState().startMission('r1-m1', payload);
    const after = fresh.getState();
    expect(after.index).toBe(snapshot.index);
    expect(after.queue.map((c) => c.stepId)).toEqual(snapshot.queueIds);
    expect(after.answers).toEqual(snapshot.answers);
    expect(after.inRepair).toBe(false);

    playToEnd(fresh, { correct: () => true });
    expect(getMissionState(db, 'r1-m1')?.status).toBe('completed');

    const attempts = db.all<{ status: string }>('SELECT status FROM attempt ORDER BY attempt_id');
    expect(attempts).toHaveLength(2);
    expect(attempts[1]?.status).toBe('submitted');
  });

  it('kill during repair → resume restores repair state and the original checkpoint score', async () => {
    const wrongs: string[] = [];
    const plan: PlayPlan = {
      correct(card, s) {
        if (
          !s.inRepair &&
          card.kind === 'checkpoint-q' &&
          wrongs.length < 2 &&
          !wrongs.includes(card.conceptId)
        ) {
          wrongs.push(card.conceptId);
          return false;
        }
        return true;
      },
    };

    store.getState().startMission('r1-m1');
    playUntil(store, plan, (s) => s.phase === 'repair-intro');
    stepOnce(store as DriveableStore, plan);
    playUntil(store, plan, (s) => s.inRepair && s.phase === 'card' && s.index >= 1);

    const payload = savedPayload('r1-m1');
    expect(payload.inRepair).toBe(true);
    expect(payload.originalCheckpointScore).toBe(0.6);

    const fresh = await kill();
    fresh.getState().startMission('r1-m1', payload);
    expect(fresh.getState().inRepair).toBe(true);
    expect(fresh.getState().originalCheckpointScore).toBe(0.6);
    expect(fresh.getState().queue.map((c) => c.stepId)).toEqual(payload.queueIds);

    playToEnd(fresh, { correct: () => true });
    const state = getMissionState(db, 'r1-m1');
    expect(state?.status).toBe('completed');
    expect(state?.best_checkpoint_score).toBe(0.6);
  });
});

describe('resume payloads that do not fit the mission start fresh instead of breaking the player', () => {
  const base: ResumePayload = {
    phase: 'card',
    index: 0,
    answers: [],
    checkpointAnswers: [],
    inRepair: false,
    queueIds: [],
  };

  it('unknown queue ids → fresh start (full queue, index 0)', () => {
    store.getState().startMission('r1-m1', { ...base, index: 1, queueIds: ['ghost-1', 'ghost-2'] });
    const s = store.getState();
    expect(s.active).toBe(true);
    expect(s.index).toBe(0);
    expect(s.queue.length).toBeGreaterThan(5);
  });

  it('index beyond the queue → fresh start', () => {
    store.getState().startMission('r1-m1');
    const realIds = store.getState().queue.map((c) => c.stepId);
    store.getState().abandon();

    store.getState().startMission('r1-m1', { ...base, index: 99, queueIds: realIds });
    const s = store.getState();
    expect(s.index).toBe(0);
    expect(s.queue.map((c) => c.stepId)).toEqual(realIds);
    expect(s.answers).toEqual([]);
  });
});
