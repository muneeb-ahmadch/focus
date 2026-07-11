// Slice v5 gate: failing must teach. Fail a checkpoint → the repair queue
// contains exactly the missed concepts (their teaching steps + the wrong
// questions re-quizzed) → pass the repair → the mission completes. Failing
// the re-quiz lands on CheckpointFailed with the missed concepts intact so
// its CTA can seed a drill from exactly those concepts.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMission, getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { getMissionState } from '@/db/repo/missions';
import { createProfile } from '@/db/repo/profile';
import { getAllReviewItems } from '@/db/repo/reviews';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { usePlayerStore } from '@/stores/playerStore';
import { playUntil, playToEnd, allCorrect, type PlayPlan } from '../v2/driver';

const h = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: () => {}, back: () => {}, push: () => {} },
}));
vi.mock('@/notifications/scheduler', () => ({ rescheduleAll: async () => {} }));

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  h.db = db;
  usePlayerStore.getState().abandon();
});

function checkpointConcepts(missionId: string): string[] {
  const mission = getMission(missionId);
  if (!mission) throw new Error(`no mission ${missionId}`);
  const checkpoint = mission.steps.find((s) => s.type === 'checkpoint');
  if (!checkpoint || checkpoint.type !== 'checkpoint') throw new Error('no checkpoint');
  return checkpoint.questions.map((q) => q.conceptId);
}

function failPlan(missConcepts: Set<string>): PlayPlan {
  return {
    correct: (card, state) =>
      !(card.kind === 'checkpoint-q' && !state.inRepair && missConcepts.has(card.conceptId)),
  };
}

describe('checkpoint fail → repair → pass → complete', () => {
  it('repair queue is exactly the missed concepts, then completion', () => {
    const concepts = checkpointConcepts('r1-m1');
    const missed = new Set(concepts.slice(0, 2));
    expect(missed.size).toBe(2);

    const store = usePlayerStore;
    store.getState().startMission('r1-m1');
    playUntil(store, failPlan(missed), (s) => s.phase === 'repair-intro');

    const repairQueue = store.getState().queue;
    const teachConcepts = new Set(
      repairQueue.filter((c) => c.kind === 'step').map((c) => c.conceptId),
    );
    const requizConcepts = new Set(
      repairQueue.filter((c) => c.kind === 'checkpoint-q').map((c) => c.conceptId),
    );
    expect(teachConcepts).toEqual(missed);
    expect(requizConcepts).toEqual(missed);
    expect(repairQueue.length).toBeGreaterThan(0);

    playToEnd(store, allCorrect);
    expect(getMissionState(db, 'r1-m1')?.status).toBe('completed');
  });

  it('missed concepts land in the review queue with origin wrong', () => {
    const concepts = checkpointConcepts('r1-m1');
    const missed = new Set(concepts.slice(0, 2));

    const store = usePlayerStore;
    store.getState().startMission('r1-m1');
    playUntil(store, failPlan(missed), (s) => s.phase === 'repair-intro');

    const items = getAllReviewItems(db);
    for (const concept of missed) {
      const item = items.find((r) => r.concept_id === concept);
      expect(item, `no review_item for missed concept ${concept}`).toBeDefined();
      expect(item!.origin_type).toBe('wrong');
      expect(item!.status).toBe('active');
    }
  });

  it('failing the repair re-quiz → failed phase, missed concepts retained, drill CTA seeds exactly them', () => {
    const concepts = checkpointConcepts('r1-m1');
    const missed = new Set(concepts.slice(0, 2));

    const alwaysMissPlan: PlayPlan = {
      correct: (card) => !(card.kind === 'checkpoint-q' && missConceptsHas(card.conceptId)),
    };
    function missConceptsHas(id: string): boolean {
      return missed.has(id);
    }

    const store = usePlayerStore;
    store.getState().startMission('r1-m1');
    playUntil(store, alwaysMissPlan, (s) => s.phase === 'failed');

    expect(getMissionState(db, 'r1-m1')?.status).toBe('failed_checkpoint');
    const retained = [...store.getState().missedConcepts].sort();
    expect(retained).toEqual([...missed].sort());

    store.getState().startDrill(retained);
    const s = store.getState();
    expect(s.mode).toBe('drill');
    expect(s.active).toBe(true);
    const drillConcepts = new Set(s.queue.map((c) => c.conceptId));
    expect(drillConcepts).toEqual(missed);
  });
});
